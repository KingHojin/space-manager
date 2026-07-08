import { describe, expect, it } from "vitest";
import { processTimedJobs } from "../gameClock";
import { isHealthy, TREATMENT_RULES } from "../injurySystem";
import { createInitialRoomState } from "../roomJobs";
import { useCrewStore } from "../../stores/crewStore";
import { useExplorationStore } from "../../stores/explorationStore";
import { useGameStore } from "../../stores/gameStore";
import { useInventoryStore } from "../../stores/inventoryStore";
import { useJobStore } from "../../stores/jobStore";
import { useNavStore } from "../../stores/navStore";
import { usePolicyStore } from "../../stores/policyStore";
import { useReportStore } from "../../stores/reportStore";
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

// Phase 19-C: auto-treatment goes from a recognized-but-inert catalog entry
// to a real automation — enabling it, with an injured crew member above
// minSeverity and enough credits, must actually enqueue the same treatment
// job Crew.jsx's "치료" button would (same TREATMENT_RULES numbers via
// systems/injurySystem.js's treatmentRule), let it run through the existing
// unified job pipeline untouched (scheduler -> completeReadyJobs ->
// completeTreatmentJob), and never enqueue a second one while the first is
// still outstanding.
describe("gameClock.processTimedJobs — auto-treatment enqueues and completes a real treatment job (Phase 19-C)", () => {
  const MINOR = TREATMENT_RULES.minor;
  const INJURED_MEMBER_ID = "gunner-kang";

  function resetCrewJobsAndCredits(injury = "healthy") {
    useJobStore.setState({ jobs: [] });
    useJobStore.getState().recomputeRoomLoad();
    useCrewStore.setState((state) => ({
      crew: state.crew.map((member) => (member.id === INJURED_MEMBER_ID ? { ...member, alive: true, injury } : member)),
    }));
    useGameStore.setState((state) => ({ resources: { ...state.resources, credits: 5000 } }));
  }

  it("enqueues exactly one treatment job, spends exactly the treatment cost, and heals the crew member once the job completes — across many ticks, with no duplicate enqueues", () => {
    resetCrewJobsAndCredits("minor");
    usePolicyStore.getState().setPolicyEnabled("auto-treatment", true);

    const creditsBefore = useGameStore.getState().resources.credits;
    const TICKS = 40;
    const DELTA_MINUTES = 15;
    for (let tick = 0; tick < TICKS; tick += 1) {
      useGameStore.getState().advanceMinutes(DELTA_MINUTES);
      processTimedJobs(DELTA_MINUTES);
    }

    const treatmentJobs = useJobStore.getState().jobs.filter((job) => job.type === "treatment" && job.payload?.targetCrewId === INJURED_MEMBER_ID);
    // Exactly one job was ever created for this member — the busy-check in
    // policyEngine.js's evaluateAutoTreatment is what prevents duplicates on
    // every subsequent tick after the first enqueue.
    expect(treatmentJobs).toHaveLength(1);
    expect(treatmentJobs[0].status).toBe("done");
    expect(treatmentJobs[0].cost).toBe(MINOR.cost);

    // Credits were debited by exactly the treatment cost (gameStore.spendCredits
    // in gameClock.js's applyPolicyActions, mirroring Crew.jsx's treat()).
    expect(useGameStore.getState().resources.credits).toBe(creditsBefore - MINOR.cost);

    // The crew member recovered — completeTreatmentJob (unchanged by this PR)
    // improves the injury by one stage on completion, and "minor" also
    // recovers naturally over the same window, so either path lands here at
    // healthy by the time the job (180 minutes) has long since completed.
    const member = useCrewStore.getState().crew.find((entry) => entry.id === INJURED_MEMBER_ID);
    expect(isHealthy(member.injury)).toBe(true);

    usePolicyStore.getState().setPolicyEnabled("auto-treatment", false);
    resetCrewJobsAndCredits("healthy");
  });

  it("does not enqueue a second treatment job while the first is still queued/in progress, even across many ticks", () => {
    resetCrewJobsAndCredits("serious");
    usePolicyStore.getState().setPolicyEnabled("auto-treatment", true);

    const TICKS = 10;
    const DELTA_MINUTES = 15;
    for (let tick = 0; tick < TICKS; tick += 1) {
      useGameStore.getState().advanceMinutes(DELTA_MINUTES);
      processTimedJobs(DELTA_MINUTES);
    }

    // 10 ticks * 15 minutes = 150 minutes — enough for the scheduler to pick
    // the job up but nowhere near TREATMENT_RULES.serious.minutes (720), so
    // the job should still be backlog/assigned/in_progress here, exactly the
    // scenario the busy-check guard exists for.
    const treatmentJobs = useJobStore.getState().jobs.filter((job) => job.type === "treatment" && job.payload?.targetCrewId === INJURED_MEMBER_ID);
    expect(treatmentJobs.length).toBeLessThanOrEqual(1);

    usePolicyStore.getState().setPolicyEnabled("auto-treatment", false);
    resetCrewJobsAndCredits("healthy");
  });

  it("insufficient credits only ever logs a warning — it never enqueues a treatment job it can't pay for", () => {
    resetCrewJobsAndCredits("critical");
    useGameStore.setState((state) => ({ resources: { ...state.resources, credits: 5 } }));
    usePolicyStore.getState().setPolicyEnabled("auto-treatment", true);

    useGameStore.getState().advanceMinutes(15);
    processTimedJobs(15);

    expect(useGameStore.getState().logs.some((message) => message.includes("정책") && message.includes("크레딧 부족"))).toBe(true);
    expect(useJobStore.getState().jobs.some((job) => job.type === "treatment" && job.payload?.targetCrewId === INJURED_MEMBER_ID)).toBe(false);
    expect(useGameStore.getState().resources.credits).toBe(5);

    usePolicyStore.getState().setPolicyEnabled("auto-treatment", false);
    resetCrewJobsAndCredits("healthy");
  });

  it("disabled (default) never enqueues a treatment job even with an injured crew member and plenty of credits", () => {
    resetCrewJobsAndCredits("minor");
    expect(usePolicyStore.getState().policies["auto-treatment"].enabled).toBe(false);

    const TICKS = 5;
    const DELTA_MINUTES = 15;
    for (let tick = 0; tick < TICKS; tick += 1) {
      useGameStore.getState().advanceMinutes(DELTA_MINUTES);
      processTimedJobs(DELTA_MINUTES);
    }

    expect(useJobStore.getState().jobs.some((job) => job.type === "treatment" && job.payload?.targetCrewId === INJURED_MEMBER_ID)).toBe(false);
    resetCrewJobsAndCredits("healthy");
  });
});

// Phase 19-D: encounter-default-choice goes from a recognized-but-inert
// catalog entry to a real automation. navStore's pendingEncounter has no
// timeout (see navStore.js/policyEngine.js's file-header comments), so this
// policy resolves the encounter the same tick it sees one pending, by
// reusing gameClock's own applyNavigationEncounter — the exact function a
// player's manual "조우 결재" click goes through — so an auto-resolved
// encounter is indistinguishable from a manually-resolved one once applied.
describe("gameClock.processTimedJobs — encounter-default-choice resolves pending encounters (Phase 19-D)", () => {
  const SINGLE_OPTION_ENCOUNTER = {
    id: "gc-test-single-option",
    title: "통합 테스트 조우",
    options: [{ id: "only", label: "유일한 선택", outcome: [{ kind: "resource", delta: { credits: 75 } }] }],
  };

  const ALL_COMBAT_ENCOUNTER = {
    id: "gc-test-all-combat",
    title: "통합 테스트 총력전 조우",
    options: [{ id: "engage", label: "정면 교전", outcome: [{ kind: "combat", enemyId: "gc-test-foe" }] }],
  };

  function resetNavAndPolicy() {
    useNavStore.setState({ pendingEncounter: null });
    useExplorationStore.getState().clearPendingCombatEncounter();
    // resetPolicy (not just setPolicyEnabled(false)) so the "stance": "safe"
    // param the second test below sets doesn't leak into later tests in this
    // file — policyStore is a real module-level singleton with no
    // between-test reset (see tests/setup.js), so every describe block here
    // must restore what it touched. This was found by Phase 19-F's combined
    // multi-policy test: without this reset, that later test observed
    // "safe" instead of the catalog's "balanced" default and picked the
    // wrong encounter option, purely because it ran after this block in the
    // same file.
    usePolicyStore.getState().resetPolicy("encounter-default-choice");
  }

  it("disabled (default) never touches a pending encounter, even across many ticks", () => {
    resetNavAndPolicy();
    useNavStore.setState({ pendingEncounter: SINGLE_OPTION_ENCOUNTER });
    expect(usePolicyStore.getState().policies["encounter-default-choice"].enabled).toBe(false);

    const TICKS = 5;
    const DELTA_MINUTES = 15;
    for (let tick = 0; tick < TICKS; tick += 1) {
      useGameStore.getState().advanceMinutes(DELTA_MINUTES);
      processTimedJobs(DELTA_MINUTES);
    }

    // The regression this project cares about most: with the policy off,
    // gameplay must be completely unchanged — the encounter is still
    // sitting there waiting for a manual "조우 결재".
    expect(useNavStore.getState().pendingEncounter).toEqual(SINGLE_OPTION_ENCOUNTER);
    resetNavAndPolicy();
  });

  it("enabled: resolves the pending encounter this tick, clears pendingEncounter, and applies the chosen option's effect", () => {
    resetNavAndPolicy();
    useNavStore.setState({ pendingEncounter: SINGLE_OPTION_ENCOUNTER });
    usePolicyStore.getState().setPolicyEnabled("encounter-default-choice", true);
    usePolicyStore.getState().setPolicyParam("encounter-default-choice", "stance", "safe");

    const creditsBefore = useGameStore.getState().resources.credits;
    useGameStore.getState().advanceMinutes(15);
    processTimedJobs(15);

    // navStore.resolveEncounter (via applyNavigationEncounter) cleared it —
    // exactly what a manual "조우 결재" click would have done.
    expect(useNavStore.getState().pendingEncounter).toBeNull();
    // The single option's resource effect was applied through the normal
    // applyNavEffect path (gameStore.addResources), same as any other
    // encounter resolution.
    expect(useGameStore.getState().resources.credits).toBe(creditsBefore + 75);
    // A policy log fired, describing which option was auto-selected.
    expect(useGameStore.getState().logs.some((message) => message.includes("정책") && message.includes("조우 자동 대응"))).toBe(true);

    resetNavAndPolicy();
  });

  it("enabled but every option leads to combat: pendingEncounter is left untouched, only a diagnostic log fires", () => {
    resetNavAndPolicy();
    useNavStore.setState({ pendingEncounter: ALL_COMBAT_ENCOUNTER });
    usePolicyStore.getState().setPolicyEnabled("encounter-default-choice", true);

    useGameStore.getState().advanceMinutes(15);
    processTimedJobs(15);

    // Never auto-selected the combat option — this project's standing rule
    // is that emergency combat is never triggered automatically.
    expect(useNavStore.getState().pendingEncounter).toEqual(ALL_COMBAT_ENCOUNTER);
    expect(useExplorationStore.getState().pendingCombatEncounter).toBeNull();
    expect(useGameStore.getState().logs.some((message) => message.includes("정책") && message.includes("전투"))).toBe(true);

    resetNavAndPolicy();
  });

  it("enabled but explorationStore already has a pendingCombatEncounter: leaves the pending nav encounter alone", () => {
    resetNavAndPolicy();
    useNavStore.setState({ pendingEncounter: SINGLE_OPTION_ENCOUNTER });
    useExplorationStore.getState().setPendingCombatEncounter({ id: "already-pending", title: "이미 대기 중인 전투" });
    usePolicyStore.getState().setPolicyEnabled("encounter-default-choice", true);

    useGameStore.getState().advanceMinutes(15);
    processTimedJobs(15);

    expect(useNavStore.getState().pendingEncounter).toEqual(SINGLE_OPTION_ENCOUNTER);

    resetNavAndPolicy();
  });
});

// Phase 19-F: stabilization pass. All four policies (auto-hull-repair,
// auto-treatment, fuel-reserve, encounter-default-choice) enabled
// simultaneously, all four blocked at once (hull below threshold with no
// scrap, an injured crew member with no credits, fuel below the reserve
// threshold, and a pending encounter waiting for auto-resolution), driven
// across many real ticks. This is the scenario 19-A through 19-E only ever
// tested one policy at a time for — the goal here is to catch cross-policy
// interactions (double-spends, log spam, one policy starving another) that
// none of the single-policy tests above could see.
describe("gameClock.processTimedJobs — all four policies enabled simultaneously under combined pressure (Phase 19-F)", () => {
  const DELTA_MINUTES = 15;
  const SCRAP_COST = JOB_ECONOMY.hullRepair.salvageScrapCost;
  const TREATED_MEMBER_ID = "gunner-kang";
  // "serious", not "minor": injurySystem.js's tickMemberInjury only lets
  // "minor" and "incapacitated" injuries recover on their own
  // (canNaturallyRecover) — with medic-rho alive in the default crew roster,
  // a "minor" injury heals itself off treatmentRatePerHour's hasMedic rate
  // (22%/hour) regardless of credits, which would make this scenario's
  // credit-starvation window meaningless. Even starting at "serious",
  // crewStore's crew AI can still informally assign an idle medic to the
  // patient independently of jobStore/credits (the `treatedBy` mechanic in
  // tickMemberInjury) and improve it by one stage before this test ever
  // tops up credits — that's why the assertions below check "some real
  // TREATMENT_RULES cost" rather than a specific severity/cost. What stays
  // true regardless of that ambient healing is the thing this test actually
  // cares about: no *policy-driven* treatment job is ever enqueued while
  // credits are short, on any severity.

  // Two non-combat options so encounter-default-choice's "balanced" stance
  // (reward - risk) actually has to pick between them, instead of the
  // single-option fast path already covered by the 19-D tests above.
  // trade-run's reward (35) minus risk (3, from the hull -3 penalty) beats
  // aid-run's reward (20) minus risk (0), so "trade-run" is the deterministic
  // winner under the default "balanced" stance. Both deltas are kept small
  // on purpose: starting credits (50) plus either option must stay well
  // below auto-treatment's "serious" cost (420), so the encounter's payout
  // does not accidentally unblock auto-treatment before the scripted
  // mid-scenario credit top-up below.
  const PRESSURE_ENCOUNTER = {
    id: "gc-test-19f-pressure",
    title: "F 단계 압박 조우",
    options: [
      { id: "aid-run", label: "구호 활동", outcome: [{ kind: "resource", delta: { credits: 20 } }] },
      { id: "trade-run", label: "물자 거래", outcome: [{ kind: "resource", delta: { credits: 35, hull: -3 } }] },
    ],
  };

  function resetAllPolicyState() {
    useJobStore.setState({ jobs: [] });
    useJobStore.getState().recomputeRoomLoad();
    useInventoryStore.setState((state) => ({
      items: state.items.map((item) => (item.id === "salvage-scrap" ? { ...item, qty: 0 } : item)),
    }));
    useCrewStore.setState((state) => ({
      crew: state.crew.map((member) => (member.id === TREATED_MEMBER_ID ? { ...member, alive: true, injury: "healthy" } : member)),
    }));
    useGameStore.setState((state) => ({ resources: { ...state.resources, hull: 100, fuel: 100, credits: 1800 } }));
    useNavStore.setState({ pendingEncounter: null });
    useExplorationStore.getState().clearPendingCombatEncounter();
    // resetPolicy (not just setPolicyEnabled(false)) so this test is immune
    // to any params (e.g. "stance") a differently-ordered earlier test in
    // this file might have left set — see resetNavAndPolicy's comment above
    // for the concrete case this guards against.
    ["auto-hull-repair", "auto-treatment", "fuel-reserve", "encounter-default-choice"].forEach((policyId) =>
      usePolicyStore.getState().resetPolicy(policyId),
    );
  }

  it("runs 90 ticks under simultaneous hull/credit/fuel/encounter pressure without throwing, never lets credits or scrap go negative, throttles diagnostic log volume, and resumes blocked policies once resources are replenished", () => {
    resetAllPolicyState();

    // --- Set up "everything is blocked at once" ---------------------------
    useGameStore.setState((state) => ({ resources: { ...state.resources, hull: 20, fuel: 10, credits: 50 } }));
    useCrewStore.setState((state) => ({
      crew: state.crew.map((member) => (member.id === TREATED_MEMBER_ID ? { ...member, alive: true, injury: "serious" } : member)),
    }));
    useNavStore.setState({ pendingEncounter: PRESSURE_ENCOUNTER });

    ["auto-hull-repair", "auto-treatment", "fuel-reserve", "encounter-default-choice"].forEach((policyId) =>
      usePolicyStore.getState().setPolicyEnabled(policyId, true),
    );

    // Count every "정책:"-prefixed addLog call live, via subscribe, instead
    // of reading the final gameStore.logs array — logs is capped to the
    // most recent 80 entries (see gameStore.js's addLog), and 90 ticks with
    // four live systems logging per tick will overflow that cap long before
    // the loop ends, silently undercounting anything read from final state.
    let policyLogCount = 0;
    let sawEncounterResolutionLog = false;
    let lastLogsRef = useGameStore.getState().logs;
    const unsubscribe = useGameStore.subscribe((state) => {
      if (state.logs !== lastLogsRef) {
        const newest = state.logs[0];
        if (typeof newest === "string" && newest.startsWith("정책:")) {
          policyLogCount += 1;
          if (newest.includes("조우 자동 대응") && newest.includes("물자 거래")) sawEncounterResolutionLog = true;
        }
        lastLogsRef = state.logs;
      }
    });

    try {
      const TICKS_PHASE1 = 25;
      const TICKS_PHASE2 = 65;

      // Phase 1: everything stays blocked (no scrap, no credits, low fuel,
      // pending encounter resolves almost immediately since it has no
      // threshold of its own to wait on). 25 ticks (375 minutes) is short
      // enough that gunner-kang's untreated "serious" injury stays well
      // under injurySystem.js's worsenAfterMinutes threshold (540 minutes
      // with a medic aboard) despite going untreated the whole phase.
      // Resources must never go negative even with three policies
      // simultaneously trying to spend against the same starved
      // credit/scrap pool.
      for (let tick = 0; tick < TICKS_PHASE1; tick += 1) {
        useGameStore.getState().advanceMinutes(DELTA_MINUTES);
        expect(() => processTimedJobs(DELTA_MINUTES)).not.toThrow();

        expect(useGameStore.getState().resources.credits).toBeGreaterThanOrEqual(0);
        expect(useGameStore.getState().resources.fuel).toBeGreaterThanOrEqual(0);
        expect(useGameStore.getState().resources.hull).toBeGreaterThanOrEqual(0);
        const scrapQty = useInventoryStore.getState().items.find((item) => item.id === "salvage-scrap")?.qty ?? 0;
        expect(scrapQty).toBeGreaterThanOrEqual(0);
      }

      // The encounter auto-resolved despite everything else being under
      // pressure — encounter-default-choice doesn't depend on credits/scrap
      // at all, so it should never be starved by the other three policies.
      expect(useNavStore.getState().pendingEncounter).toBeNull();
      expect(sawEncounterResolutionLog).toBe(true);

      // Both auto-hull-repair and auto-treatment stayed blocked the whole
      // of phase 1 — no scrap, no credits — so neither ever enqueued a job
      // it couldn't pay for.
      expect(useJobStore.getState().jobs.some((job) => job.type === "hull_repair")).toBe(false);
      expect(useJobStore.getState().jobs.some((job) => job.type === "treatment" && job.payload?.targetCrewId === TREATED_MEMBER_ID)).toBe(
        false,
      );

      // --- Mid-scenario replenishment ---------------------------------
      // Top up exactly what auto-hull-repair and auto-treatment need. Both
      // policies should pick this up on the very next tick — they evaluate
      // against a live resource snapshot each tick, not a stale one.
      useInventoryStore.setState((state) => ({
        items: state.items.map((item) => (item.id === "salvage-scrap" ? { ...item, qty: SCRAP_COST } : item)),
      }));
      useGameStore.setState((state) => ({ resources: { ...state.resources, credits: 5000 } }));

      const creditsBeforeTreatmentEnqueue = useGameStore.getState().resources.credits;
      useGameStore.getState().advanceMinutes(DELTA_MINUTES);
      processTimedJobs(DELTA_MINUTES);

      expect(useJobStore.getState().jobs.some((job) => job.type === "hull_repair")).toBe(true);
      const enqueuedTreatmentJob = useJobStore
        .getState()
        .jobs.find((job) => job.type === "treatment" && job.payload?.targetCrewId === TREATED_MEMBER_ID);
      expect(enqueuedTreatmentJob).toBeTruthy();
      // Spent exactly the enqueued job's own cost — no double-charge from a
      // cross-policy race in this same tick (auto-hull-repair also fired
      // its own real action this tick, spending scrap, not credits).
      expect(useGameStore.getState().resources.credits).toBe(creditsBeforeTreatmentEnqueue - enqueuedTreatmentJob.cost);

      // Phase 2: let both freshly-enqueued jobs run to completion. The
      // treatment job's exact severity/cost isn't pinned down here on
      // purpose: crewAI can informally assign an idle medic to an injured
      // crew member independently of jobStore/credits (see
      // stores/crewStore.js's tickMemberInjury `treatedBy` mechanic), which
      // can improve gunner-kang's injury by a stage before this policy ever
      // gets a chance to spend credits on it — that's a pre-existing crew
      // AI behavior, not something Phase 19's policy system controls, so
      // this test only asserts the job's cost is one of the real
      // TREATMENT_RULES costs, not a specific severity. 65 ticks (975
      // minutes, minus the 1 already spent above) comfortably covers the
      // hull_repair job (120 minutes) and even the slowest treatment rule
      // (TREATMENT_RULES.incapacitated at 1440 minutes would not fit, but
      // that state requires the member to be near-dead, far worse than
      // anything this scenario produces) plus scheduling overhead — and
      // keeps proving resources never dip negative now that real spends are
      // happening every tick (not just diagnostics).
      expect(Object.values(TREATMENT_RULES).some((rule) => rule.cost === enqueuedTreatmentJob.cost)).toBe(true);
      for (let tick = 0; tick < TICKS_PHASE2 - 1; tick += 1) {
        useGameStore.getState().advanceMinutes(DELTA_MINUTES);
        expect(() => processTimedJobs(DELTA_MINUTES)).not.toThrow();

        expect(useGameStore.getState().resources.credits).toBeGreaterThanOrEqual(0);
        expect(useGameStore.getState().resources.fuel).toBeGreaterThanOrEqual(0);
        expect(useGameStore.getState().resources.hull).toBeGreaterThanOrEqual(0);
        const scrapQty = useInventoryStore.getState().items.find((item) => item.id === "salvage-scrap")?.qty ?? 0;
        expect(scrapQty).toBeGreaterThanOrEqual(0);
      }

      // Both jobs completed: exactly one of each ever existed (the
      // active-job/busy-crew guards in policyEngine.js held even with three
      // other policies also mutating state every tick), and each spent
      // exactly its cost — no double-charge from any cross-policy race.
      const hullRepairJobs = useJobStore.getState().jobs.filter((job) => job.type === "hull_repair");
      expect(hullRepairJobs).toHaveLength(1);
      expect(hullRepairJobs[0].status).toBe("done");
      const scrapQtyAfter = useInventoryStore.getState().items.find((item) => item.id === "salvage-scrap")?.qty ?? 0;
      expect(scrapQtyAfter).toBe(0);

      const treatmentJobs = useJobStore
        .getState()
        .jobs.filter((job) => job.type === "treatment" && job.payload?.targetCrewId === TREATED_MEMBER_ID);
      expect(treatmentJobs).toHaveLength(1);
      expect(treatmentJobs[0].status).toBe("done");
      expect(treatmentJobs[0].id).toBe(enqueuedTreatmentJob.id);
      const treatedMember = useCrewStore.getState().crew.find((member) => member.id === TREATED_MEMBER_ID);
      expect(isHealthy(treatedMember.injury)).toBe(true);

      // --- Log-spam bound -----------------------------------------------
      // Every diagnostic log is throttled per `${policyId}:${reason}` key at
      // a 60-game-minute window (gameClock.js's private
      // POLICY_WARNING_THROTTLE_MINUTES) — mirrored here as THROTTLE_MINUTES
      // since it isn't exported. Across this scenario at most 3 distinct
      // diagnostic keys are ever active (fuel-reserve's "low-fuel", which
      // never clears because fuel is never replenished; auto-hull-repair's
      // "insufficient-scrap", active before the top-up and again after the
      // single repair job completes, since one repair's fixed +hull delta
      // doesn't necessarily clear the threshold; auto-treatment's
      // "insufficient-credits", active only before the top-up) plus 2
      // one-off, never-repeating action logs (the hull repair enqueue and
      // the treatment enqueue — both silenced on every later tick by their
      // active-job guards) and one encounter-resolution log. That bounds the
      // total far below the naive "no throttle" worst case of 4 logs/tick.
      const TOTAL_TICKS = TICKS_PHASE1 + TICKS_PHASE2;
      const TOTAL_MINUTES = TOTAL_TICKS * DELTA_MINUTES;
      const THROTTLE_MINUTES = 60;
      const MAX_DIAGNOSTIC_KEYS = 3;
      const maxDiagnosticLogs = MAX_DIAGNOSTIC_KEYS * (Math.ceil(TOTAL_MINUTES / THROTTLE_MINUTES) + 1);
      const maxActionLogs = 3;
      const maxPolicyLogs = maxDiagnosticLogs + maxActionLogs;

      expect(policyLogCount).toBeGreaterThan(0);
      expect(policyLogCount).toBeLessThanOrEqual(maxPolicyLogs);
      // Sanity check against the naive worst case, independent of the
      // throttle-window arithmetic above: with no throttling at all, 90
      // ticks * 4 policies could produce up to 360 log lines. The real
      // count should be nowhere close.
      expect(policyLogCount).toBeLessThan(TOTAL_TICKS * 4 * 0.5);
    } finally {
      unsubscribe();
      resetAllPolicyState();
    }
  });
});

// Phase 20-A: reportStore + systems/reportSystem.js are foundation-only in
// this PR — no gameClock.js process* function has been wired to call a
// report builder yet (see docs/PHASE_20_REPORT_SYSTEM.md's "gameClock
// wiring" decision). This block proves that holds across a real multi-tick
// run under the same combined pressure the 19-F policy test above used
// (hull, injury, fuel, and a pending encounter all active at once, with
// every policy enabled so plenty of log-worthy events fire) —
// reportStore.reports must stay completely empty regardless, since nothing
// in this PR ever calls useReportStore.getState().addReport(). 20-B is
// expected to flip this characterization once the generators land.
//
// Deliberately placed last in this file (after every other describe block,
// mirroring how 19-F's combined-pressure block was appended after 19-A
// through 19-D): gameStore.logs/policyStore are real module-level
// singletons with no automatic reset between tests in this project's Vitest
// setup (see the 19-F stabilization note in docs/PHASE_19_POLICY_SYSTEM.md),
// and this test's own log/policy-toggle churn must not leak into any
// earlier test's log-content assertions.
describe("gameClock.processTimedJobs with the report system introduced but not wired (Phase 20-A)", () => {
  it("30 ticks with every policy enabled and the ship under combined pressure never add a single report", () => {
    useReportStore.setState({ reports: [] });

    useGameStore.setState((state) => ({ resources: { ...state.resources, hull: 15, fuel: 15 } }));
    usePolicyStore.getState().setPolicyEnabled("auto-hull-repair", true);
    usePolicyStore.getState().setPolicyEnabled("auto-treatment", true);
    usePolicyStore.getState().setPolicyEnabled("fuel-reserve", true);
    usePolicyStore.getState().setPolicyEnabled("encounter-default-choice", true);

    const TICKS = 30;
    const DELTA_MINUTES = 15;
    expect(() => {
      for (let tick = 0; tick < TICKS; tick += 1) {
        useGameStore.getState().advanceMinutes(DELTA_MINUTES);
        processTimedJobs(DELTA_MINUTES);
      }
    }).not.toThrow();

    // Sanity check this scenario actually produced log activity (otherwise
    // "zero reports" would be a vacuous pass) — at least the policy system
    // must have logged something under this much pressure.
    expect(useGameStore.getState().logs.length).toBeGreaterThan(0);

    // The real assertion: report system is inert in this PR.
    expect(useReportStore.getState().reports).toEqual([]);

    // Reset policy toggles for any tests that may run after this one.
    usePolicyStore.getState().resetPolicy("auto-hull-repair");
    usePolicyStore.getState().resetPolicy("auto-treatment");
    usePolicyStore.getState().resetPolicy("fuel-reserve");
    usePolicyStore.getState().resetPolicy("encounter-default-choice");
  });
});

// Phase 20-B: the report generators are wired for real now — every block
// below drives a real event through processTimedJobs and checks
// reportStore.reports directly, the same way the blocks above check
// gameStore.logs/jobStore.jobs. The Phase 20-A block right above this one
// still passes (its specific pressure scenario never actually crosses a
// mutating-action threshold — see this PR's report for why), but it is no
// longer a "system is inert" characterization; these blocks are.
describe("gameClock.processTimedJobs — report generation wired to real events (Phase 20-B)", () => {
  const SCRAP_COST = JOB_ECONOMY.hullRepair.salvageScrapCost;

  function resetReportsJobsAndInventory() {
    useReportStore.setState({ reports: [] });
    useJobStore.setState({ jobs: [] });
    useJobStore.getState().recomputeRoomLoad();
    useInventoryStore.setState((state) => ({
      items: state.items.map((item) => (item.id === "salvage-scrap" ? { ...item, qty: 0 } : item)),
    }));
  }

  it("auto-hull-repair's enqueue action files exactly one 'policy' report (not one per tick), and the job's own completion files exactly one 'work' report", () => {
    resetReportsJobsAndInventory();
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

    // Exactly one policy report, even though the active-job guard means
    // policyEngine.js's action would only ever fire once anyway — this
    // proves the report call is tied 1:1 to the action firing, not to every
    // tick evaluatePolicies runs.
    const policyReports = useReportStore.getState().reports.filter((report) => report.category === "policy" && report.meta?.policyId === "auto-hull-repair");
    expect(policyReports).toHaveLength(1);
    expect(policyReports[0].body).toContain("기관실");
    expect(policyReports[0].body).toContain("10%");
    expect(policyReports[0].read).toBe(false);
    expect(policyReports[0].priority).toBe("info"); // policy category's default

    // The hull_repair job this action enqueued also completed and filed its
    // own "work" report — job origin (policy vs. manual) doesn't gate the
    // work report, only completion does (see the "정책이 예약한 작업의 완료는
    // 제외하지 말고 포함" rule this PR follows).
    const workReports = useReportStore.getState().reports.filter((report) => report.category === "work" && report.meta?.jobType === "hull_repair");
    expect(workReports).toHaveLength(1);
    expect(workReports[0].title).toBe("함선 작업 완료");
    expect(workReports[0].priority).toBe("info");

    usePolicyStore.getState().setPolicyEnabled("auto-hull-repair", false);
    resetReportsJobsAndInventory();
  });

  it("auto-hull-repair's diagnostic-only branch (insufficient scrap) never files a report, even though it logs a throttled warning", () => {
    resetReportsJobsAndInventory();
    useGameStore.setState((state) => ({ resources: { ...state.resources, hull: 10 } }));
    usePolicyStore.getState().setPolicyEnabled("auto-hull-repair", true);

    useGameStore.getState().advanceMinutes(15);
    processTimedJobs(15);

    expect(useGameStore.getState().logs.some((message) => message.includes("정책") && message.includes("폐자재 부족"))).toBe(true);
    expect(useReportStore.getState().reports).toEqual([]);

    usePolicyStore.getState().setPolicyEnabled("auto-hull-repair", false);
    resetReportsJobsAndInventory();
  });

  it("fuel-reserve (diagnostic-only policy) never files a report, no matter how low fuel drops", () => {
    resetReportsJobsAndInventory();
    usePolicyStore.getState().setPolicyEnabled("fuel-reserve", true);
    useGameStore.setState((state) => ({ resources: { ...state.resources, fuel: 5 } }));

    useGameStore.getState().advanceMinutes(15);
    processTimedJobs(15);

    expect(useGameStore.getState().logs.some((message) => message.includes("연료 예비율"))).toBe(true);
    expect(useReportStore.getState().reports).toEqual([]);

    usePolicyStore.getState().setPolicyEnabled("fuel-reserve", false);
    resetReportsJobsAndInventory();
  });

  it("auto-treatment's enqueue action files exactly one 'policy' report, and the treatment job's completion files exactly one 'work' report", () => {
    resetReportsJobsAndInventory();
    useCrewStore.setState((state) => ({
      crew: state.crew.map((member) => (member.id === "gunner-kang" ? { ...member, alive: true, injury: "minor" } : member)),
    }));
    useGameStore.setState((state) => ({ resources: { ...state.resources, credits: 5000 } }));
    usePolicyStore.getState().setPolicyEnabled("auto-treatment", true);

    const TICKS = 40;
    const DELTA_MINUTES = 15;
    for (let tick = 0; tick < TICKS; tick += 1) {
      useGameStore.getState().advanceMinutes(DELTA_MINUTES);
      processTimedJobs(DELTA_MINUTES);
    }

    const policyReports = useReportStore.getState().reports.filter((report) => report.category === "policy" && report.meta?.policyId === "auto-treatment");
    expect(policyReports).toHaveLength(1);
    expect(policyReports[0].body).toContain("₢");

    const workReports = useReportStore.getState().reports.filter((report) => report.category === "work" && report.meta?.jobType === "treatment");
    expect(workReports).toHaveLength(1);
    expect(workReports[0].title).toBe("치료 완료");

    usePolicyStore.getState().setPolicyEnabled("auto-treatment", false);
    useCrewStore.setState((state) => ({
      crew: state.crew.map((member) => (member.id === "gunner-kang" ? { ...member, alive: true, injury: "healthy" } : member)),
    }));
    resetReportsJobsAndInventory();
  });

  it("encounter-default-choice's resolve action files exactly one 'policy' report naming the chosen option", () => {
    resetReportsJobsAndInventory();
    useNavStore.setState({ pendingEncounter: null });
    useExplorationStore.getState().clearPendingCombatEncounter();
    usePolicyStore.getState().resetPolicy("encounter-default-choice");
    const encounter = {
      id: "gc-report-test-encounter",
      title: "보고서 테스트 조우",
      options: [{ id: "only", label: "유일한 선택", outcome: [{ kind: "resource", delta: { credits: 50 } }] }],
    };
    useNavStore.setState({ pendingEncounter: encounter });
    usePolicyStore.getState().setPolicyEnabled("encounter-default-choice", true);

    useGameStore.getState().advanceMinutes(15);
    processTimedJobs(15);

    const policyReports = useReportStore.getState().reports.filter((report) => report.category === "policy" && report.meta?.policyId === "encounter-default-choice");
    expect(policyReports).toHaveLength(1);
    expect(policyReports[0].body).toContain("유일한 선택");

    usePolicyStore.getState().resetPolicy("encounter-default-choice");
    useNavStore.setState({ pendingEncounter: null });
    resetReportsJobsAndInventory();
  });

  it("a manually-queued (non-policy) training job's completion also files a 'work' report — job origin doesn't gate the report, only completion does", () => {
    resetReportsJobsAndInventory();
    const member = useCrewStore.getState().crew.find((entry) => entry.alive);
    expect(member).toBeTruthy();
    const currentMinute = useGameStore.getState().currentMinute;
    useJobStore.getState().enqueueTraining({ memberId: member.id, statKey: "piloting", duration: 30, createdAt: currentMinute });

    const TICKS = 20;
    const DELTA_MINUTES = 15;
    for (let tick = 0; tick < TICKS; tick += 1) {
      useGameStore.getState().advanceMinutes(DELTA_MINUTES);
      processTimedJobs(DELTA_MINUTES);
    }

    const trainingJob = useJobStore.getState().jobs.find((job) => job.type === "training" && job.payload?.targetCrewId === member.id);
    expect(trainingJob?.status).toBe("done");

    const workReports = useReportStore.getState().reports.filter((report) => report.category === "work" && report.meta?.jobType === "training");
    expect(workReports).toHaveLength(1);
    expect(workReports[0].title).toBe("훈련 완료");
    expect(workReports[0].body).toContain(member.name);

    resetReportsJobsAndInventory();
  });

  it("a room-decay-triggered crisis spawn files exactly one 'crisis' report with priority 'critical' and crisisKind 'spawned'", () => {
    resetReportsJobsAndInventory();
    useShipInteriorStore.setState({ rooms: createInitialRoomState(), activeCrises: [] });
    useShipInteriorStore.setState((state) => ({
      rooms: { ...state.rooms, engineering: { ...state.rooms.engineering, load: 94, condition: 80 } },
    }));

    useGameStore.getState().advanceMinutes(60);
    processTimedJobs(60);

    const crisisReports = useReportStore.getState().reports.filter((report) => report.category === "crisis");
    expect(crisisReports).toHaveLength(1);
    expect(crisisReports[0].meta).toEqual({ crisisKind: "spawned" });
    expect(crisisReports[0].priority).toBe("critical");
    expect(crisisReports[0].title).toBe("함내 위기 발생");

    resetReportsJobsAndInventory();
    useShipInteriorStore.setState({ rooms: createInitialRoomState(), activeCrises: [] });
  });

  it("a crisis fully progressed (by a crew member already assigned crisis-response) files exactly one 'crisis' report with priority 'info' and crisisKind 'resolved', and never an 'escalated' report", () => {
    resetReportsJobsAndInventory();
    const crisisId = "gc-report-test-crisis";
    const rooms = { ...createInitialRoomState() };
    rooms.engineering = { ...rooms.engineering, activeCrisisId: crisisId };
    useShipInteriorStore.setState({
      rooms,
      activeCrises: [{ id: crisisId, roomId: "engineering", type: "overheat", severity: 1, progress: 90, escalateAt: 1_000_000, assignedCrewId: null, assignedCrewIds: [], createdAtMinutes: 0 }],
    });
    // engineer-min is this roster's only "기관실"-role member — bypass real
    // crewAI's own assignment decision (irrelevant to what's under test
    // here) by setting crewActivities directly, the same plain shape
    // gameClock.js's processCrises already reads off crewStore.crewActivities.
    useCrewStore.setState((state) => ({
      crew: state.crew.map((member) => (member.id === "engineer-min" ? { ...member, alive: true, injury: "healthy", fatigue: 0 } : member)),
      crewActivities: state.crew.map((member) => (member.id === "engineer-min" ? { memberId: member.id, intent: "crisis-response", crisisId, roomId: "engineering" } : { memberId: member.id, intent: "idle" })),
    }));

    useGameStore.getState().advanceMinutes(60);
    processTimedJobs(60);

    const crisisReports = useReportStore.getState().reports.filter((report) => report.category === "crisis");
    expect(crisisReports.some((report) => report.meta?.crisisKind === "escalated")).toBe(false);
    const resolvedReport = crisisReports.find((report) => report.meta?.crisisKind === "resolved");
    expect(resolvedReport).toBeTruthy();
    expect(resolvedReport.priority).toBe("info");
    expect(resolvedReport.title).toBe("함내 위기 해결");

    resetReportsJobsAndInventory();
    useShipInteriorStore.setState({ rooms: createInitialRoomState(), activeCrises: [] });
  });

  it("regression: with every policy at its default OFF and no crisis/job activity, 30 ticks add zero reports", () => {
    resetReportsJobsAndInventory();
    useShipInteriorStore.setState({ rooms: createInitialRoomState(), activeCrises: [] });
    expect(usePolicyStore.getState().policies).toEqual(createDefaultPolicyState());

    const TICKS = 30;
    const DELTA_MINUTES = 15;
    for (let tick = 0; tick < TICKS; tick += 1) {
      useGameStore.getState().advanceMinutes(DELTA_MINUTES);
      processTimedJobs(DELTA_MINUTES);
    }

    expect(useReportStore.getState().reports).toEqual([]);
    resetReportsJobsAndInventory();
  });
});
