import { describe, expect, it } from "vitest";
import { processTimedJobs } from "../gameClock";
import { useCrewStore } from "../../stores/crewStore";
import { useGameStore } from "../../stores/gameStore";
import { useJobStore } from "../../stores/jobStore";
import { usePolicyStore } from "../../stores/policyStore";
import { useShipInteriorStore } from "../../stores/shipInteriorStore";
import { createDefaultPolicyState } from "../../data/policies";
import { GAME_TIME } from "../../data/constants";

// Multi-tick integration scenario: drive processTimedJobs the same way the real
// game loop (useGameClock's setInterval effect) does, across many ticks, using
// the stores' real default state (no mocking). This is a characterization test
// for cross-store orchestration, not a determinism test — Math.random is left
// live on purpose to exercise crisis-spawn / injury / combat-adjacent branches.
describe("gameClock.processTimedJobs multi-tick integration", () => {
  it("runs 30 ticks of 15 game-minutes without throwing, keeping room stats in range and activities in sync with crew", () => {
    const TICKS = 30;
    const DELTA_MINUTES = 15;

    expect(() => {
      for (let tick = 0; tick < TICKS; tick += 1) {
        useGameStore.getState().advanceMinutes(DELTA_MINUTES);
        processTimedJobs(DELTA_MINUTES);
      }
    }).not.toThrow();

    // Game clock advanced by the expected total amount.
    const expectedMinute = GAME_TIME.START_MINUTE + TICKS * DELTA_MINUTES;
    expect(useGameStore.getState().currentMinute).toBe(expectedMinute);

    // Every room's condition/load must stay within the valid [0, 100] range.
    const rooms = useShipInteriorStore.getState().rooms;
    Object.values(rooms).forEach((room) => {
      expect(room.condition).toBeGreaterThanOrEqual(0);
      expect(room.condition).toBeLessThanOrEqual(100);
      expect(room.load).toBeGreaterThanOrEqual(0);
      expect(room.load).toBeLessThanOrEqual(100);
    });

    // crewActivities is produced 1:1 for every crew member (alive or dead).
    const crewState = useCrewStore.getState();
    expect(crewState.crewActivities).toHaveLength(crewState.crew.length);
    const activityMemberIds = crewState.crewActivities.map((activity) => activity.memberId).sort();
    const crewIds = crewState.crew.map((member) => member.id).sort();
    expect(activityMemberIds).toEqual(crewIds);

    // Resources stay within their normalized bounds (percent resources clamp to [0,100]).
    const resources = useGameStore.getState().resources;
    expect(resources.fuel).toBeGreaterThanOrEqual(0);
    expect(resources.fuel).toBeLessThanOrEqual(100);
    expect(resources.oxygen).toBeGreaterThanOrEqual(0);
    expect(resources.oxygen).toBeLessThanOrEqual(100);
    expect(resources.hull).toBeGreaterThanOrEqual(0);
    expect(resources.hull).toBeLessThanOrEqual(100);
    expect(resources.credits).toBeGreaterThanOrEqual(0);
  });
});

// Phase 19-A: the policy system's foundation must not change gameplay by
// itself — every catalog policy defaults to disabled (data/policies.js), and
// gameClock.processPolicies only ever forwards `logs` from
// policyEngine.evaluatePolicies, never `actions`. This block proves that
// characterization holds across a real multi-tick run, not just in isolated
// unit tests of policyStore/policyEngine.
describe("gameClock.processTimedJobs with the policy system introduced (Phase 19-A)", () => {
  it("policyStore initializes with every policy disabled at its catalog default", () => {
    expect(usePolicyStore.getState().policies).toEqual(createDefaultPolicyState());
  });

  it("30 ticks with all policies at their default OFF state produce zero policy-originated logs, even with hull critically low", () => {
    // auto-hull-repair's default threshold is 40; force hull below that so
    // the *only* thing preventing a diagnostic log is the policy being
    // disabled, not the condition never being met.
    useGameStore.setState((state) => ({ resources: { ...state.resources, hull: 15 } }));
    expect(usePolicyStore.getState().policies["auto-hull-repair"].enabled).toBe(false);

    const TICKS = 30;
    const DELTA_MINUTES = 15;
    for (let tick = 0; tick < TICKS; tick += 1) {
      useGameStore.getState().advanceMinutes(DELTA_MINUTES);
      processTimedJobs(DELTA_MINUTES);
    }

    const logs = useGameStore.getState().logs;
    expect(logs.some((message) => message.includes("정책"))).toBe(false);

    // policyStore itself is untouched by ticking — nothing in processPolicies
    // ever calls a policyStore setter.
    expect(usePolicyStore.getState().policies).toEqual(createDefaultPolicyState());
  });

  it("enabling auto-hull-repair only ever adds a diagnostic log — it never enqueues a repair job itself (actions are inert in 19-A)", () => {
    useGameStore.setState((state) => ({ resources: { ...state.resources, hull: 10 } }));
    usePolicyStore.getState().setPolicyEnabled("auto-hull-repair", true);

    useGameStore.getState().advanceMinutes(15);
    processTimedJobs(15);

    // The diagnostic log fired...
    expect(useGameStore.getState().logs.some((message) => message.includes("정책 진단"))).toBe(true);
    // ...but no hull_repair job was ever enqueued as a side effect of the
    // policy — 19-A's processPolicies only forwards `logs`, never `actions`.
    expect(useJobStore.getState().jobs.some((job) => job.type === "hull_repair")).toBe(false);

    // Reset for any tests that may run after this one in the same file.
    usePolicyStore.getState().setPolicyEnabled("auto-hull-repair", false);
  });
});
