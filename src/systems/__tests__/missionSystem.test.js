import { describe, expect, it } from "vitest";
import {
  acceptMissionRecord,
  canAcceptMission,
  completeMissionRecord,
  failMissionRecord,
  generateMissionBoard,
  instantiateMission,
  normalizeMissionRecord,
} from "../missionSystem";
import { MISSION_STATUS, MISSION_TEMPLATES } from "../../data/missions";

const sector = {
  nodes: [
    { id: "start", type: "station", danger: 1, richness: 1, connections: ["node-a", "node-b"], discovered: true },
    { id: "node-a", type: "wreck", danger: 3, richness: 2, connections: ["start"], discovered: true },
    { id: "node-b", type: "nebula", danger: 2, richness: 3, connections: ["start"], discovered: true },
  ],
};

describe("generateMissionBoard determinism", () => {
  it("produces an identical board for the same seed/currentMinute/currentNodeId inputs", () => {
    const boardA = generateMissionBoard({ sector, currentNodeId: "start", currentMinute: 0, seed: "fixed-seed", count: 3 });
    const boardB = generateMissionBoard({ sector, currentNodeId: "start", currentMinute: 0, seed: "fixed-seed", count: 3 });
    expect(boardB).toEqual(boardA);
  });

  it("produces a different board when the seed changes", () => {
    const boardA = generateMissionBoard({ sector, currentNodeId: "start", currentMinute: 0, seed: "seed-one", count: 3 });
    const boardB = generateMissionBoard({ sector, currentNodeId: "start", currentMinute: 0, seed: "seed-two", count: 3 });
    expect(boardB).not.toEqual(boardA);
  });

  it("never returns more missions than requested, and never repeats a template id", () => {
    const board = generateMissionBoard({ sector, currentNodeId: "start", currentMinute: 0, seed: "count-test", count: 3 });
    expect(board.length).toBeLessThanOrEqual(3);
    const templateIds = board.map((mission) => mission.templateId);
    expect(new Set(templateIds).size).toBe(templateIds.length);
  });

  it("excludes mission ids listed in excludeMissionIds", () => {
    const full = generateMissionBoard({ sector, currentNodeId: "start", currentMinute: 0, seed: "exclude-test", count: 3 });
    const excludeIds = full.map((mission) => mission.id);
    const filtered = generateMissionBoard({ sector, currentNodeId: "start", currentMinute: 0, seed: "exclude-test", count: 3, excludeMissionIds: excludeIds });
    filtered.forEach((mission) => expect(excludeIds).not.toContain(mission.id));
  });
});

describe("instantiateMission reward scaling direction", () => {
  const template = MISSION_TEMPLATES.find((entry) => entry.risk === "low") ?? MISSION_TEMPLATES[0];

  it("scales numeric (non-chance) reward fields upward for a higher-danger destination", () => {
    const lowDangerDest = { id: "low", danger: 1, richness: 1 };
    const highDangerDest = { id: "high", danger: 5, richness: 1 };
    const lowMission = instantiateMission(template, { destination: lowDangerDest, seed: "s", index: 0 });
    const highMission = instantiateMission(template, { destination: highDangerDest, seed: "s", index: 0 });
    const numericKey = Object.entries(template.reward).find(([key, value]) => typeof value === "number" && !/Chance$/.test(key))?.[0];
    if (numericKey) {
      expect(highMission.reward[numericKey]).toBeGreaterThanOrEqual(lowMission.reward[numericKey]);
    }
  });

  it("scales a higher-risk template's reward above a lower-risk template for the same destination", () => {
    const lowRiskTemplate = MISSION_TEMPLATES.find((entry) => entry.risk === "low");
    const highRiskTemplate = MISSION_TEMPLATES.find((entry) => entry.risk === "extreme") ?? MISSION_TEMPLATES.find((entry) => entry.risk === "high");
    if (lowRiskTemplate && highRiskTemplate) {
      const destination = { id: "d", danger: 2, richness: 2 };
      const lowMission = instantiateMission(lowRiskTemplate, { destination, seed: "s", index: 0 });
      const highMission = instantiateMission(highRiskTemplate, { destination, seed: "s", index: 0 });
      const key = Object.keys(lowRiskTemplate.reward).find((k) => typeof lowRiskTemplate.reward[k] === "number" && typeof highRiskTemplate.reward[k] === "number" && !/Chance$/.test(k));
      if (key) expect(highMission.reward[key]).toBeGreaterThan(lowMission.reward[key]);
    }
  });

  it("keeps chance-suffixed reward fields within [0, 0.95]", () => {
    const destination = { id: "d", danger: 6, richness: 6 };
    const templateWithChance = MISSION_TEMPLATES.find((entry) => Object.keys(entry.reward).some((key) => /Chance$/.test(key)));
    if (templateWithChance) {
      const mission = instantiateMission(templateWithChance, { destination, seed: "s", index: 0 });
      Object.entries(mission.reward).forEach(([key, value]) => {
        if (/Chance$/.test(key)) {
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(0.95);
        }
      });
    }
  });
});

describe("normalizeMissionRecord", () => {
  it("returns null when the mission has no id", () => {
    expect(normalizeMissionRecord(null)).toBeNull();
    expect(normalizeMissionRecord({})).toBeNull();
  });

  it("falls back to MISSION_STATUS.offered for an invalid status", () => {
    const normalized = normalizeMissionRecord({ id: "m-1", status: "not-a-status" });
    expect(normalized.status).toBe(MISSION_STATUS.offered);
  });

  it("preserves a valid status", () => {
    const normalized = normalizeMissionRecord({ id: "m-1", status: MISSION_STATUS.active });
    expect(normalized.status).toBe(MISSION_STATUS.active);
  });
});

describe("canAcceptMission", () => {
  it("rejects when the mission cannot be found/normalized", () => {
    expect(canAcceptMission({ mission: null, vesselId: "v1" })).toMatchObject({ ok: false, reason: "notFound" });
  });

  it("rejects when the mission is not in the offered state", () => {
    const mission = { id: "m-1", status: MISSION_STATUS.active };
    expect(canAcceptMission({ mission, vesselId: "v1" })).toMatchObject({ ok: false, reason: "notOffered" });
  });

  it("rejects when there is no vesselId", () => {
    const mission = { id: "m-1", status: MISSION_STATUS.offered };
    expect(canAcceptMission({ mission, vesselId: null })).toMatchObject({ ok: false, reason: "missingVesselId" });
  });

  it("rejects when the vessel already has an active mission", () => {
    const mission = { id: "m-1", status: MISSION_STATUS.offered };
    const activeMissions = [{ vesselId: "v1", status: MISSION_STATUS.active }];
    expect(canAcceptMission({ mission, vesselId: "v1", activeMissions })).toMatchObject({ ok: false, reason: "vesselBusy" });
  });

  it("rejects when reputation requirement is not met", () => {
    const mission = { id: "m-1", status: MISSION_STATUS.offered, risk: "extreme" };
    expect(canAcceptMission({ mission, vesselId: "v1", availableReputation: 0 })).toMatchObject({ ok: false, reason: "reputationLocked" });
  });

  it("accepts when all conditions are satisfied", () => {
    const mission = { id: "m-1", status: MISSION_STATUS.offered, risk: "low" };
    expect(canAcceptMission({ mission, vesselId: "v1", availableReputation: 0 })).toMatchObject({ ok: true });
  });
});

describe("mission lifecycle transitions", () => {
  it("acceptMissionRecord sets status=active, vesselId, and acceptedAt", () => {
    const mission = { id: "m-1", status: MISSION_STATUS.offered };
    const accepted = acceptMissionRecord(mission, { vesselId: "v1", currentMinute: 100 });
    expect(accepted).toMatchObject({ status: MISSION_STATUS.active, vesselId: "v1", acceptedAt: 100 });
  });

  it("acceptMissionRecord returns null without a vesselId", () => {
    expect(acceptMissionRecord({ id: "m-1" }, {})).toBeNull();
  });

  it("completeMissionRecord sets status=completed and completedAt", () => {
    const mission = { id: "m-1", status: MISSION_STATUS.active };
    const completed = completeMissionRecord(mission, { currentMinute: 200 });
    expect(completed).toMatchObject({ status: MISSION_STATUS.completed, completedAt: 200 });
  });

  it("failMissionRecord sets status=failed, failedAt, and failureReason", () => {
    const mission = { id: "m-1", status: MISSION_STATUS.active };
    const failed = failMissionRecord(mission, { currentMinute: 300, reason: "combat_loss" });
    expect(failed).toMatchObject({ status: MISSION_STATUS.failed, failedAt: 300, failureReason: "combat_loss" });
  });
});
