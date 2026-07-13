import { beforeEach, describe, expect, it } from "vitest";
import { getDirectorIncident } from "../../data/directorIncidents";
import { buildIncidentStateSnapshot, getIncidentOptionAvailability, processIncidentJobCompletion, processIncidentOrchestration, settleIncidentChoice } from "../../orchestration/incidentDirectorOrchestrator";
import { useCombatStore } from "../../stores/combatStore";
import { useCrewStore } from "../../stores/crewStore";
import { useExplorationStore } from "../../stores/explorationStore";
import { useGameStore } from "../../stores/gameStore";
import { mergePersistedIncidentState, useIncidentStore } from "../../stores/incidentStore";
import { useInventoryStore } from "../../stores/inventoryStore";
import { useJobStore } from "../../stores/jobStore";
import { useMissionStore } from "../../stores/missionStore";
import { useNavStore } from "../../stores/navStore";
import { useReportStore } from "../../stores/reportStore";
import { useShipInteriorStore } from "../../stores/shipInteriorStore";
import { useShipStore } from "../../stores/shipStore";
import { createInitialRoomState } from "../roomJobs";
import { processTimedJobs } from "../gameClock";

const vesselId = "vessel-starter";
const baseCrew = useCrewStore.getState().crew.map((member) => ({ ...member, needs: { ...member.needs } }));

function addAndPresent(templateId, minute = 100) {
  const template = getDirectorIncident(templateId);
  const id = `test:${templateId}`;
  useIncidentStore.getState().addRuntime({ id, templateId, vesselId, severity: template.severity, category: template.category, roomId: template.roomId, targets: template.targetMode === "highestFatigue" ? { crewId: "engineer-min" } : template.targetMode === "lowestAffinityPair" ? { crewIds: ["captain-yun", "engineer-min"] } : {}, status: "queued", stageId: "decision", offerClaimId: `offer:${id}:decision`, createdAtMinute: minute });
  return useIncidentStore.getState().presentNext(vesselId, minute);
}

function choose(runtime, optionId, afterStep) {
  return settleIncidentChoice({ runtimeId: runtime.id, stageId: runtime.stageId, claimId: runtime.offerClaimId, optionId, manual: true, currentMinute: 100, afterStep });
}

beforeEach(() => {
  useShipStore.setState({ activeVesselId: vesselId });
  useGameStore.setState({ currentMinute: 100, isPaused: true, resources: { credits: 1000, fuel: 100, oxygen: 100, hull: 100 }, incidentReceipts: {}, logs: [], news: [] });
  useInventoryStore.setState((state) => ({ items: state.items.map((item) => ({ ...item, qty: ["survey-probe", "food-ration", "ion-core"].includes(item.id) ? 5 : item.qty })), cards: [], activeCardIds: [], incidentReceipts: {} }));
  useCrewStore.setState({ crew: baseCrew.map((member) => ({ ...member, needs: { ...member.needs } })), relationships: {}, incidentReceipts: {} });
  useShipInteriorStore.setState({ rooms: createInitialRoomState(), activeCrises: [], incidentReceipts: {} });
  useJobStore.setState({ jobs: [], incidentReceipts: {} });
  useReportStore.setState({ reports: [], incidentReceipts: {} });
  useIncidentStore.setState({ directorsByVesselId: {}, runtimesById: {}, queueByVesselId: {}, presentedByVesselId: {}, incidentHistory: [] });
  useMissionStore.setState({ activeByVesselId: {}, pendingMissionEncountersByVesselId: {}, pendingStoryEncounterByVesselId: {}, eventRuntimesById: {} });
  useNavStore.setState({ pendingEncounter: null });
  useCombatStore.setState({ combatByVesselId: {} });
  useExplorationStore.setState({ pendingCombatEncounter: null });
});

describe("Phase 26 incident director integration", () => {
  it("builds the pure trigger snapshot from actual navigation, crew, inventory and room state", () => {
    useGameStore.setState((state) => ({ resources: { ...state.resources, oxygen: 42 } }));
    useInventoryStore.setState((state) => ({ items: state.items.map((item) => item.type === "food" ? { ...item, qty: 1 } : item) }));
    useCrewStore.setState((state) => ({
      crew: state.crew.map((member, index) => ({ ...member, fatigue: index === 0 ? 82 : 40, needs: { ...member.needs, hunger: 48, stress: index < 2 ? 70 : 20, sleepDebt: index === 0 ? 72 : 20 } })),
      relationships: { "captain-yun::engineer-min": { crewIds: ["captain-yun", "engineer-min"], affinity: -32 } },
    }));
    useShipInteriorStore.setState((state) => ({ rooms: { ...state.rooms, engineering: { ...state.rooms.engineering, condition: 50, load: 80 }, living: { ...state.rooms.living, condition: 55, load: 75 } } }));
    const nav = useNavStore.getState();
    const destination = nav.sector.nodes.find((node) => node.id !== nav.currentNodeId && !(nav.visited ?? []).includes(node.id));
    useNavStore.setState({ travel: { toId: destination.id } });
    const snapshot = buildIncidentStateSnapshot();
    expect(snapshot).toMatchObject({ aliveCrewCount: 4, foodQty: 2, avgHunger: 48, targetFatigue: 82, targetSleepDebt: 72, highStressCrewCount: 2, lowestAffinity: -32, oxygen: 42, highLoadRoomCount: 2, traveling: true });
    expect(snapshot.isUnexplored).toBe(true);
  });

  it("creates without a mounted panel, defers behind navigation, then presents with a fresh deadline", () => {
    useShipInteriorStore.setState((state) => ({ rooms: { ...state.rooms, engineering: { ...state.rooms.engineering, condition: 80 } } }));
    useNavStore.setState({ pendingEncounter: { id: "gate", options: [] } });
    processIncidentOrchestration(700, 600);
    expect(Object.values(useIncidentStore.getState().runtimesById)).toHaveLength(1);
    expect(useIncidentStore.getState().presentedByVesselId[vesselId]).toBeUndefined();
    useNavStore.setState({ pendingEncounter: null });
    processIncidentOrchestration(701, 0);
    const runtime = useIncidentStore.getState().runtimesById[useIncidentStore.getState().presentedByVesselId[vesselId]];
    expect(runtime.status).toBe("pending");
    expect(runtime.presentedAtMinute).toBe(701);
    expect(runtime.deadlineAtMinute).toBeGreaterThan(701);
  });

  it("enforces manual-only exact tuples and checks costs before removing the card", () => {
    const runtime = addAndPresent("sensor-zero-drift");
    expect(settleIncidentChoice({ runtimeId: runtime.id, stageId: runtime.stageId, claimId: runtime.offerClaimId, optionId: "probe" })).toMatchObject({ ok: false, reason: "manualOnly" });
    expect(settleIncidentChoice({ runtimeId: runtime.id, stageId: runtime.stageId, claimId: "stale", optionId: "probe", manual: true })).toMatchObject({ ok: false, reason: "staleSettlement" });
    useInventoryStore.setState((state) => ({ items: state.items.map((item) => item.id === "survey-probe" ? { ...item, qty: 0 } : item) }));
    expect(getIncidentOptionAvailability(runtime, getDirectorIncident(runtime.templateId).options.find((option) => option.id === "probe"))).toMatchObject({ ok: false, reason: "missingItem" });
    expect(choose(runtime, "probe")).toMatchObject({ ok: false, reason: "missingItem" });
    expect(useIncidentStore.getState().runtimesById[runtime.id].status).toBe("pending");
  });

  it("keeps one truly ungated loss-acceptance exit for all eight incidents in a depleted state", () => {
    const exits = {
      "coolant-joint-leak": "ignore",
      "sensor-zero-drift": "manual",
      "ration-ledger-mismatch": "ration",
      "watch-sleep-debt": "press",
      "quiet-watch": "research",
      "air-scrubber-chain-clog": "isolate",
      "power-bus-instability": "shed",
      "watch-team-clash": "side",
    };
    useGameStore.setState({ resources: { credits: 0, fuel: 0, oxygen: 0, hull: 0 } });
    useInventoryStore.setState((state) => ({ items: state.items.map((item) => ({ ...item, qty: 0 })) }));
    useCrewStore.setState((state) => ({ crew: state.crew.map((member) => ({ ...member, alive: true, fatigue: 100, injury: { state: "serious" } })) }));
    Object.entries(exits).forEach(([templateId, optionId], index) => {
      useIncidentStore.setState({ runtimesById: {}, queueByVesselId: {}, presentedByVesselId: {} });
      const runtime = addAndPresent(templateId, 100 + index);
      const option = getDirectorIncident(templateId).options.find((entry) => entry.id === optionId);
      expect(getIncidentOptionAvailability(runtime, option), `${templateId}:${optionId}`).toMatchObject({ ok: true });
    });
  });

  it("recovers every receiver boundary without double consuming or granting", () => {
    const runtime = addAndPresent("sensor-zero-drift");
    const beforeProbe = useInventoryStore.getState().items.find((item) => item.id === "survey-probe").qty;
    expect(() => choose(runtime, "probe", (step) => { if (step === "inventory") throw new Error("crash"); })).toThrow("crash");
    expect(useInventoryStore.getState().items.find((item) => item.id === "survey-probe").qty).toBe(beforeProbe - 1);
    processIncidentOrchestration(101, 0);
    processIncidentOrchestration(102, 0);
    expect(useInventoryStore.getState().items.find((item) => item.id === "survey-probe").qty).toBe(beforeProbe - 1);
    expect(useInventoryStore.getState().items.find((item) => item.id === "chart-data").qty).toBe(1);
    expect(useIncidentStore.getState().runtimesById[runtime.id].status).toBe("resolved");
    expect(useReportStore.getState().reports).toHaveLength(1);
  });

  it("recovers resource, crew, room, job and report receiver crash boundaries exactly once", () => {
    let runtime = addAndPresent("air-scrubber-chain-clog");
    const beforeLiving = useShipInteriorStore.getState().rooms.living.condition;
    expect(() => choose(runtime, "purge", (step) => { if (step === "resources") throw new Error("resource-crash"); })).toThrow("resource-crash");
    expect(useGameStore.getState().resources.oxygen).toBe(92);
    processIncidentOrchestration(101, 0);
    expect(useGameStore.getState().resources.oxygen).toBe(92);
    expect(useShipInteriorStore.getState().rooms.living.condition).toBe(Math.min(100, beforeLiving + 4));

    useIncidentStore.setState({ runtimesById: {}, queueByVesselId: {}, presentedByVesselId: {} });
    runtime = addAndPresent("watch-sleep-debt");
    const beforeFatigue = useCrewStore.getState().crew.find((member) => member.id === "engineer-min").fatigue;
    expect(() => choose(runtime, "swap", (step) => { if (step === "crew") throw new Error("crew-crash"); })).toThrow("crew-crash");
    processIncidentOrchestration(102, 0);
    expect(useCrewStore.getState().crew.find((member) => member.id === "engineer-min").fatigue).toBe(Math.max(0, beforeFatigue - 12));

    useIncidentStore.setState({ runtimesById: {}, queueByVesselId: {}, presentedByVesselId: {} });
    runtime = addAndPresent("coolant-joint-leak");
    expect(() => choose(runtime, "repair", (step) => { if (step === "job") throw new Error("job-crash"); })).toThrow("job-crash");
    processIncidentOrchestration(103, 0);
    expect(useJobStore.getState().jobs.filter((job) => job.payload?.incident?.runtimeId === runtime.id)).toHaveLength(1);
    expect(useIncidentStore.getState().runtimesById[runtime.id].status).toBe("waitingJob");

    useIncidentStore.setState({ runtimesById: {}, queueByVesselId: {}, presentedByVesselId: {} });
    runtime = addAndPresent("quiet-watch");
    expect(() => choose(runtime, "research", (step) => { if (step === "report") throw new Error("report-crash"); })).toThrow("report-crash");
    processIncidentOrchestration(104, 0);
    const reports = useReportStore.getState().reports.filter((report) => report.meta?.incidentId === "quiet-watch");
    expect(reports).toHaveLength(1);
    expect(useIncidentStore.getState().runtimesById[runtime.id].status).toBe("resolved");
  });

  it("uses deterministic jobs and resolves completion exactly once", () => {
    const runtime = addAndPresent("coolant-joint-leak");
    expect(choose(runtime, "repair")).toMatchObject({ ok: true, waitingJob: true });
    const waiting = useIncidentStore.getState().runtimesById[runtime.id];
    const job = useJobStore.getState().jobs.find((entry) => entry.id === waiting.waitingJob.jobId);
    expect(job.id).toBe(`incident-job:incident:${runtime.id}:decision:repair`);
    expect(useJobStore.getState().applyIncidentJob(`incident:${runtime.id}:decision:repair`, job)).toMatchObject({ repeated: true });
    expect(processIncidentJobCompletion({ ...job, status: "done", startedAt: 110, effectiveDuration: 120 }, 230)).toMatchObject({ handled: true, ok: true });
    const condition = useShipInteriorStore.getState().rooms.engineering.condition;
    processIncidentJobCompletion({ ...job, status: "done", startedAt: 110, effectiveDuration: 120 }, 231);
    expect(useShipInteriorStore.getState().rooms.engineering.condition).toBe(condition);
    expect(useIncidentStore.getState().runtimesById[runtime.id].status).toBe("resolved");
  });

  it("keeps authored incident job duration exact despite active speed cards and poor mood", () => {
    useInventoryStore.setState({ cards: [{ id: "omega-blueprint", instanceId: "speed-card", modifiers: { jobSpeedMult: 1.2 } }], activeCardIds: ["speed-card"] });
    useCrewStore.setState((state) => ({ crew: state.crew.map((member) => member.id === "engineer-min" ? { ...member, needs: { ...member.needs, mood: 5, stress: 95 }, fatigue: 70 } : member) }));
    const runtime = addAndPresent("coolant-joint-leak");
    choose(runtime, "repair");
    expect(useJobStore.getState().jobs[0].duration).toBe(120);
    useJobStore.getState().runScheduler({ currentMinute: 100, crew: useCrewStore.getState().crew });
    useJobStore.getState().runScheduler({ currentMinute: 110, crew: useCrewStore.getState().crew });
    expect(useJobStore.getState().jobs[0]).toMatchObject({ status: "in_progress", duration: 120, effectiveDuration: 120, moodWorkMultiplier: 1 });
  });

  it("disables jobs with no usable crew and truthfully marks reserved workers as queueing", () => {
    let runtime = addAndPresent("coolant-joint-leak");
    useCrewStore.setState((state) => ({ crew: state.crew.map((member) => member.id === "engineer-min" ? { ...member, fatigue: 85 } : member) }));
    let option = getDirectorIncident(runtime.templateId).options.find((entry) => entry.id === "repair");
    expect(getIncidentOptionAvailability(runtime, option)).toMatchObject({ ok: false, reason: "requiredRoleUnavailable" });

    useIncidentStore.setState({ runtimesById: {}, queueByVesselId: {}, presentedByVesselId: {} });
    useCrewStore.setState({ crew: baseCrew.map((member) => ({ ...member, needs: { ...member.needs } })) });
    useJobStore.getState().enqueueJob({ id: "reserved-engineer", type: "hull_repair", roomId: "bridge", status: "in_progress", assignedCrewId: "engineer-min", duration: 60 });
    runtime = addAndPresent("coolant-joint-leak");
    option = getDirectorIncident(runtime.templateId).options.find((entry) => entry.id === "repair");
    expect(getIncidentOptionAvailability(runtime, option)).toMatchObject({ ok: true });
    expect(getIncidentOptionAvailability(runtime, option).waitText).toContain("대기열");

    useIncidentStore.setState({ runtimesById: {}, queueByVesselId: {}, presentedByVesselId: {} });
    useJobStore.setState({ jobs: [], incidentReceipts: {} });
    useCrewStore.setState((state) => ({ crew: state.crew.map((member) => ({ ...member, fatigue: 90 })) }));
    runtime = addAndPresent("sensor-zero-drift");
    option = getDirectorIncident(runtime.templateId).options.find((entry) => entry.id === "calibrate");
    expect(getIncidentOptionAvailability(runtime, option)).toMatchObject({ ok: false, reason: "noUsableCrew" });
  });

  it("applies authored incident fatigue exactly even with chronic fatigue", () => {
    useCrewStore.setState((state) => ({ crew: state.crew.map((member) => member.id === "engineer-min" ? { ...member, fatigue: 50, injury: { state: "healthy", permanentTraits: ["chronic_fatigue"] } } : member) }));
    const runtime = addAndPresent("watch-sleep-debt");
    choose(runtime, "recovery");
    const job = useJobStore.getState().jobs[0];
    processIncidentJobCompletion({ ...job, status: "done", startedAt: 110, effectiveDuration: 120 }, 230);
    expect(useCrewStore.getState().crew.find((member) => member.id === "engineer-min").fatigue).toBe(28);
  });

  it.each(["completionEffects", "completionReport"])("recovers a saved done job after a crash at %s", (crashStep) => {
    const runtime = addAndPresent("coolant-joint-leak");
    choose(runtime, "repair");
    const job = useJobStore.getState().jobs[0];
    const done = { ...job, status: "done", progress: 1, startedAt: 110, effectiveDuration: 120 };
    useJobStore.setState({ jobs: [done] });
    expect(() => processIncidentJobCompletion(done, 230, (step) => { if (step === crashStep) throw new Error("completion-crash"); })).toThrow("completion-crash");
    processIncidentOrchestration(231, 0);
    processIncidentOrchestration(232, 0);
    expect(useIncidentStore.getState().runtimesById[runtime.id].status).toBe("resolved");
    expect(useReportStore.getState().reports.filter((report) => report.meta?.incidentId === "coolant-joint-leak")).toHaveLength(1);
    expect(useShipInteriorStore.getState().rooms.engineering.condition).toBe(88);
  });

  it("escalates cancelled, missing, dead-crew and overdue jobs without getting stuck", () => {
    for (const [suffix, mutate, minuteFor] of [
      ["cancel", (job) => useJobStore.setState((state) => ({ jobs: state.jobs.map((entry) => entry.id === job.id ? { ...entry, status: "failed" } : entry) })), (runtime) => runtime.deadlineAtMinute - 1],
      ["missing", (job) => useJobStore.setState((state) => ({ jobs: state.jobs.filter((entry) => entry.id !== job.id) })), (runtime) => runtime.deadlineAtMinute - 1],
      ["dead", (job) => {
        useJobStore.setState({ jobs: [{ ...job, status: "in_progress", assignedCrewId: "engineer-min", startedAt: 120, effectiveDuration: 120 }] });
        useCrewStore.setState((state) => ({ crew: state.crew.map((member) => member.id === "engineer-min" ? { ...member, alive: false } : member) }));
      }, (runtime) => runtime.deadlineAtMinute - 1],
      ["overdue", (job) => useJobStore.setState({ jobs: [{ ...job, status: "in_progress", assignedCrewId: "engineer-min", startedAt: 120, effectiveDuration: 999 }] }), (runtime) => runtime.deadlineAtMinute],
    ]) {
      useIncidentStore.setState({ runtimesById: {}, queueByVesselId: {}, presentedByVesselId: {} });
      useJobStore.setState({ jobs: [], incidentReceipts: {} });
      useShipInteriorStore.setState({ rooms: createInitialRoomState(), activeCrises: [], incidentReceipts: {} });
      useCrewStore.setState({ crew: baseCrew.map((member) => ({ ...member, needs: { ...member.needs } })) });
      const runtime = addAndPresent("coolant-joint-leak", 100);
      choose(runtime, "repair");
      const job = useJobStore.getState().jobs[0];
      const beforeCondition = useShipInteriorStore.getState().rooms.engineering.condition;
      mutate(job);
      processIncidentOrchestration(minuteFor(runtime), 0);
      expect(["failed", "cancelled"]).toContain(useIncidentStore.getState().runtimesById[runtime.id].status);
      expect(useShipInteriorStore.getState().rooms.engineering.condition).toBe(beforeCondition - 6);
    }
  });

  it("resolves an incident job completed exactly at the deadline but escalates one minute late", () => {
    let runtime = addAndPresent("coolant-joint-leak", 100);
    choose(runtime, "repair");
    let job = useJobStore.getState().jobs[0];
    expect(processIncidentJobCompletion({ ...job, status: "done", startedAt: runtime.deadlineAtMinute - 120, effectiveDuration: 120 }, runtime.deadlineAtMinute)).toMatchObject({ handled: true, ok: true });
    expect(useIncidentStore.getState().runtimesById[runtime.id].status).toBe("resolved");

    useIncidentStore.setState({ runtimesById: {}, queueByVesselId: {}, presentedByVesselId: {} });
    useJobStore.setState({ jobs: [], incidentReceipts: {} });
    runtime = addAndPresent("coolant-joint-leak", 100);
    choose(runtime, "repair");
    job = useJobStore.getState().jobs[0];
    expect(processIncidentJobCompletion({ ...job, status: "done", startedAt: runtime.deadlineAtMinute - 119, effectiveDuration: 120 }, runtime.deadlineAtMinute + 1)).toMatchObject({ handled: true, ok: true });
    expect(useIncidentStore.getState().runtimesById[runtime.id].status).toBe("failed");
  });

  it("retargets a dead pending crew target and safely clears an impossible paused pair", () => {
    let runtime = addAndPresent("watch-sleep-debt", 100);
    useCrewStore.setState((state) => ({ crew: state.crew.map((member) => member.id === "engineer-min" ? { ...member, alive: false } : member) }));
    processIncidentOrchestration(101, 0);
    let fresh = useIncidentStore.getState().runtimesById[runtime.id];
    expect(fresh.status).toBe("pending");
    expect(fresh.targets.crewId).not.toBe("engineer-min");
    expect(useCrewStore.getState().crew.find((member) => member.id === fresh.targets.crewId)?.alive).toBe(true);

    useIncidentStore.setState({ runtimesById: {}, queueByVesselId: {}, presentedByVesselId: {} });
    useCrewStore.setState((state) => ({ crew: state.crew.map((member, index) => ({ ...member, alive: index === 0 })) }));
    runtime = addAndPresent("watch-team-clash", 100);
    useIncidentStore.setState((state) => ({ runtimesById: { ...state.runtimesById, [runtime.id]: { ...state.runtimesById[runtime.id], pauseOwned: true } } }));
    useGameStore.setState({ isPaused: true });
    processIncidentOrchestration(101, 0);
    fresh = useIncidentStore.getState().runtimesById[runtime.id];
    expect(fresh).toMatchObject({ status: "cancelled", terminalReason: "targetUnavailable" });
    expect(useIncidentStore.getState().presentedByVesselId[vesselId]).toBeUndefined();
    expect(useGameStore.getState().isPaused).toBe(false);
  });

  it("spawns a deterministic physical crisis on medium timeout and does not progress it in creation", () => {
    const runtime = addAndPresent("power-bus-instability", 100);
    processIncidentOrchestration(runtime.deadlineAtMinute, 0);
    const crisis = useShipInteriorStore.getState().activeCrises[0];
    expect(crisis.id).toBe(`crisis:incident:incident:${runtime.id}:timeout`);
    expect(crisis).toMatchObject({ type: "power_loss", severity: 2, progress: 0 });
    processIncidentOrchestration(runtime.deadlineAtMinute + 1, 0);
    expect(useShipInteriorStore.getState().activeCrises).toHaveLength(1);
  });

  it("recovers an occupied-room crisis fallback after the physical receipt was saved", () => {
    const runtime = addAndPresent("power-bus-instability", 100);
    useShipInteriorStore.getState().spawnCrisis("engineering", "fire", 1, 100);
    const claimId = `incident:${runtime.id}:timeout`;
    const crisis = { id: `crisis:incident:${claimId}`, roomId: "engineering", type: "power_loss", severity: 2 };
    expect(useShipInteriorStore.getState().applyIncidentPhysicalEffects(claimId, { crisis, currentMinute: runtime.deadlineAtMinute })).toMatchObject({ ok: true, repeated: false, crisis: null });
    expect(useGameStore.getState().resources.oxygen).toBe(100);
    processIncidentOrchestration(runtime.deadlineAtMinute, 0);
    expect(useGameStore.getState().resources.oxygen).toBe(98);
    processIncidentOrchestration(runtime.deadlineAtMinute + 1, 0);
    expect(useGameStore.getState().resources.oxygen).toBe(98);
  });

  it("creates a late-job crisis only after this tick's crisis progression", () => {
    const runtime = addAndPresent("power-bus-instability", 100);
    choose(runtime, "patch");
    const job = useJobStore.getState().jobs[0];
    useJobStore.setState({ jobs: [{ ...job, status: "in_progress", assignedCrewId: "engineer-min", startedAt: 200, effectiveDuration: 400, progress: 0 }] });
    useGameStore.setState({ currentMinute: 700 });
    processTimedJobs(500);
    const crisis = useShipInteriorStore.getState().activeCrises.find((entry) => entry.id.includes(runtime.id));
    expect(crisis).toMatchObject({ type: "power_loss", progress: 0 });
  });

  it("never blocks or mutates unrelated mission and gate state", () => {
    const mission = { id: "mission-a", status: "active" };
    useMissionStore.setState({ activeByVesselId: { [vesselId]: mission } });
    const runtime = addAndPresent("quiet-watch");
    choose(runtime, "research");
    expect(useMissionStore.getState().activeByVesselId[vesselId]).toEqual(mission);
    expect(useNavStore.getState().pendingEncounter).toBeNull();
  });

  it("preserves FIFO queue up to three while limiting operational runtimes to two", () => {
    for (let index = 0; index < 5; index += 1) {
      useIncidentStore.getState().addRuntime({ id: `queue-${index}`, templateId: "quiet-watch", vesselId, severity: "daily", category: "opportunity", status: "queued", createdAtMinute: index });
    }
    expect(useIncidentStore.getState().queueByVesselId[vesselId]).toEqual(["queue-0", "queue-1", "queue-2"]);
    const first = useIncidentStore.getState().presentNext(vesselId, 100);
    expect(first.id).toBe("queue-0");
    useIncidentStore.getState().setWaitingJob(first.id, { jobId: "fake-a" }, 101);
    const second = useIncidentStore.getState().presentNext(vesselId, 102);
    expect(second.id).toBe("queue-1");
    useIncidentStore.getState().setWaitingJob(second.id, { jobId: "fake-b" }, 103);
    expect(useIncidentStore.getState().presentNext(vesselId, 104)).toBeNull();
    expect(useIncidentStore.getState().queueByVesselId[vesselId]).toEqual(["queue-2"]);
    expect(useIncidentStore.getState().incidentHistory.filter((entry) => entry.status === "suppressed")).toHaveLength(2);
  });

  it("normalizes unknown legacy templates to terminal without truncating active runtimes", () => {
    const persisted = { runtimesById: { unknown: { id: "unknown", templateId: "deleted", vesselId, status: "pending" }, known: { id: "known", templateId: "quiet-watch", vesselId, status: "waitingJob" } }, queueByVesselId: { [vesselId]: ["unknown"] }, presentedByVesselId: { [vesselId]: "unknown" } };
    const merged = mergePersistedIncidentState(persisted, useIncidentStore.getState());
    expect(merged.runtimesById.unknown.status).toBe("cancelled");
    expect(merged.runtimesById.known.status).toBe("waitingJob");
    expect(merged.queueByVesselId[vesselId]).toEqual([]);
    expect(merged.presentedByVesselId[vesselId]).toBeUndefined();
  });
});
