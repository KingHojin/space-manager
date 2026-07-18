import { beforeEach, describe, expect, it } from "vitest";
import { QUARANTINE_PULSE } from "../../data/constants";
import { getEventChain, presentEventChainStarterOption } from "../../data/eventChains";
import { ENCOUNTER_TABLE } from "../../data/navEncounters";
import { getCandidateRecruitCost, getTemplatesByRarity } from "../../data/recruitment";
import { cancelEventChainJob, getSectorBoundStoryBlocker, hasSectorBoundStoryRuntime, reconcileEventChainRuntimes, settleEventChainChoice } from "../../orchestration/eventChainOrchestrator";
import { processEncounterOrchestration } from "../../orchestration/missionEncounterOrchestrator";
import { useCombatStore } from "../../stores/combatStore";
import { useCrewStore } from "../../stores/crewStore";
import { useExplorationStore } from "../../stores/explorationStore";
import { useEquipmentStore } from "../../stores/equipmentStore";
import { useGameStore } from "../../stores/gameStore";
import { useInventoryStore } from "../../stores/inventoryStore";
import { useJobStore } from "../../stores/jobStore";
import { useMissionStore } from "../../stores/missionStore";
import { useNavStore } from "../../stores/navStore";
import { useRecruitStore } from "../../stores/recruitStore";
import { useReportStore } from "../../stores/reportStore";
import { useShipStore } from "../../stores/shipStore";
import { applyNavigationEncounter, processTimedJobs } from "../gameClock";

const vesselId = "starter";
const baseCrew = useCrewStore.getState().crew;
const distressTemplate = ENCOUNTER_TABLE.distress.find((entry) => entry.id === "distress-survivor");
const distress = { ...distressTemplate, claimId: "nav:distress:survivor:1", nodeId: "distress", nodeType: "distress" };
const sector = {
  id: "quarantine-sector",
  nodes: [
    { id: "station", type: "station", name: "의료 정거장", danger: 1, pos: { x: 0, y: 0 }, connections: ["distress"] },
    { id: "distress", type: "distress", name: "탈출 포드", danger: 2, pos: { x: 10, y: 0 }, connections: ["station", "field-high"] },
    { id: "field-low", type: "nebula", name: "저위험 성운", danger: 2, pos: { x: 20, y: 0 }, connections: ["field-high"] },
    { id: "field-high", type: "unknown", name: "고위험 격리구역", danger: 5, pos: { x: 30, y: 0 }, connections: ["distress", "field-low", "exit"] },
    { id: "exit", type: "exit", name: "섹터 관문", danger: 1, pos: { x: 50, y: 0 }, connections: ["field-high"] },
  ],
  edges: [],
};

function itemQty(itemId) { return useInventoryStore.getState().items.find((item) => item.id === itemId)?.qty ?? 0; }
function runtime() { return Object.values(useMissionStore.getState().eventRuntimesById).find((entry) => entry.chainId === QUARANTINE_PULSE.chainId); }
function present(minute = useGameStore.getState().currentMinute) { processEncounterOrchestration(minute); return useMissionStore.getState().pendingStoryEncounterByVesselId[vesselId]; }
function choose(optionId, afterStep) {
  const encounter = useMissionStore.getState().pendingStoryEncounterByVesselId[vesselId];
  const leadCrewId = ["standard-care", "nanogel-care"].includes(optionId) ? "medic-rho" : null;
  return settleEventChainChoice({ vesselId, runtimeId: encounter.runtimeId, stageId: encounter.stageId, claimId: encounter.claimId, optionId, leadCrewId, currentMinute: useGameStore.getState().currentMinute, afterStep });
}
function startBoarding() {
  useNavStore.setState({ pendingEncounter: distress });
  expect(applyNavigationEncounter("rescue", 100, { manual: true, expectedClaimId: distress.claimId })).toMatchObject({ ok: true, started: true, chainId: QUARANTINE_PULSE.chainId });
  expect(present()).toMatchObject({ stageId: "quarantine-boarding" });
  expect(choose("board-quarantine")).toMatchObject({ ok: true, scheduled: true });
  expect(useGameStore.getState().resources.oxygen).toBe(95);
  useGameStore.setState({ currentMinute: 340 });
  return present(340);
}
function finishTreatment(optionId = "standard-care") {
  startBoarding();
  expect(choose(optionId)).toMatchObject({ ok: true, waitingJob: true });
  let job = useJobStore.getState().jobs.find((entry) => entry.payload?.story?.chainId === QUARANTINE_PULSE.chainId);
  useJobStore.getState().runScheduler({ currentMinute: 340, crew: useCrewStore.getState().crew });
  useJobStore.getState().runScheduler({ currentMinute: 350, crew: useCrewStore.getState().crew });
  job = useJobStore.getState().jobs.find((entry) => entry.id === job.id);
  useJobStore.setState((state) => ({ jobs: state.jobs.map((entry) => entry.id === job.id ? { ...entry, status: "done", progress: 1 } : entry) }));
  reconcileEventChainRuntimes(700);
  return { job, targetId: runtime().waitingLocation?.nodeId };
}

beforeEach(() => {
  useShipStore.setState({ activeVesselId: vesselId });
  useGameStore.setState({ currentMinute: 100, isPaused: true, resources: { credits: 1000, fuel: 100, oxygen: 100, hull: 100 }, encounterReceipts: {}, logs: [], news: [] });
  useInventoryStore.setState((state) => ({ items: state.items.map((item) => ({ ...item, qty: item.id === "nanite-gel" ? 1 : 0 })), encounterReceipts: {}, storyConsumeReceipts: {} }));
  useCrewStore.setState({ crew: baseCrew.map((member) => ({ ...member })) , encounterReceipts: {} });
  useRecruitStore.setState({ candidatePool: [], encounterReceipts: {} });
  useReportStore.setState({ reports: [], storyReceipts: {} });
  useMissionStore.setState({ activeByVesselId: {}, pendingMissionEncountersByVesselId: {}, eventRuntimesById: {}, pendingStoryEncounterByVesselId: {}, storyFlags: {}, storyHistory: [] });
  useNavStore.setState({ sector, sectorIndex: 0, currentNodeId: "distress", route: ["distress"], travel: null, pendingEncounter: null, driftState: null, discovered: ["station", "distress"], visited: ["distress"], storyMarkersByNodeId: {} });
  useJobStore.setState({ jobs: [] });
  useCombatStore.setState({ combatByVesselId: {} });
  useExplorationStore.setState({ pendingCombatEncounter: null });
});

describe("Phase 25 quarantine pulse", () => {
  it("shows the exact credit payout on the coordinate-only distress option", () => {
    const mark = distress.options.find((option) => option.id === "mark");
    expect(mark.label).toBe("좌표만 구조망에 전송 · ₢+80");
    useNavStore.setState({ pendingEncounter: distress });
    expect(applyNavigationEncounter("mark", 100, { expectedClaimId: distress.claimId })).toMatchObject({ ok: true });
    expect(useGameStore.getState().resources.credits).toBe(1080);
  });

  it("starts exactly once from the exact manual survivor rescue and removes the generic instant recruit", () => {
    const rescue = distress.options.find((option) => option.id === "rescue");
    expect(rescue.manualOnly).toBe(true);
    expect(rescue.outcome.some((effect) => effect.kind === "recruitOffer")).toBe(false);
    useNavStore.setState({ pendingEncounter: distress });
    expect(applyNavigationEncounter("rescue", 100, { expectedClaimId: distress.claimId })).toMatchObject({ ok: false, reason: "manualOnly" });
    expect(applyNavigationEncounter("rescue", 100, { manual: true, expectedClaimId: "stale" })).toMatchObject({ ok: false, reason: "staleClaim" });
    expect(() => applyNavigationEncounter("rescue", 100, { manual: true, expectedClaimId: distress.claimId, afterStep: (step) => { if (step === "storyRuntime") throw new Error("crash"); } })).toThrow("crash");
    expect(Object.values(useMissionStore.getState().eventRuntimesById)).toHaveLength(1);
    expect(applyNavigationEncounter("rescue", 101, { manual: true, expectedClaimId: distress.claimId })).toMatchObject({ ok: true });
    expect(Object.values(useMissionStore.getState().eventRuntimesById)).toHaveLength(1);
    expect(useMissionStore.getState().storyFlags[QUARANTINE_PULSE.startedFlagId].value).toBe(true);
  });

  it("turns later survivor rescues into a truthful +1 reputation fallback with crash-safe one-time settlement", () => {
    useNavStore.setState({ pendingEncounter: distress });
    applyNavigationEncounter("rescue", 100, { manual: true, expectedClaimId: distress.claimId });
    const second = { ...distress, claimId: "nav:distress:survivor:2" };
    useNavStore.setState({ pendingEncounter: second });
    const shown = presentEventChainStarterOption(second.options.find((option) => option.id === "rescue"), useMissionStore.getState().storyFlags);
    expect(shown.label).toContain("평판 +1");
    expect(shown.repeatPreview).toContain("반복 구조");
    expect(() => applyNavigationEncounter("rescue", 200, { manual: true, expectedClaimId: second.claimId, afterStep: (step) => { if (step === "repeatEffect:0") throw new Error("repeat-crash"); } })).toThrow("repeat-crash");
    expect(itemQty("reputation-token")).toBe(1);
    expect(applyNavigationEncounter("rescue", 201, { manual: true, expectedClaimId: second.claimId })).toMatchObject({ ok: true, started: false });
    expect(itemQty("reputation-token")).toBe(1);
    expect(Object.values(useMissionStore.getState().eventRuntimesById).filter((entry) => entry.chainId === QUARANTINE_PULSE.chainId)).toHaveLength(1);
  });

  it("offers the ethical safe exit and schedules stage two at exactly +240 without hidden rolls", () => {
    useNavStore.setState({ pendingEncounter: distress });
    applyNavigationEncounter("rescue", 100, { manual: true, expectedClaimId: distress.claimId });
    present();
    const stage = getEventChain(QUARANTINE_PULSE.chainId).stages[0];
    expect(stage.options.every((option) => option.manualOnly)).toBe(true);
    expect(choose("board-quarantine")).toMatchObject({ ok: true, scheduled: true });
    expect(runtime()).toMatchObject({ stageId: "vitals-drop", dueAtMinute: 340, missionId: null });
    expect(present(339)).toBeUndefined();
    expect(present(340)).toMatchObject({ stageId: "vitals-drop" });
  });

  it("truthfully disables treatment without a usable medic while preserving remote transfer", () => {
    startBoarding();
    useMissionStore.setState((state) => ({ pendingStoryEncounterByVesselId: {}, eventRuntimesById: { ...state.eventRuntimesById, [runtime().id]: { ...runtime(), status: "scheduled" } } }));
    useCrewStore.setState({ crew: baseCrew.filter((member) => member.role !== "의무실") });
    const card = present(340);
    expect(card.options.find((option) => option.id === "standard-care")).toMatchObject({ disabled: true });
    expect(card.options.find((option) => option.id === "nanogel-care")).toMatchObject({ disabled: true });
    expect(card.options.find((option) => option.id === "remote-transfer")).toMatchObject({ disabled: false });
    expect(choose("standard-care")).toMatchObject({ ok: false, reason: "medicUnavailable" });
    expect(choose("remote-transfer")).toMatchObject({ ok: true, finalized: true });
    expect(itemQty("reputation-token")).toBe(1);
  });

  it("rejects insufficient oxygen and missing gel before any cost receipt while keeping the live card", () => {
    const card = startBoarding();
    const claimId = card.claimId;
    useGameStore.setState((state) => ({ resources: { ...state.resources, oxygen: 2 } }));
    expect(choose("standard-care")).toMatchObject({ ok: false, reason: "insufficientResource" });
    expect(useMissionStore.getState().pendingStoryEncounterByVesselId[vesselId].claimId).toBe(claimId);
    expect(useGameStore.getState().resources.oxygen).toBe(2);
    useGameStore.setState((state) => ({ resources: { ...state.resources, oxygen: 100 } }));
    useInventoryStore.setState((state) => ({ items: state.items.map((item) => item.id === "nanite-gel" ? { ...item, qty: 0 } : item) }));
    expect(choose("nanogel-care")).toMatchObject({ ok: false, reason: "missingItem" });
    expect(useGameStore.getState().resources.oxygen).toBe(100);
  });

  it("uses the selected medic's resolved nanogel job, queues behind a busy slot, refunds only nanogel before start, and never refunds oxygen", () => {
    startBoarding();
    useJobStore.getState().enqueueJob({ id: "busy-medbay", type: "recovery", roomId: "medbay", status: "in_progress", assignedCrewId: "captain-yun", duration: 999, startedAt: 0, payload: { targetCrewId: "captain-yun" } });
    useMissionStore.setState((state) => ({ pendingStoryEncounterByVesselId: {}, eventRuntimesById: { ...state.eventRuntimesById, [runtime().id]: { ...runtime(), status: "scheduled" } } }));
    const card = present(340);
    expect(card.options.find((option) => option.id === "nanogel-care").waitText).toContain("대기열");
    expect(choose("nanogel-care")).toMatchObject({ ok: true, waitingJob: true });
    const job = useJobStore.getState().jobs.find((entry) => entry.payload?.story);
    // Medic Rho meets the threshold; the equipped trauma harness resolves
    // authored 180 minutes to 150 and reduces the completion fatigue by 4.
    expect(job).toMatchObject({ type: "treatment", roomId: "medbay", assignedCrewId: "medic-rho", duration: 150, requiredRole: "medic", status: "backlog" });
    expect(job.payload.story.lead).toMatchObject({ leadCrewId: "medic-rho", context: "quarantine", threshold: 14, tier: "standard", modifiers: { durationMinutes: -30, fatigueDelta: -4 } });
    expect(job.payload.targetCrewId).toBe("medic-rho");
    expect(itemQty("nanite-gel")).toBe(0);
    expect(useGameStore.getState().resources.oxygen).toBe(92);
    expect(cancelEventChainJob({ jobId: job.id, currentMinute: 341 })).toMatchObject({ ok: true, refunded: true });
    expect(itemQty("nanite-gel")).toBe(1);
    expect(useGameStore.getState().resources.oxygen).toBe(92);
    reconcileEventChainRuntimes(342);
    expect(itemQty("nanite-gel")).toBe(1);
  });

  it("truthfully marks treatment as queued behind an earlier medbay backlog job or a medic reserved in another room", () => {
    startBoarding();
    useJobStore.getState().enqueueJob({ id: "earlier-medbay", type: "recovery", roomId: "medbay", status: "backlog", priority: "high", createdAt: 10, duration: 120, payload: { targetCrewId: "captain-yun" } });
    useMissionStore.setState((state) => ({ pendingStoryEncounterByVesselId: {}, eventRuntimesById: { ...state.eventRuntimesById, [runtime().id]: { ...runtime(), status: "scheduled" } } }));
    let card = present(340);
    expect(card.options.find((option) => option.id === "standard-care").waitText).toContain("대기열");

    useJobStore.setState({ jobs: [] });
    useJobStore.getState().enqueueJob({ id: "living-training", type: "training", roomId: "living", status: "assigned", assignedCrewId: "medic-rho", priority: "normal", createdAt: 10, arrivalAt: 999, duration: 120, payload: { targetCrewId: "medic-rho", statKey: "analysis" } });
    useMissionStore.setState((state) => ({ pendingStoryEncounterByVesselId: {}, eventRuntimesById: { ...state.eventRuntimesById, [runtime().id]: { ...runtime(), status: "scheduled" } } }));
    card = present(340);
    expect(card.options.find((option) => option.id === "nanogel-care").waitText).toContain("대기열");
    expect(card.options.find((option) => option.id === "nanogel-care").disabled).toBe(false);
  });

  it.each(["cancelIntent", "jobCancelled"])("recovers a player cancel crash after %s with exactly one gel refund", (crashStep) => {
    startBoarding(); choose("nanogel-care");
    const job = useJobStore.getState().jobs.find((entry) => entry.payload?.story);
    expect(() => cancelEventChainJob({ jobId: job.id, currentMinute: 341, afterStep: (step) => { if (step === crashStep) throw new Error("cancel-crash"); } })).toThrow("cancel-crash");
    reconcileEventChainRuntimes(342);
    reconcileEventChainRuntimes(343);
    expect(runtime()).toMatchObject({ stageId: "vitals-drop", status: "scheduled", waitingJob: null });
    expect(itemQty("nanite-gel")).toBe(1);
    expect(useGameStore.getState().resources.oxygen).toBe(92);
  });

  it("pins the selected medic and trauma harness result, applies resolved fatigue once, persists the nearest station marker, and blocks the gate", () => {
    const before = useCrewStore.getState().crew.find((member) => member.id === "medic-rho").fatigue;
    const { job, targetId } = finishTreatment("standard-care");
    // Standard care: authored 360 - trauma harness 30 = 330 minutes.
    expect(job).toMatchObject({ duration: 330, assignedCrewId: "medic-rho" });
    expect(job.payload.story.lead).toMatchObject({ leadCrewId: "medic-rho", context: "quarantine", tier: "standard", modifiers: { durationMinutes: -30, fatigueDelta: -4 } });
    expect(runtime()).toMatchObject({ status: "waitingLocation", waitingLocation: { nodeId: "station", sectorId: sector.id } });
    expect(targetId).toBe("station");
    expect(useNavStore.getState().storyMarkersByNodeId.station.label).toBe(QUARANTINE_PULSE.markerLabel);
    // The scheduler's normal work fatigue remains; the harness lowers the
    // immutable completion payload from 18 to 14, for a net +18 here.
    expect(useCrewStore.getState().crew.find((member) => member.id === "medic-rho").fatigue).toBe(before + 18);
    reconcileEventChainRuntimes(701);
    expect(useCrewStore.getState().crew.find((member) => member.id === "medic-rho").fatigue).toBe(before + 18);
    expect(hasSectorBoundStoryRuntime(vesselId)).toBe(true);
    expect(getSectorBoundStoryBlocker(vesselId).title).toBe("격리선의 맥박");
  });

  it("completes treatment on a large no-panel tick and reveals the sector exit when no station or exit was discovered", () => {
    startBoarding(); choose("standard-care");
    useNavStore.setState({ discovered: ["distress"] });
    useJobStore.getState().runScheduler({ currentMinute: 340, crew: useCrewStore.getState().crew });
    useJobStore.getState().runScheduler({ currentMinute: 350, crew: useCrewStore.getState().crew });
    useGameStore.setState({ currentMinute: 800 });
    expect(() => processTimedJobs(450)).not.toThrow();
    expect(runtime()).toMatchObject({ status: "waitingLocation", waitingLocation: { nodeId: "exit" } });
    expect(useNavStore.getState().discovered).toContain("exit");
    expect(useNavStore.getState().storyMarkersByNodeId.exit.label).toBe(QUARANTINE_PULSE.markerLabel);
  });

  it("fails deterministically on interrupted care or missing jobs and leaves no soft lock", () => {
    startBoarding(); choose("standard-care");
    const job = useJobStore.getState().jobs.find((entry) => entry.payload?.story);
    useJobStore.setState((state) => ({ jobs: state.jobs.map((entry) => entry.id === job.id ? { ...entry, status: "failed", payload: { ...entry.payload, story: { ...entry.payload.story, failureReason: "assignedMedicDied" } } } : entry) }));
    reconcileEventChainRuntimes(400);
    expect(runtime()).toMatchObject({ status: "failed" });
    expect(hasSectorBoundStoryRuntime(vesselId)).toBe(false);
    expect(useReportStore.getState().reports.filter((report) => report.meta?.navKind === "storyOutcome")).toHaveLength(1);

    useMissionStore.setState({ eventRuntimesById: {}, pendingStoryEncounterByVesselId: {}, storyFlags: {}, storyHistory: [] });
    useJobStore.setState({ jobs: [] });
    useNavStore.setState({ pendingEncounter: distress });
    applyNavigationEncounter("rescue", 500, { manual: true, expectedClaimId: distress.claimId }); present(500); choose("board-quarantine");
    useGameStore.setState({ currentMinute: 740 }); present(740); choose("standard-care");
    useJobStore.setState({ jobs: [] }); reconcileEventChainRuntimes(741);
    expect(runtime().status).toBe("failed");
    expect(hasSectorBoundStoryRuntime(vesselId)).toBe(false);
  });

  it("settles each finale once, prevents duplicate recruits, and reveals the highest-danger hidden field", () => {
    expect(getCandidateRecruitCost("rare")).toBe(QUARANTINE_PULSE.recruitCost);
    expect(getTemplatesByRarity("rare").some((entry) => entry.templateId === QUARANTINE_PULSE.recruitTemplateId)).toBe(false);
    finishTreatment("nanogel-care");
    useNavStore.setState({ currentNodeId: runtime().waitingLocation.nodeId });
    reconcileEventChainRuntimes(701); processEncounterOrchestration(701);
    const encounter = useMissionStore.getState().pendingStoryEncounterByVesselId[vesselId];
    expect(choose("public-testimony")).toMatchObject({ ok: true, finalized: true });
    expect(itemQty("reputation-token")).toBe(2);
    expect(useNavStore.getState().discovered).toContain("field-high");
    expect(useNavStore.getState().discovered).not.toContain("field-low");
    const report = useReportStore.getState().reports.find((entry) => entry.meta?.navKind === "storyOutcome");
    expect(report.body).toBe("공개 증언 — 평판 +2, 고위험 격리구역 공개.");
    expect(report.meta).toMatchObject({ targetNodeId: "field-high", reputation: 2 });
    expect(useGameStore.getState().logs.some((entry) => entry.includes("평판 +2, 고위험 격리구역 공개"))).toBe(true);
    expect(settleEventChainChoice({ vesselId, runtimeId: encounter.runtimeId, stageId: encounter.stageId, claimId: encounter.claimId, optionId: "public-testimony", currentMinute: 702 }).ok).toBe(false);
    expect(itemQty("reputation-token")).toBe(2);
    expect(useReportStore.getState().reports.filter((report) => report.meta?.navKind === "storyOutcome")).toHaveLength(1);
  });

  it("pins the public-testimony target before reveal so a receipt crash cannot reveal a second field", () => {
    finishTreatment();
    useNavStore.setState({ currentNodeId: runtime().waitingLocation.nodeId });
    reconcileEventChainRuntimes(701); processEncounterOrchestration(701);
    const encounter = useMissionStore.getState().pendingStoryEncounterByVesselId[vesselId];
    expect(() => choose("public-testimony", (step) => { if (step === "publicReveal:0") throw new Error("reveal-crash"); })).toThrow("reveal-crash");
    expect(useNavStore.getState().discovered).toContain("field-high");
    expect(useNavStore.getState().discovered).not.toContain("field-low");
    expect(itemQty("reputation-token")).toBe(2);
    expect(runtime().pendingClaim.effectState["revealHighestDangerOrReputation:0"].targetNodeId).toBe("field-high");
    expect(settleEventChainChoice({ vesselId, runtimeId: encounter.runtimeId, stageId: encounter.stageId, claimId: encounter.claimId, optionId: "public-testimony", currentMinute: 702 })).toMatchObject({ ok: true, finalized: true });
    expect(useNavStore.getState().discovered).not.toContain("field-low");
    expect(itemQty("reputation-token")).toBe(2);
    expect(useReportStore.getState().reports.filter((report) => report.meta?.navKind === "storyOutcome")).toHaveLength(1);
    expect(useReportStore.getState().reports[0].body).toBe("공개 증언 — 평판 +2, 고위험 격리구역 공개.");
  });

  it("prevents a duplicate story recruit without consuming the finale and keeps the separate rare fee contract", () => {
    finishTreatment();
    useNavStore.setState({ currentNodeId: runtime().waitingLocation.nodeId });
    reconcileEventChainRuntimes(701); processEncounterOrchestration(701);
    const encounter = useMissionStore.getState().pendingStoryEncounterByVesselId[vesselId];
    useRecruitStore.setState({ candidatePool: [{ id: "existing", templateId: QUARANTINE_PULSE.recruitTemplateId }] });
    expect(choose("protective-testimony")).toMatchObject({ ok: false, reason: "recruitUnavailable" });
    expect(useMissionStore.getState().pendingStoryEncounterByVesselId[vesselId].claimId).toBe(encounter.claimId);
    expect(useGameStore.getState().resources.credits).toBe(1000);
    expect(encounter.options.find((option) => option.id === "protective-testimony").label).toContain(`편입비 ₢${QUARANTINE_PULSE.recruitCost} 별도`);
  });

  it("keeps a mission-independent chain alive when an unrelated mission fails", () => {
    startBoarding();
    useMissionStore.setState((state) => ({ activeByVesselId: { [vesselId]: { id: "unrelated", title: "별개 임무", status: "active", vesselId } }, eventRuntimesById: state.eventRuntimesById }));
    expect(useMissionStore.getState().failMission({ vesselId, currentMinute: 350, reason: "test", expectedMissionId: "unrelated" })).toMatchObject({ ok: true });
    expect(runtime()).toMatchObject({ missionId: null, status: "pending" });
    expect(hasSectorBoundStoryRuntime(vesselId)).toBe(true);
  });

  it("uses the truthful +3 reputation fallback when no eligible hidden field exists", () => {
    finishTreatment();
    useNavStore.setState({ currentNodeId: runtime().waitingLocation.nodeId, discovered: sector.nodes.map((node) => node.id) });
    reconcileEventChainRuntimes(701); processEncounterOrchestration(701);
    const card = useMissionStore.getState().pendingStoryEncounterByVesselId[vesselId];
    expect(card.options.find((option) => option.id === "public-testimony").label).toContain("없으면 평판 +3");
    expect(choose("public-testimony")).toMatchObject({ ok: true });
    expect(itemQty("reputation-token")).toBe(3);
    const report = useReportStore.getState().reports.find((entry) => entry.meta?.navKind === "storyOutcome");
    expect(report.body).toBe("공개 증언 — 평판 +3, 새 좌표 없음.");
    expect(report.meta).toMatchObject({ targetNodeId: null, reputation: 3 });
    expect(useGameStore.getState().logs.some((entry) => entry.includes("평판 +3, 새 좌표 없음"))).toBe(true);
  });

  it("snapshots the selected medic and authored trauma harness into Quarantine treatment", () => {
    useEquipmentStore.setState({ instances: [{ instanceId: "harness", equipmentId: "trauma-harness", ownerCrewId: "medic-rho", equippedSlot: "primary", escrowedForCrewId: null }], revision: 0, receipts: {} });
    startBoarding();
    expect(choose("standard-care")).toMatchObject({ ok: true, waitingJob: true });
    const job = useJobStore.getState().jobs.find((entry) => entry.payload?.story);
    expect(job).toMatchObject({ assignedCrewId: "medic-rho", duration: 330, payload: { targetCrewId: "medic-rho", story: { leadCrewId: "medic-rho" } } });
    expect(job.payload.story.completionCrewFatigue).toBe(14);
    useJobStore.getState().runScheduler({ currentMinute: 340, crew: useCrewStore.getState().crew });
    useJobStore.getState().runScheduler({ currentMinute: 350, crew: useCrewStore.getState().crew });
    expect(useJobStore.getState().jobs.find((entry) => entry.id === job.id)).toMatchObject({ status: "in_progress", assignedCrewId: "medic-rho" });
  });
});
