import { describe, expect, it } from "vitest";
import { validateSkillReset } from "../skillReset";

const base = () => ({
  nav: { sectorIndex: 2, currentNodeId: "dock", sector: { nodes: [{ id: "dock", type: "station" }] }, travel: null, driftState: null },
  skills: { lastResetSectorIndex: -1 }, combat: { combatByVesselId: {} },
  missions: { activeByVesselId: {}, pendingMissionEncountersByVesselId: {} }, jobs: { jobs: [] },
  exploration: { pendingCombatEncounter: null },
});

describe("skill reset validation", () => {
  it("allows a docked reset once per sector and a later sector unlocks it", () => {
    expect(validateSkillReset(base())).toEqual({ ok: true, sectorIndex: 2 });
    expect(validateSkillReset({ ...base(), skills: { lastResetSectorIndex: 2 } }).reason).toBe("alreadyResetThisSector");
    expect(validateSkillReset({ ...base(), nav: { ...base().nav, sectorIndex: 3 }, skills: { lastResetSectorIndex: 2 } }).ok).toBe(true);
  });

  it.each([
    ["traveling", { nav: { ...base().nav, travel: {} } }],
    ["drifting", { nav: { ...base().nav, driftState: {} } }],
    ["notStation", { nav: { ...base().nav, currentNodeId: "field", sector: { nodes: [{ id: "field", type: "planet" }] } } }],
    ["activeCombat", { combat: { combatByVesselId: { ship: {} } } }],
    ["activeMission", { missions: { activeByVesselId: { ship: {} }, pendingMissionEncountersByVesselId: {} } }],
    ["pendingMissionEncounter", { missions: { activeByVesselId: {}, pendingMissionEncountersByVesselId: { ship: {} } } }],
    ["pendingCombat", { exploration: { pendingCombatEncounter: {} } }],
    ["activeJob", { jobs: { jobs: [{ type: "training", status: "backlog" }] } }],
    ["activeJob", { jobs: { jobs: [{ type: "hull_repair", status: "in_progress" }] } }],
  ])("blocks %s", (reason, override) => {
    expect(validateSkillReset({ ...base(), ...override }).reason).toBe(reason);
  });

  it("does not block unrelated or completed jobs", () => {
    const state = base();
    state.jobs.jobs = [{ type: "salvage", status: "in_progress" }, { type: "training", status: "done" }];
    expect(validateSkillReset(state).ok).toBe(true);
  });
});
