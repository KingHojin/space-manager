import { describe, expect, it } from "vitest";
import { getSectorObjective, getSectorProfile } from "../campaignProgression";
import { generateSector } from "../navigationSystem";

describe("Phase 22-B sector progression", () => {
  it.each([
    [0, 1, 3],
    [1, 1, 4],
    [2, 2, 5],
    [3, 3, 6],
    [4, 4, 7],
  ])("scales sector %i field danger inside %i-%i while keeping the station safe", (sectorIndex, floor, ceiling) => {
    const sector = generateSector("danger-band", { sectorIndex, nodeCount: 14 });
    const station = sector.nodes.find((node) => node.type === "station");
    const fieldNodes = sector.nodes.filter((node) => node.type !== "station");
    expect(station.danger).toBe(1);
    expect(fieldNodes.every((node) => node.danger >= floor && node.danger <= ceiling)).toBe(true);
    expect(sector.nodes.find((node) => node.type === "exit").danger).toBe(ceiling);
  });

  it("remains deterministic for the same seed and sector index", () => {
    const first = generateSector("campaign-seed", { sectorIndex: 3 });
    const second = generateSector("campaign-seed", { sectorIndex: 3 });
    expect(second).toEqual(first);
  });

  it("preserves the legacy numeric second argument as nodeCount", () => {
    const sector = generateSector("legacy-node-count", 8);
    expect(sector.nodes).toHaveLength(8);
    expect(sector.sectorIndex).toBe(0);
    expect(sector.difficulty.sectorNumber).toBe(1);
  });

  it("generates exactly one primary exit gate per sector", () => {
    const sector = generateSector("single-primary-gate", { sectorIndex: 4, nodeCount: 14 });
    expect(sector.nodes.filter((node) => node.type === "exit")).toHaveLength(1);
  });

  it("generates a completable objective across a broad seed and sector sample", () => {
    for (let sectorIndex = 0; sectorIndex < 5; sectorIndex += 1) {
      for (let seedIndex = 0; seedIndex < 250; seedIndex += 1) {
        const sector = generateSector(`property-${sectorIndex}-${seedIndex}`, { sectorIndex });
        const fields = sector.nodes.filter((node) => node.type !== "station" && node.type !== "exit");
        const objective = getSectorObjective({
          sector,
          sectorIndex,
          visited: sector.nodes.map((node) => node.id),
          campaign: { status: "active" },
        });
        expect(fields.length).toBeGreaterThanOrEqual(objective.requiredFieldVisits);
        expect(fields.some((node) => node.danger >= objective.dangerThreshold)).toBe(true);
        expect(objective.gateUnlocked).toBe(true);
      }
    }
  });

  it("raises both the reward multiplier and enemy ceiling across the expedition", () => {
    const first = getSectorProfile(0);
    const last = getSectorProfile(4);
    expect(first.enemyRiskCeiling).toBe(4);
    expect(last.enemyRiskCeiling).toBe(7);
    expect(last.rewardMultiplier).toBeGreaterThan(first.rewardMultiplier);
    expect(last.gateRewardCredits).toBeGreaterThan(first.gateRewardCredits);
  });
});

describe("sector objective", () => {
  const sector = {
    nodes: [
      { id: "station", type: "station", danger: 1 },
      { id: "a", type: "debris", danger: 1 },
      { id: "b", type: "nebula", danger: 2 },
      { id: "c", type: "unknown", danger: 3 },
      { id: "gate", type: "exit", danger: 3 },
    ],
  };

  it("keeps the gate locked until both field-count and danger conditions are met", () => {
    const countOnly = getSectorObjective({ sector, sectorIndex: 0, visited: ["station", "a", "b", "gate"] });
    expect(countOnly.visitConditionMet).toBe(false);
    expect(countOnly.dangerConditionMet).toBe(false);
    expect(countOnly.gateUnlocked).toBe(false);

    const complete = getSectorObjective({ sector, sectorIndex: 0, visited: ["station", "a", "b", "c"] });
    expect(complete.visitConditionMet).toBe(true);
    expect(complete.dangerConditionMet).toBe(true);
    expect(complete.gateUnlocked).toBe(true);
  });

  it("reports a completed expedition separately from defeat", () => {
    const objective = getSectorObjective({ sector, sectorIndex: 4, visited: [], campaign: { status: "completed" } });
    expect(objective.expeditionCompleted).toBe(true);
    expect(objective.gateUnlocked).toBe(false);
    expect(objective.progressPercent).toBe(100);
  });

  it("clamps legacy field-count requirements to the nodes that actually exist", () => {
    const legacy = {
      nodes: [
        { id: "station", type: "station", danger: 1 },
        { id: "only-field", type: "debris", danger: 1 },
        { id: "gate", type: "exit", danger: 5 },
      ],
    };
    const objective = getSectorObjective({ sector: legacy, sectorIndex: 4, visited: ["station", "only-field", "gate"], campaign: { status: "active" } });
    expect(objective.requiredFieldVisits).toBe(1);
    expect(objective.dangerThreshold).toBe(1);
    expect(objective.gateUnlocked).toBe(true);
  });

  it("keeps even a malformed legacy sector with no field nodes completable", () => {
    const legacy = { nodes: [{ id: "station", type: "station", danger: 1 }, { id: "gate", type: "exit", danger: 5 }] };
    const objective = getSectorObjective({ sector: legacy, sectorIndex: 4, visited: ["station", "gate"], campaign: { status: "active" } });
    expect(objective.requiredFieldVisits).toBe(0);
    expect(objective.dangerConditionMet).toBe(true);
    expect(objective.gateUnlocked).toBe(true);
  });
});
