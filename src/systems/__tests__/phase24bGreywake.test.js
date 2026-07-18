import { beforeEach, describe, expect, it, vi } from "vitest";
import { GREYWAKE } from "../../data/constants";
import { getEventChain } from "../../data/eventChains";
import { ENCOUNTER_TABLE } from "../../data/navEncounters";
import { getCandidateRecruitCost, getTemplatesByRarity } from "../../data/recruitment";
import { presentStoryChoiceResult } from "../../components/panels/Exploration";
import { handleOverviewNavigationEncounter } from "../../components/panels/Overview";
import { getStoryLeadProjection, settleEventChainChoice, cancelEventChainJob, hasSectorBoundStoryRuntime, reconcileEventChainCombatOutcome, reconcileEventChainRuntimes } from "../../orchestration/eventChainOrchestrator";
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
const salvage = {
  id: "debris-salvage",
  claimId: "nav:debris:debris-salvage:2",
  nodeId: "debris",
  nodeType: "debris",
  title: "표류 잔해 회수",
  options: [
    { id: "salvage", label: "직접 잔해 인양", manualOnly: true, outcome: [{ kind: "resource", delta: { credits: 220, hull: -3 } }, { kind: "startEventChain", chainId: GREYWAKE.chainId, manualOnly: true }] },
    { id: "skip", label: "안전 통과", outcome: [] },
  ],
};

const sector = {
  id: "greywake-sector",
  seed: "greywake-test",
  nodes: [
    { id: "station", type: "station", name: "앵커", discovered: true, visited: true, connections: ["debris"], pos: { x: 10, y: 10 } },
    { id: "debris", type: "debris", name: "회수 현장", discovered: true, visited: true, connections: ["station", "hidden"], pos: { x: 30, y: 20 } },
    { id: "hidden", type: "unknown", name: "마지막 당직", discovered: false, visited: false, connections: ["debris", "unvisited"], pos: { x: 50, y: 45 } },
    { id: "unvisited", type: "distress", name: "예비 좌표", discovered: true, visited: false, connections: ["hidden", "exit"], pos: { x: 65, y: 55 } },
    { id: "exit", type: "exit", name: "관문", discovered: true, visited: false, connections: ["unvisited"], pos: { x: 80, y: 70 } },
  ],
  edges: [
    { from: "station", to: "debris", distance: 2 },
    { from: "debris", to: "hidden", distance: 2 },
    { from: "hidden", to: "unvisited", distance: 2 },
    { from: "unvisited", to: "exit", distance: 2 },
  ],
};

function itemQty(itemId) {
  return useInventoryStore.getState().items.find((item) => item.id === itemId)?.qty ?? 0;
}

function runtime() {
  return Object.values(useMissionStore.getState().eventRuntimesById).find((entry) => entry.chainId === GREYWAKE.chainId);
}

function present() {
  processEncounterOrchestration(useGameStore.getState().currentMinute);
  return useMissionStore.getState().pendingStoryEncounterByVesselId[vesselId];
}

function choose(optionId, afterStep) {
  const encounter = useMissionStore.getState().pendingStoryEncounterByVesselId[vesselId];
  const leadCrewId = optionId === "decode-last-watch" ? "captain-yun" : null;
  return settleEventChainChoice({ vesselId, runtimeId: encounter.runtimeId, stageId: encounter.stageId, claimId: encounter.claimId, optionId, leadCrewId, currentMinute: useGameStore.getState().currentMinute, afterStep });
}

function startAndRecover() {
  useNavStore.setState({ pendingEncounter: salvage });
  expect(applyNavigationEncounter("salvage", 100, { manual: true, expectedClaimId: salvage.claimId }).ok).toBe(true);
  const first = present();
  expect(first.title).toBe("GREYWAKE // 회수 기록");
  expect(choose("recover-recorder").ok).toBe(true);
  const second = present();
  expect(second.title).toBe("GREYWAKE // 관제실 대기");
  return second;
}

beforeEach(() => {
  useShipStore.setState({ activeVesselId: vesselId });
  useGameStore.setState({ currentMinute: 100, isPaused: true, resources: { credits: 1000, fuel: 100, oxygen: 100, hull: 100 }, encounterReceipts: {}, logs: [], news: [] });
  useInventoryStore.setState((state) => ({ items: state.items.map((item) => ({ ...item, qty: 0 })), cards: [], activeCardIds: [], encounterReceipts: {}, storyConsumeReceipts: {} }));
  useRecruitStore.setState({ candidatePool: [], encounterReceipts: {} });
  useCrewStore.setState({ crew: baseCrew });
  useReportStore.setState({ reports: [], storyReceipts: {} });
  useMissionStore.setState({ activeByVesselId: {}, pendingMissionEncountersByVesselId: {}, resolvedMissionEncounters: [], eventRuntimesById: {}, pendingStoryEncounterByVesselId: {}, storyFlags: {}, storyHistory: [] });
  useNavStore.setState({ sector, sectorIndex: 0, currentNodeId: "debris", selectedNodeId: null, route: ["debris"], travel: null, pendingEncounter: null, driftState: null, discovered: ["station", "debris", "unvisited", "exit"], visited: ["station", "debris"], storyMarkersByNodeId: {} });
  useCombatStore.setState({ combatByVesselId: {}, feedByVesselId: {}, targetByVesselId: {} });
  useExplorationStore.setState({ pendingCombatEncounter: null });
  useJobStore.setState({ jobs: [] });
});

describe("Phase 24-B Greywake vertical slice", () => {
  it("shows the full salvage tradeoff and explicit story-only recruit contract before either choice", () => {
    const salvageOption = ENCOUNTER_TABLE.debris.find((entry) => entry.id === "debris-salvage").options.find((entry) => entry.id === "salvage");
    expect(salvageOption.label).toContain("₢220");
    expect(salvageOption.label).toContain("선체 -3");
    expect(salvageOption.label).toContain("미확인 기록 신호");
    const rescue = getEventChain(GREYWAKE.chainId).stages.find((stage) => stage.id === "last-watch").options.find((entry) => entry.id === "tow-lifeboat");
    expect(rescue.rewardPreview).toBeUndefined();
    expect(rescue.previewText).toContain(`편입비 ₢${GREYWAKE.recruitCost} 별도`);
    expect(rescue.label).toContain("희귀 센서 분석가 후보");
    expect(GREYWAKE.recruitCost).toBe(getCandidateRecruitCost("rare"));
    expect(getTemplatesByRarity("rare").some((entry) => entry.templateId === GREYWAKE.recruitTemplateId)).toBe(false);
  });

  it("routes a story started from Overview to Exploration and a story combat directly to Combat", () => {
    const overviewNavigate = vi.fn();
    const overviewLog = vi.fn();
    const resolve = vi.fn(() => ({ ok: true, started: true }));
    handleOverviewNavigationEncounter({ optionId: "salvage", currentMinute: 100, pendingEncounter: salvage, onNavigate: overviewNavigate, addLog: overviewLog, resolve });
    expect(resolve).toHaveBeenCalledWith("salvage", 100, { manual: true, expectedClaimId: salvage.claimId });
    expect(overviewNavigate).toHaveBeenCalledWith("exploration");
    expect(overviewLog.mock.calls[0][0]).toContain("탐사 화면");

    const combatNavigate = vi.fn();
    const combatLog = vi.fn();
    presentStoryChoiceResult({ ok: true, waitingCombat: true, runtime: { status: "waitingCombat" } }, { addLog: combatLog, onNavigate: combatNavigate });
    expect(combatNavigate).toHaveBeenCalledWith("combat");
    expect(combatLog.mock.calls[0][0]).toContain("GREYWAKE 교전 시작");
    expect(combatLog.mock.calls[0][0]).not.toContain("다음 단계가 예약");

    const cancelLog = vi.fn();
    presentStoryChoiceResult({ ok: true, runtime: { status: "cancelled" } }, { addLog: cancelLog });
    expect(cancelLog.mock.calls[0][0]).toContain("철수");
    expect(cancelLog.mock.calls[0][0]).toContain("종료");
    expect(cancelLog.mock.calls[0][0]).not.toContain("예약");
  });

  it("starts only from the exact manual salvage claim and recovers a crash without double resources", () => {
    useNavStore.setState({ pendingEncounter: salvage });
    expect(applyNavigationEncounter("salvage", 100, { expectedClaimId: salvage.claimId })).toMatchObject({ ok: false, reason: "manualOnly" });
    expect(runtime()).toBeUndefined();
    expect(() => applyNavigationEncounter("salvage", 100, { manual: true, expectedClaimId: salvage.claimId, afterStep: (step) => { if (step === "salvageResources") throw new Error("crash"); } })).toThrow("crash");
    expect(useGameStore.getState().resources).toMatchObject({ credits: 1220, hull: 97 });
    expect(applyNavigationEncounter("salvage", 101, { manual: true, expectedClaimId: salvage.claimId }).ok).toBe(true);
    expect(useGameStore.getState().resources).toMatchObject({ credits: 1220, hull: 97 });
    expect(runtime()).toMatchObject({ stageId: "recovery-record", status: "scheduled" });
    expect(useMissionStore.getState().storyFlags[GREYWAKE.startedFlagId].value).toBe(true);
  });

  it("rejects stale tuples and invalid stages without mutating the live card", () => {
    startAndRecover();
    const encounter = useMissionStore.getState().pendingStoryEncounterByVesselId[vesselId];
    expect(settleEventChainChoice({ vesselId, runtimeId: encounter.runtimeId, stageId: "deleted", claimId: encounter.claimId, optionId: "decode-last-watch", currentMinute: 100 })).toMatchObject({ ok: false, reason: "staleEncounter" });
    expect(settleEventChainChoice({ vesselId, runtimeId: encounter.runtimeId, stageId: encounter.stageId, claimId: "stale", optionId: "decode-last-watch", currentMinute: 100 })).toMatchObject({ ok: false, reason: "staleEncounter" });
    expect(useMissionStore.getState().pendingStoryEncounterByVesselId[vesselId].claimId).toBe(encounter.claimId);
  });

  it("queues the selected scout's Greywake job, cancels backlog once, refunds once, and rejects in-progress cancel", () => {
    startAndRecover();
    expect(itemQty(GREYWAKE.recorderItemId)).toBe(1);
    expect(choose("decode-last-watch")).toMatchObject({ ok: true, waitingJob: true });
    const job = useJobStore.getState().jobs.find((entry) => entry.payload?.story);
    // Captain Yun is 12 against Greywake's 14 threshold (+30), but starts
    // with the calibration case (-20): authored 240 → resolved 250 minutes.
    expect(job).toMatchObject({ type: "decode", roomId: "ops", assignedCrewId: "captain-yun", duration: 250, status: "backlog" });
    expect(job.payload.story.lead).toMatchObject({ leadCrewId: "captain-yun", context: "greywake", threshold: 14, tier: "below", modifiers: { durationMinutes: 10 } });
    expect(job.payload.inputItems).toBeUndefined();
    expect(itemQty(GREYWAKE.recorderItemId)).toBe(0);
    expect(cancelEventChainJob({ jobId: job.id, currentMinute: 101 })).toMatchObject({ ok: true, refunded: true });
    expect(itemQty(GREYWAKE.recorderItemId)).toBe(1);
    reconcileEventChainRuntimes(102);
    expect(itemQty(GREYWAKE.recorderItemId)).toBe(1);
    expect(runtime()).toMatchObject({ stageId: "ops-wait", status: "scheduled" });
    useGameStore.setState({ currentMinute: 102 });
    present();
    choose("decode-last-watch");
    const retry = useJobStore.getState().jobs.find((entry) => entry.payload?.story && entry.status === "backlog");
    useJobStore.setState((state) => ({ jobs: state.jobs.map((entry) => entry.id === retry.id ? { ...entry, status: "in_progress", startedAt: 102 } : entry) }));
    expect(cancelEventChainJob({ jobId: retry.id, currentMinute: 103 })).toMatchObject({ ok: false, reason: "in_progress" });
    expect(itemQty(GREYWAKE.recorderItemId)).toBe(0);
  });

  it("keeps the selected lead's resolved Greywake duration under work-speed cards", () => {
    startAndRecover();
    useInventoryStore.setState({ cards: [{ id: "salvage-team", instanceId: "speed-card", modifiers: { jobSpeedMult: 1.1 } }], activeCardIds: ["speed-card"] });
    choose("decode-last-watch");
    let job = useJobStore.getState().jobs.find((entry) => entry.payload?.story);
    expect(job.duration).toBe(250);
    const tiredCrew = useCrewStore.getState().crew.map((member) => member.id === "captain-yun" ? { ...member, morale: "나쁨", fatigue: 80 } : member);
    useJobStore.getState().runScheduler({ currentMinute: 100, crew: tiredCrew });
    useJobStore.getState().runScheduler({ currentMinute: 200, crew: tiredCrew });
    job = useJobStore.getState().jobs.find((entry) => entry.payload?.story);
    expect(job).toMatchObject({ status: "in_progress", effectiveDuration: 250, moodWorkMultiplier: 1 });
  });

  it("recovers a done story job without UI, pins one exact hidden node and persists its marker", () => {
    startAndRecover();
    choose("decode-last-watch");
    const job = useJobStore.getState().jobs.find((entry) => entry.payload?.story);
    useJobStore.setState((state) => ({ jobs: state.jobs.map((entry) => entry.id === job.id ? { ...entry, status: "done", progress: 1 } : entry) }));
    reconcileEventChainRuntimes(340);
    expect(runtime()).toMatchObject({ status: "waitingLocation", waitingLocation: { nodeId: "hidden", sectorId: sector.id } });
    expect(useNavStore.getState().discovered).toContain("hidden");
    expect(useNavStore.getState().storyMarkersByNodeId.hidden).toMatchObject({ runtimeId: runtime().id, label: GREYWAKE.markerLabel });
    const merged = useNavStore.persist.getOptions().merge({ ...useNavStore.getState() }, useNavStore.getState());
    expect(merged.storyMarkersByNodeId.hidden.runtimeId).toBe(runtime().id);
    reconcileEventChainRuntimes(400);
    expect(Object.keys(useNavStore.getState().storyMarkersByNodeId)).toEqual(["hidden"]);
  });

  it("reuses a target pinned before reveal and cleans orphan markers for terminal runtimes", () => {
    startAndRecover(); choose("decode-last-watch");
    const job = useJobStore.getState().jobs.find((entry) => entry.payload?.story);
    useJobStore.setState((state) => ({ jobs: state.jobs.map((entry) => entry.id === job.id ? { ...entry, status: "done" } : entry) }));
    useMissionStore.setState((state) => ({ eventRuntimesById: { ...state.eventRuntimesById, [runtime().id]: { ...runtime(), waitingJob: { ...runtime().waitingJob, targetNodeId: "hidden", targetSectorId: sector.id } } } }));
    useNavStore.getState().revealStoryTarget({ runtimeId: runtime().id, nodeId: "hidden", label: GREYWAKE.markerLabel, sectorId: sector.id });
    reconcileEventChainRuntimes(340);
    expect(runtime().waitingLocation.nodeId).toBe("hidden");
    useMissionStore.setState((state) => ({ eventRuntimesById: { ...state.eventRuntimesById, [runtime().id]: { ...runtime(), status: "completed", waitingLocation: null } } }));
    reconcileEventChainRuntimes(341);
    expect(useNavStore.getState().storyMarkersByNodeId).toEqual({});
  });

  it("does not show the finale early and defers it behind nav encounters and combat", () => {
    startAndRecover();
    choose("decode-last-watch");
    const job = useJobStore.getState().jobs.find((entry) => entry.payload?.story);
    useJobStore.setState((state) => ({ jobs: state.jobs.map((entry) => entry.id === job.id ? { ...entry, status: "done" } : entry) }));
    reconcileEventChainRuntimes(340);
    expect(present()).toBeUndefined();
    useNavStore.setState({ currentNodeId: runtime().waitingLocation.nodeId, pendingEncounter: { id: "blocking-nav" } });
    reconcileEventChainRuntimes(341); processEncounterOrchestration(341);
    expect(useMissionStore.getState().pendingStoryEncounterByVesselId[vesselId]).toBeUndefined();
    useNavStore.setState({ pendingEncounter: null });
    useCombatStore.setState({ combatByVesselId: { [vesselId]: { status: "engaged", source: { kind: "free" } } } });
    processEncounterOrchestration(342);
    expect(useMissionStore.getState().pendingStoryEncounterByVesselId[vesselId]).toBeUndefined();
    useCombatStore.setState({ combatByVesselId: {} });
    processEncounterOrchestration(343);
    expect(useMissionStore.getState().pendingStoryEncounterByVesselId[vesselId]).toMatchObject({ stageId: "last-watch" });
  });

  it("settles rescue and sale receipts once and truthfully enforces oxygen cost", () => {
    startAndRecover(); choose("decode-last-watch");
    const job = useJobStore.getState().jobs.find((entry) => entry.payload?.story);
    useJobStore.setState((state) => ({ jobs: state.jobs.map((entry) => entry.id === job.id ? { ...entry, status: "done" } : entry) }));
    reconcileEventChainRuntimes(340);
    useNavStore.setState({ currentNodeId: runtime().waitingLocation.nodeId, pendingEncounter: null });
    reconcileEventChainRuntimes(341); processEncounterOrchestration(341);
    useGameStore.setState((state) => ({ resources: { ...state.resources, oxygen: 2 } }));
    expect(choose("tow-lifeboat")).toMatchObject({ ok: false, reason: "insufficientResource" });
    expect(useMissionStore.getState().pendingStoryEncounterByVesselId[vesselId]).toBeTruthy();
    useGameStore.setState((state) => ({ resources: { ...state.resources, oxygen: 100 } }));
    const encounter = useMissionStore.getState().pendingStoryEncounterByVesselId[vesselId];
    expect(choose("sell-coordinates")).toMatchObject({ ok: true, finalized: true });
    expect(useGameStore.getState().resources.credits).toBe(1640);
    expect(settleEventChainChoice({ vesselId, runtimeId: encounter.runtimeId, stageId: encounter.stageId, claimId: encounter.claimId, optionId: "sell-coordinates", currentMinute: 342 }).ok).toBe(false);
    expect(useGameStore.getState().resources.credits).toBe(1640);
    expect(useNavStore.getState().storyMarkersByNodeId).toEqual({});
    const storyReports = useReportStore.getState().reports.filter((entry) => entry.meta?.navKind === "storyOutcome");
    expect(storyReports).toHaveLength(1);
    expect(storyReports[0].body).toContain("좌표 매각");
    expect(storyReports[0].body).toContain(`₢${GREYWAKE.saleCredits}`);
  });

  it("keeps rescue selectable and oxygen untouched when its unique candidate is already present or serving", () => {
    startAndRecover(); choose("decode-last-watch");
    const job = useJobStore.getState().jobs.find((entry) => entry.payload?.story);
    useJobStore.setState((state) => ({ jobs: state.jobs.map((entry) => entry.id === job.id ? { ...entry, status: "done" } : entry) }));
    reconcileEventChainRuntimes(340);
    useNavStore.setState({ currentNodeId: runtime().waitingLocation.nodeId });
    reconcileEventChainRuntimes(341); processEncounterOrchestration(341);
    const encounter = useMissionStore.getState().pendingStoryEncounterByVesselId[vesselId];

    useRecruitStore.setState({ candidatePool: [{ id: "duplicate", templateId: GREYWAKE.recruitTemplateId }] });
    const oxygenBeforeRejectedRescue = useGameStore.getState().resources.oxygen;
    expect(choose("tow-lifeboat")).toMatchObject({ ok: false, reason: "recruitUnavailable" });
    expect(useGameStore.getState().resources.oxygen).toBe(oxygenBeforeRejectedRescue);
    expect(useMissionStore.getState().pendingStoryEncounterByVesselId[vesselId].claimId).toBe(encounter.claimId);

    useRecruitStore.setState({ candidatePool: [] });
    useCrewStore.setState({ crew: [...baseCrew, { id: "serving-greywake", templateId: GREYWAKE.recruitTemplateId, alive: true }] });
    expect(choose("tow-lifeboat")).toMatchObject({ ok: false, reason: "recruitUnavailable" });
    expect(useGameStore.getState().resources.oxygen).toBe(100);
    expect(useMissionStore.getState().pendingStoryEncounterByVesselId[vesselId].claimId).toBe(encounter.claimId);
  });

  it("recovers exact-balance oxygen and receiver-receipt crashes without losing the card outcome", () => {
    startAndRecover(); choose("decode-last-watch");
    const job = useJobStore.getState().jobs.find((entry) => entry.payload?.story);
    useJobStore.setState((state) => ({ jobs: state.jobs.map((entry) => entry.id === job.id ? { ...entry, status: "done" } : entry) }));
    reconcileEventChainRuntimes(340);
    useNavStore.setState({ currentNodeId: runtime().waitingLocation.nodeId });
    reconcileEventChainRuntimes(341); processEncounterOrchestration(341);
    useGameStore.setState((state) => ({ resources: { ...state.resources, oxygen: GREYWAKE.rescueOxygenCost } }));
    const encounter = useMissionStore.getState().pendingStoryEncounterByVesselId[vesselId];
    expect(() => choose("tow-lifeboat", (step) => { if (step === "resource:0") throw new Error("receiver-crash"); })).toThrow("receiver-crash");
    expect(useGameStore.getState().resources.oxygen).toBe(0);
    expect(runtime()).toMatchObject({ status: "settling", pendingClaim: { claimId: encounter.claimId } });
    // Simulate the narrow crash after gameStore persisted its receipt but
    // before missionStore persisted its mirror receipt.
    useMissionStore.setState((state) => ({ eventRuntimesById: { ...state.eventRuntimesById, [runtime().id]: { ...runtime(), pendingClaim: { ...runtime().pendingClaim, receipts: {} } } } }));
    expect(settleEventChainChoice({ vesselId, runtimeId: encounter.runtimeId, stageId: encounter.stageId, claimId: encounter.claimId, optionId: "tow-lifeboat", currentMinute: 342 })).toMatchObject({ ok: true, finalized: true });
    expect(useGameStore.getState().resources.oxygen).toBe(0);
    expect(useRecruitStore.getState().candidatePool.filter((entry) => entry.templateId === GREYWAKE.recruitTemplateId)).toHaveLength(1);
  });

  it("starts named combat without overwrite and grants conditional loot once only on victory", () => {
    startAndRecover(); choose("decode-last-watch");
    const job = useJobStore.getState().jobs.find((entry) => entry.payload?.story);
    useJobStore.setState((state) => ({ jobs: state.jobs.map((entry) => entry.id === job.id ? { ...entry, status: "done" } : entry) }));
    reconcileEventChainRuntimes(340);
    useNavStore.setState({ currentNodeId: runtime().waitingLocation.nodeId });
    reconcileEventChainRuntimes(341); processEncounterOrchestration(341);
    const encounter = useMissionStore.getState().pendingStoryEncounterByVesselId[vesselId];
    useCombatStore.setState({ combatByVesselId: { [vesselId]: { status: "won", source: { kind: "old" } } } });
    expect(choose("fight-claim")).toMatchObject({ ok: false, reason: "combatBusy" });
    expect(useMissionStore.getState().pendingStoryEncounterByVesselId[vesselId].claimId).toBe(encounter.claimId);
    useCombatStore.setState({ combatByVesselId: {} });
    expect(choose("fight-claim")).toMatchObject({ ok: true, waitingCombat: true });
    const combat = useCombatStore.getState().combatByVesselId[vesselId];
    expect(combat).toMatchObject({ status: "engaged", enemy: { id: GREYWAKE.battleEnemyId }, source: { kind: "eventChain", claimId: encounter.claimId } });
    expect(useGameStore.getState().resources.credits).toBe(1220);
    expect(itemQty(GREYWAKE.battleItemId)).toBe(0);
    useCombatStore.setState({ combatByVesselId: { [vesselId]: { ...combat, status: "won" } } });
    expect(() => reconcileEventChainCombatOutcome(342, (step) => { if (step === "resource:0") throw new Error("combat-receiver-crash"); })).toThrow("combat-receiver-crash");
    expect(useGameStore.getState().resources.credits).toBe(1980);
    expect(itemQty(GREYWAKE.battleItemId)).toBe(0);
    expect(runtime().status).toBe("waitingCombat");
    reconcileEventChainCombatOutcome(343); reconcileEventChainCombatOutcome(344);
    expect(useGameStore.getState().resources.credits).toBe(1980);
    expect(itemQty(GREYWAKE.battleItemId)).toBe(1);
    expect(runtime().status).toBe("completed");
    const storyReports = useReportStore.getState().reports.filter((entry) => entry.meta?.navKind === "storyOutcome");
    expect(storyReports).toHaveLength(1);
    expect(storyReports[0].body).toContain(`₢${GREYWAKE.battleCredits}`);
    expect(storyReports[0].body).toContain("tactical-ai-chip x1");
  });

  it.each(["retreated", "lost"])("pays zero conditional reward on %s and leaves no blocker", (status) => {
    startAndRecover(); choose("decode-last-watch");
    const job = useJobStore.getState().jobs.find((entry) => entry.payload?.story);
    useJobStore.setState((state) => ({ jobs: state.jobs.map((entry) => entry.id === job.id ? { ...entry, status: "done" } : entry) }));
    reconcileEventChainRuntimes(340);
    useNavStore.setState({ currentNodeId: runtime().waitingLocation.nodeId });
    reconcileEventChainRuntimes(341); processEncounterOrchestration(341); choose("fight-claim");
    const combat = useCombatStore.getState().combatByVesselId[vesselId];
    useCombatStore.setState({ combatByVesselId: { [vesselId]: { ...combat, status } } });
    reconcileEventChainCombatOutcome(342);
    expect(useGameStore.getState().resources.credits).toBe(1220);
    expect(itemQty(GREYWAKE.battleItemId)).toBe(0);
    expect(runtime().status).toBe("failed");
    expect(hasSectorBoundStoryRuntime(vesselId)).toBe(false);
    expect(useNavStore.getState().storyMarkersByNodeId).toEqual({});
  });

  it("large ticks with no panel mounted recover completion and terminal/cancel paths leave no blocker", () => {
    startAndRecover(); choose("decode-last-watch");
    const job = useJobStore.getState().jobs.find((entry) => entry.payload?.story);
    useJobStore.setState((state) => ({ jobs: state.jobs.map((entry) => entry.id === job.id ? { ...entry, status: "in_progress", startedAt: 100, effectiveDuration: 250 } : entry) }));
    useGameStore.setState({ currentMinute: 500 });
    expect(() => processTimedJobs(400)).not.toThrow();
    expect(runtime().status).toBe("waitingLocation");
    expect(hasSectorBoundStoryRuntime(vesselId)).toBe(true);
    // A sector-bound live chain blocks gate transit until a terminal choice.
    expect(hasSectorBoundStoryRuntime(vesselId)).toBe(true);
    const chain = getEventChain(GREYWAKE.chainId);
    expect(chain.autoRegister).toBe(false);
  });

  it("does not delete a missionless Greywake card when an unrelated mission is abandoned", () => {
    useNavStore.setState({ pendingEncounter: salvage });
    applyNavigationEncounter("salvage", 100, { manual: true, expectedClaimId: salvage.claimId });
    const encounter = present();
    useMissionStore.setState({ activeByVesselId: { [vesselId]: { id: "unrelated", title: "별도 계약", status: "active" } } });
    expect(useMissionStore.getState().abandonMission({ vesselId, currentMinute: 101 }).ok).toBe(true);
    expect(useMissionStore.getState().pendingStoryEncounterByVesselId[vesselId]).toMatchObject({ runtimeId: encounter.runtimeId });
    expect(runtime().status).toBe("pending");
  });

  it("snapshots the selected scouting lead and authored calibration case into Greywake duration", () => {
    useEquipmentStore.setState({
      instances: [{ instanceId: "case", equipmentId: "calibration-case", ownerCrewId: "captain-yun", equippedSlot: "utility", escrowedForCrewId: null }], revision: 0, receipts: {},
    });
    startAndRecover();
    const option = getEventChain(GREYWAKE.chainId).stages.find((stage) => stage.id === "ops-wait").options.find((entry) => entry.id === "decode-last-watch");
    const preview = getStoryLeadProjection(runtime(), option, "captain-yun");
    expect(preview).toMatchObject({ ok: true, duration: 250, lead: { leadCrewId: "captain-yun", modifiers: { durationMinutes: 10 } } });
    expect(choose("decode-last-watch")).toMatchObject({ ok: true, waitingJob: true });
    const job = useJobStore.getState().jobs.find((entry) => entry.payload?.story);
    // Captain Yun: scouting 12 vs 14 = below (+30); calibration case -20.
    expect(job).toMatchObject({ assignedCrewId: "captain-yun", duration: 250 });
    expect(job.payload.story.lead).toMatchObject(preview.lead);
    expect(job.payload.story.lead.profile.gearDescription).toContain("GREYWAKE");
  });

  it("keeps the selected Greywake lead as the only scheduler candidate", () => {
    startAndRecover();
    expect(choose("decode-last-watch")).toMatchObject({ ok: true, waitingJob: true });
    const job = useJobStore.getState().jobs.find((entry) => entry.payload?.story);
    expect(job.payload).toMatchObject({ targetCrewId: "captain-yun", story: { leadCrewId: "captain-yun" } });
    useJobStore.getState().runScheduler({ currentMinute: 100, crew: useCrewStore.getState().crew });
    useJobStore.getState().runScheduler({ currentMinute: 110, crew: useCrewStore.getState().crew });
    expect(useJobStore.getState().jobs.find((entry) => entry.id === job.id)).toMatchObject({ status: "in_progress", assignedCrewId: "captain-yun" });

  });

  it("leaves an unavailable selected Greywake lead queued instead of substituting another crew member", () => {
    startAndRecover();
    expect(choose("decode-last-watch")).toMatchObject({ ok: true, waitingJob: true });
    useCrewStore.setState((state) => ({ crew: state.crew.map((member) => member.id === "captain-yun" ? { ...member, fatigue: 90 } : member) }));
    useJobStore.getState().runScheduler({ currentMinute: 100, crew: useCrewStore.getState().crew });
    expect(useJobStore.getState().jobs.find((entry) => entry.payload?.story)).toMatchObject({ status: "backlog", assignedCrewId: "captain-yun", payload: { targetCrewId: "captain-yun" } });
  });

});
