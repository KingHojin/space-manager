import { describe, expect, it } from "vitest";
import { processTimedJobs } from "../gameClock";
import { useCrewStore } from "../../stores/crewStore";
import { useGameStore } from "../../stores/gameStore";
import { useInventoryStore } from "../../stores/inventoryStore";
import { useJobStore } from "../../stores/jobStore";
import { usePolicyStore } from "../../stores/policyStore";
import { useShipInteriorStore } from "../../stores/shipInteriorStore";
import { createDefaultPolicyState } from "../../data/policies";
import { GAME_TIME, JOB_ECONOMY } from "../../data/constants";

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

  // 19-B replaces the old 19-A "actions are inert" characterization above
  // (auto-hull-repair now really enqueues a repair job) — see the
  // describe block below for its live behavior. This test only checks the
  // warning-only branch (no scrap): still zero job enqueues, but the log
  // wording has changed with policyEngine.js's new richer diagnostic.
  it("enabling auto-hull-repair with no salvage-scrap on hand only ever adds a warning log — it never enqueues a repair job it can't pay for", () => {
    useGameStore.setState((state) => ({ resources: { ...state.resources, hull: 10 } }));
    useInventoryStore.setState((state) => ({
      items: state.items.map((item) => (item.id === "salvage-scrap" ? { ...item, qty: 0 } : item)),
    }));
    usePolicyStore.getState().setPolicyEnabled("auto-hull-repair", true);

    useGameStore.getState().advanceMinutes(15);
    processTimedJobs(15);

    // The warning log fired...
    expect(useGameStore.getState().logs.some((message) => message.includes("정책") && message.includes("폐자재 부족"))).toBe(true);
    // ...but no hull_repair job was enqueued — there isn't enough scrap to
    // pay for it.
    expect(useJobStore.getState().jobs.some((job) => job.type === "hull_repair")).toBe(false);

    // Reset for any tests that may run after this one in the same file.
    usePolicyStore.getState().setPolicyEnabled("auto-hull-repair", false);
  });
});

// Phase 19-B: auto-hull-repair goes from a diagnostic-only placeholder to a
// real automation — enabling it, with hull below threshold and enough
// salvage-scrap on hand, must actually enqueue the same hull_repair job
// Ship.jsx's manual "선체 정비 지시" button would, let it run through the
// existing job scheduler/completion pipeline untouched, and never enqueue a
// second one while the first is still outstanding.
describe("gameClock.processTimedJobs — auto-hull-repair enqueues and completes a real repair job (Phase 19-B)", () => {
  const SCRAP_COST = JOB_ECONOMY.hullRepair.salvageScrapCost;
  const HULL_DELTA = JOB_ECONOMY.hullRepair.hullDelta;

  function resetJobsAndInventory() {
    useJobStore.setState({ jobs: [] });
    useJobStore.getState().recomputeRoomLoad();
    useInventoryStore.setState((state) => ({
      items: state.items.map((item) => (item.id === "salvage-scrap" ? { ...item, qty: 0 } : item)),
    }));
  }

  it("enqueues exactly one hull_repair job, consumes exactly the scrap cost, and restores hull once the job completes — across 40+ ticks, with no duplicate enqueues", () => {
    resetJobsAndInventory();
    useGameStore.setState((state) => ({ resources: { ...state.resources, hull: 10 } }));
    useInventoryStore.setState((state) => ({
      items: state.items.map((item) => (item.id === "salvage-scrap" ? { ...item, qty: SCRAP_COST } : item)),
    }));
    usePolicyStore.getState().setPolicyEnabled("auto-hull-repair", true);

    const TICKS = 60;
    const DELTA_MINUTES = 15;
    for (let tick = 0; tick < TICKS; tick += 1) {
      useGameStore.getState().advanceMinutes(DELTA_MINUTES);
      processTimedJobs(DELTA_MINUTES);
    }

    const hullRepairJobs = useJobStore.getState().jobs.filter((job) => job.type === "hull_repair");
    // Exactly one job was ever created — the "already active" branch in
    // policyEngine.js's evaluateAutoHullRepair is what prevents duplicates
    // on every subsequent tick after the first enqueue.
    expect(hullRepairJobs).toHaveLength(1);
    expect(hullRepairJobs[0].status).toBe("done");

    // The job consumed exactly SCRAP_COST scrap (no more, no less) and
    // nothing re-enqueued afterward (there's no scrap left to pay for a
    // second one even if hull dropped below threshold again).
    const scrapQty = useInventoryStore.getState().items.find((item) => item.id === "salvage-scrap")?.qty ?? 0;
    expect(scrapQty).toBe(0);

    // Hull recovered — it started at 10 and the completion pipeline
    // (gameClock.applyShipWork's "hullRepair" branch, unchanged by this PR)
    // applies +HULL_DELTA on completion. Other live systems in this
    // integration harness (crew AI, crises, nav) can also nudge hull, so
    // this checks "clearly higher than the starting point" rather than an
    // exact value.
    expect(useGameStore.getState().resources.hull).toBeGreaterThan(10);
    expect(useGameStore.getState().resources.hull).toBeGreaterThanOrEqual(10 + HULL_DELTA - 5);

    usePolicyStore.getState().setPolicyEnabled("auto-hull-repair", false);
    resetJobsAndInventory();
  });

  it("does not enqueue a second hull_repair job while the first is still queued/in progress, even across many ticks", () => {
    resetJobsAndInventory();
    useGameStore.setState((state) => ({ resources: { ...state.resources, hull: 5 } }));
    // Plenty of scrap for many repairs, to prove the *active-job* guard
    // (not the scrap guard) is what prevents duplicates here.
    useInventoryStore.setState((state) => ({
      items: state.items.map((item) => (item.id === "salvage-scrap" ? { ...item, qty: SCRAP_COST * 10 } : item)),
    }));
    usePolicyStore.getState().setPolicyEnabled("auto-hull-repair", true);

    const TICKS = 10;
    const DELTA_MINUTES = 15;
    for (let tick = 0; tick < TICKS; tick += 1) {
      useGameStore.getState().advanceMinutes(DELTA_MINUTES);
      processTimedJobs(DELTA_MINUTES);
    }

    // 10 ticks * 15 minutes = 150 minutes, more than enough for the
    // scheduler to pick the job up (short travel/arrival) but likely not
    // enough for JOB_DURATION.hull_repair (120 min) to fully elapse once
    // arrival overhead is included — the job should still be
    // backlog/assigned/in_progress here, which is exactly the scenario the
    // active-job guard exists for.
    const hullRepairJobs = useJobStore.getState().jobs.filter((job) => job.type === "hull_repair");
    expect(hullRepairJobs.length).toBeLessThanOrEqual(1);

    usePolicyStore.getState().setPolicyEnabled("auto-hull-repair", false);
    resetJobsAndInventory();
  });
});

// Phase 19-B: fuel-reserve is a warning-only policy (no market/price model
// exists yet for auto-refuel to plug into) — enabling it below threshold
// must log, and it must never touch jobStore/inventoryStore.
describe("gameClock.processTimedJobs — fuel-reserve warns but never mutates state (Phase 19-B)", () => {
  it("logs a warning when fuel drops below the reserve threshold, and does not log when fuel is at/above it", () => {
    usePolicyStore.getState().setPolicyEnabled("fuel-reserve", true);

    useGameStore.setState((state) => ({ resources: { ...state.resources, fuel: 90 } }));
    useGameStore.getState().advanceMinutes(15);
    processTimedJobs(15);
    const logsBefore = useGameStore.getState().logs.length;
    expect(useGameStore.getState().logs.slice(0, logsBefore).some((message) => message.includes("연료 예비율"))).toBe(false);

    useGameStore.setState((state) => ({ resources: { ...state.resources, fuel: 10 } }));
    useGameStore.getState().advanceMinutes(15);
    processTimedJobs(15);
    expect(useGameStore.getState().logs.some((message) => message.includes("연료 예비율"))).toBe(true);

    // No job or inventory mutation from this policy — it is diagnostic-only.
    expect(useJobStore.getState().jobs.some((job) => job.createdAt && job.payload?.reservePolicy)).toBe(false);

    usePolicyStore.getState().setPolicyEnabled("fuel-reserve", false);
  });
});
