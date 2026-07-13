import { EVENT_CHAIN_STATUS, getEventChain } from "../data/eventChains";
import { GREYWAKE } from "../data/constants";
import { createCombatState, resolveEnemyFleet } from "../systems/combatEngine";
import { createEventRuntime, isStoryRuntimeTerminal, normalizeEventRuntime, selectDeterministicStoryTarget } from "../systems/eventChainSystem";
import { useCombatStore } from "../stores/combatStore";
import { useCrewStore } from "../stores/crewStore";
import { useExplorationStore } from "../stores/explorationStore";
import { useGameStore } from "../stores/gameStore";
import { useInventoryStore } from "../stores/inventoryStore";
import { useJobStore } from "../stores/jobStore";
import { useMissionStore } from "../stores/missionStore";
import { useNavStore } from "../stores/navStore";
import { useRecruitStore } from "../stores/recruitStore";
import { useReportStore } from "../stores/reportStore";
import { useShipStore } from "../stores/shipStore";
import { getCrewTemplate } from "../data/recruitment";
import { buildNavigationReport } from "../systems/reportSystem";

function setRuntime(runtimeId, update) {
  let next = null;
  useMissionStore.setState((state) => {
    const current = state.eventRuntimesById?.[runtimeId];
    if (!current) return state;
    next = normalizeEventRuntime(typeof update === "function" ? update(current) : update);
    return { eventRuntimesById: { ...state.eventRuntimesById, [runtimeId]: next } };
  });
  return next;
}

function markReceipt(runtimeId, claimId, receiver) {
  setRuntime(runtimeId, (runtime) => {
    if (runtime.pendingClaim?.claimId !== claimId) return runtime;
    return { ...runtime, pendingClaim: { ...runtime.pendingClaim, receipts: { ...(runtime.pendingClaim.receipts ?? {}), [receiver]: true } } };
  });
}

function clearMarker(runtimeId) {
  useNavStore.getState().clearStoryMarker(runtimeId);
}

function addHistory(runtime, status, currentMinute, extra = {}) {
  const claim = runtime.pendingClaim;
  return [...(runtime.history ?? []), { stageId: claim?.stageId ?? runtime.stageId, optionId: claim?.optionId ?? null, claimId: claim?.claimId ?? null, atMinute: currentMinute, status, ...extra }].slice(-40);
}

function storyOutcomeSummary(runtime, status, extra = {}) {
  const optionId = runtime.pendingClaim?.optionId;
  if (optionId === "tow-lifeboat") return `구명정 견인 — 희귀 센서 분석가 후보 확보, 산소 -${GREYWAKE.rescueOxygenCost}. 편입비 ₢${GREYWAKE.recruitCost} 별도.`;
  if (optionId === "sell-coordinates") return `좌표 매각 — ₢${GREYWAKE.saleCredits} 확보.`;
  if (optionId === "fight-claim" && extra.combatResult === "won") return `청구권 집행선 격파 — ₢${GREYWAKE.battleCredits}, tactical-ai-chip x1 확보.`;
  if (optionId === "fight-claim") return `청구권 집행선 교전 ${extra.combatResult === "retreated" ? "이탈" : "패배"} — 조건부 보상 없음.`;
  if (optionId === "seal-wreck") return "GREYWAKE 좌표 봉인 — 사건 종료.";
  if (optionId === "discard-recorder") return "회수 기록장치 폐기 — 사건 종료.";
  if (optionId === "withdraw") return "마지막 당직 신호 폐기 및 철수 — 사건 종료.";
  return `GREYWAKE 추적 ${status === EVENT_CHAIN_STATUS.completed ? "완료" : "중단"}${extra.reason ? ` — ${extra.reason}` : ""}.`;
}

function recordStoryOutcome(runtime, status, currentMinute, extra = {}) {
  if (runtime.chainId !== GREYWAKE.chainId) return;
  const receiptId = runtime.pendingClaim?.claimId ?? `${runtime.id}:terminal:${status}:${extra.combatResult ?? extra.reason ?? "none"}`;
  const summary = storyOutcomeSummary(runtime, status, extra);
  const applied = useReportStore.getState().applyStoryReport(receiptId, buildNavigationReport({
    title: "함선 복무기록: GREYWAKE 마지막 당직",
    summary,
    navKind: "storyOutcome",
    currentMinute,
    priority: status === EVENT_CHAIN_STATUS.failed ? "high" : "medium",
    details: { runtimeId: runtime.id, optionId: runtime.pendingClaim?.optionId ?? null, status },
  }));
  if (applied) useGameStore.getState().addLog(`함선 복무기록: ${summary}`);
}

function finishRuntime(runtimeId, status, currentMinute, extra = {}) {
  const current = useMissionStore.getState().eventRuntimesById?.[runtimeId];
  if (current) recordStoryOutcome(current, status, currentMinute, extra);
  const next = setRuntime(runtimeId, (runtime) => ({
    ...runtime,
    status,
    pendingClaim: null,
    waitingJob: null,
    waitingLocation: null,
    waitingCombat: null,
    updatedAt: currentMinute,
    history: addHistory(runtime, status, currentMinute, extra),
  }));
  if (isStoryRuntimeTerminal(next)) clearMarker(runtimeId);
  return next;
}

function resourceCostAvailable(delta = {}) {
  const resources = useGameStore.getState().resources;
  return Object.entries(delta).every(([key, value]) => !(value < 0) || (resources[key] ?? 0) >= Math.abs(value));
}

function applyEffectOnce({ runtime, effect, index, currentMinute }) {
  const claimId = runtime.pendingClaim.claimId;
  const receiver = `${effect.kind}:${index}`;
  if (runtime.pendingClaim.receipts?.[receiver]) return { ok: true, repeated: true };
  if (effect.kind === "resource") {
    const storeClaimId = `${claimId}:story:game:${index}`;
    if (useGameStore.getState().encounterReceipts?.[storeClaimId]) {
      markReceipt(runtime.id, claimId, receiver);
      return { ok: true, repeated: true };
    }
    if (!resourceCostAvailable(effect.delta)) return { ok: false, reason: "insufficientResource" };
    useGameStore.getState().applyEncounterResources(storeClaimId, effect.delta ?? {});
    markReceipt(runtime.id, claimId, receiver);
    return { ok: true };
  }
  if (effect.kind === "inventoryGrant") {
    useInventoryStore.getState().applyEncounterGrant(`${claimId}:story:inventory:${index}`, { items: effect.items ?? [] });
    markReceipt(runtime.id, claimId, receiver);
    return { ok: true };
  }
  if (effect.kind === "inventoryConsume") {
    const result = useInventoryStore.getState().applyStoryConsume(`${claimId}:story:consume:${index}`, effect.items ?? []);
    if (!result.ok) return result;
    markReceipt(runtime.id, claimId, receiver);
    return { ok: true };
  }
  if (effect.kind === "recruitOffer") {
    const applied = useRecruitStore.getState().applyEncounterCandidate(`${claimId}:story:recruit:${index}`, effect.templateId);
    if (!applied && !useRecruitStore.getState().encounterReceipts?.[`${claimId}:story:recruit:${index}`]) return { ok: false, reason: "recruitUnavailable" };
    markReceipt(runtime.id, claimId, receiver);
    return { ok: true };
  }
  if (effect.kind === "enqueueStoryJob") {
    const jobId = `story-job:${claimId}`;
    const existing = useJobStore.getState().jobs.find((job) => job.id === jobId);
    if (!existing) {
      useJobStore.getState().enqueueJob({
        id: jobId,
        type: "decode",
        roomId: effect.roomId ?? GREYWAKE.jobRoomId,
        duration: effect.duration ?? GREYWAKE.jobMinutes,
        priority: "normal",
        createdAt: currentMinute,
        // Refund ownership stays in runtime.waitingJob. Omitting generic
        // inputItems prevents old job UIs from refunding the same recorder
        // before the story cancellation receipt runs.
        payload: { story: { runtimeId: runtime.id, stageId: runtime.pendingClaim.stageId, claimId, optionId: runtime.pendingClaim.optionId, nextStageId: effect.nextStageId } },
      });
    }
    markReceipt(runtime.id, claimId, receiver);
    return { ok: true, jobId };
  }
  if (effect.kind === "combat") {
    const vesselId = runtime.vesselId;
    const existing = useCombatStore.getState().combatByVesselId?.[vesselId];
    if (existing?.source?.kind === "eventChain" && existing.source.claimId === claimId) {
      markReceipt(runtime.id, claimId, receiver);
      return { ok: true, combat: existing, repeated: true };
    }
    if (existing) return { ok: false, reason: "combatBusy" };
    if (useExplorationStore.getState().pendingCombatEncounter) return { ok: false, reason: "combatEncounterPending" };
    const resolved = resolveEnemyFleet(effect.enemyId, { seed: claimId });
    if (!resolved.exact) return { ok: false, reason: "enemyNotFound" };
    const combat = {
      ...createCombatState(resolved.enemy),
      source: { kind: "eventChain", runtimeId: runtime.id, stageId: runtime.pendingClaim.stageId, claimId, optionId: runtime.pendingClaim.optionId, chainId: runtime.chainId },
    };
    const started = useCombatStore.getState().startCombat({ vesselId, combat, targetId: "hull", feed: [`GREYWAKE 교전: ${resolved.enemy.name}`, "승리 전에는 청구권 보상이 지급되지 않습니다."] });
    if (!started.ok) return started;
    markReceipt(runtime.id, claimId, receiver);
    return { ok: true, combat };
  }
  return { ok: false, reason: `unsupportedEffect:${effect.kind}` };
}

function continuePreparedSettlement(runtimeId, currentMinute, afterStep) {
  let runtime = useMissionStore.getState().eventRuntimesById?.[runtimeId];
  if (!runtime?.pendingClaim || runtime.status !== EVENT_CHAIN_STATUS.settling) return { ok: false, reason: "notSettling" };
  const effects = runtime.pendingClaim.effects ?? [];
  for (let index = 0; index < effects.length; index += 1) {
    runtime = useMissionStore.getState().eventRuntimesById[runtimeId];
    const result = applyEffectOnce({ runtime, effect: effects[index], index, currentMinute });
    if (!result.ok) return result;
    afterStep?.(`${effects[index].kind}:${index}`);
  }
  runtime = useMissionStore.getState().eventRuntimesById[runtimeId];
  const transition = runtime.pendingClaim.transition ?? {};
  if (transition.waitingStatus === EVENT_CHAIN_STATUS.waitingJob) {
    const jobId = `story-job:${runtime.pendingClaim.claimId}`;
    const next = setRuntime(runtimeId, (entry) => ({ ...entry, stageId: transition.nextStageId, status: EVENT_CHAIN_STATUS.waitingJob, waitingJob: { jobId, claimId: entry.pendingClaim.claimId, returnStageId: entry.pendingClaim.stageId, nextStageId: transition.nextStageId, refundItems: [{ itemId: GREYWAKE.recorderItemId, qty: 1 }] }, updatedAt: currentMinute }));
    return { ok: true, waitingJob: true, runtime: next, jobId };
  }
  if (transition.waitingStatus === EVENT_CHAIN_STATUS.waitingCombat) {
    const next = setRuntime(runtimeId, (entry) => ({ ...entry, status: EVENT_CHAIN_STATUS.waitingCombat, waitingCombat: { claimId: entry.pendingClaim.claimId, terminalStatus: transition.terminalStatus ?? EVENT_CHAIN_STATUS.completed }, updatedAt: currentMinute }));
    useGameStore.getState().setPaused(true);
    return { ok: true, waitingCombat: true, runtime: next };
  }
  if (transition.terminalStatus) return { ok: true, finalized: true, runtime: finishRuntime(runtimeId, transition.terminalStatus, currentMinute) };
  const next = setRuntime(runtimeId, (entry) => ({ ...entry, stageId: transition.nextStageId, status: EVENT_CHAIN_STATUS.scheduled, dueAtMinute: currentMinute + Math.max(0, transition.delayMinutes ?? 0), claimSequence: (entry.claimSequence ?? 0) + 1, pendingClaim: null, updatedAt: currentMinute, history: addHistory(entry, EVENT_CHAIN_STATUS.scheduled, currentMinute) }));
  return { ok: true, scheduled: true, runtime: next };
}

export function settleEventChainChoice({ vesselId = useShipStore.getState().activeVesselId, runtimeId, stageId, claimId, optionId, currentMinute = useGameStore.getState().currentMinute, afterStep } = {}) {
  const state = useMissionStore.getState();
  const current = state.eventRuntimesById?.[runtimeId];
  if (current?.pendingClaim) {
    if (current.vesselId !== vesselId || current.pendingClaim.claimId !== claimId || current.pendingClaim.stageId !== stageId || current.pendingClaim.optionId !== optionId) return { ok: false, reason: "staleSettlement" };
    if (current.status === EVENT_CHAIN_STATUS.settling) return continuePreparedSettlement(runtimeId, currentMinute, afterStep);
    if (current.status === EVENT_CHAIN_STATUS.waitingJob) return { ok: true, repeated: true, waitingJob: true, runtime: current };
    if (current.status === EVENT_CHAIN_STATUS.waitingCombat) return { ok: true, repeated: true, waitingCombat: true, runtime: current };
  }
  const encounter = state.pendingStoryEncounterByVesselId?.[vesselId];
  const chain = getEventChain(current?.chainId);
  const option = chain?.stages?.find((stage) => stage.id === stageId)?.options?.find((entry) => entry.id === optionId);
  if (current?.id === runtimeId && encounter?.claimId === claimId && option) {
    for (const effect of option.effects ?? []) {
      if (effect.kind === "resource" && !resourceCostAvailable(effect.delta)) return { ok: false, reason: "insufficientResource" };
      if (effect.kind === "inventoryConsume") {
        const missing = (effect.items ?? []).find(({ itemId, qty }) => (useInventoryStore.getState().items.find((item) => item.id === itemId)?.qty ?? 0) < (qty ?? 0));
        if (missing) return { ok: false, reason: "missingItem", itemId: missing.itemId };
      }
      if (effect.kind === "combat" && (useCombatStore.getState().combatByVesselId?.[vesselId] || useExplorationStore.getState().pendingCombatEncounter)) return { ok: false, reason: "combatBusy" };
      if (effect.kind === "combat" && !resolveEnemyFleet(effect.enemyId, { seed: claimId }).exact) return { ok: false, reason: "enemyNotFound" };
      if (effect.kind === "recruitOffer") {
        const duplicateCandidate = (useRecruitStore.getState().candidatePool ?? []).some((entry) => entry.templateId === effect.templateId);
        const duplicateCrew = (useCrewStore.getState().crew ?? []).some((member) => member.alive !== false && member.templateId === effect.templateId);
        if (!getCrewTemplate(effect.templateId) || duplicateCandidate || duplicateCrew) return { ok: false, reason: "recruitUnavailable" };
      }
    }
  }
  const prepared = state.prepareStoryEncounter({ vesselId, runtimeId, stageId, claimId, optionId, currentMinute });
  if (!prepared.ok) return prepared;
  afterStep?.("prepared");
  return continuePreparedSettlement(runtimeId, currentMinute, afterStep);
}

export function settleManualSalvageEncounter({ encounter, option, currentMinute = 0, manual = false, expectedClaimId = null, afterStep } = {}) {
  if (!encounter || !option || encounter.id !== "debris-salvage" || option.id !== "salvage") return { ok: false, reason: "notGreywakeSalvage" };
  if (!manual) return { ok: false, reason: "manualOnly" };
  if (!encounter.claimId || expectedClaimId !== encounter.claimId) return { ok: false, reason: "staleClaim" };
  const vesselId = useShipStore.getState().activeVesselId;
  const claimId = `${encounter.claimId}:salvage`;
  const resource = (option.outcome ?? []).find((effect) => effect.kind === "resource");
  if (resource) useGameStore.getState().applyEncounterResources(`${claimId}:game`, resource.delta ?? {});
  afterStep?.("salvageResources");
  const mission = useMissionStore.getState();
  const alreadyStarted = Boolean(mission.storyFlags?.[GREYWAKE.startedFlagId]?.value);
  if (!alreadyStarted) {
    const chain = getEventChain(GREYWAKE.chainId);
    const nav = useNavStore.getState();
    const runtime = createEventRuntime({ chain, vesselId, currentMinute, dueAtMinute: currentMinute, seed: `${nav.sector?.id}:${encounter.claimId}` });
    if (!runtime) return { ok: false, reason: "invalidStoryRuntime" };
    const registered = useMissionStore.getState().registerEventRuntime(runtime);
    if (!registered.ok && registered.reason !== "duplicate") return registered;
    afterStep?.("storyRuntime");
    useMissionStore.getState().setStoryFlag({ flagId: GREYWAKE.startedFlagId, value: true, currentMinute, sourceRuntimeId: runtime.id });
  }
  const resolved = useNavStore.getState().resolveEncounter(option.id, currentMinute, { allowGateTransit: true });
  afterStep?.("navFinalize");
  return { ok: true, effects: [], logs: resolved.logs ?? [], started: !alreadyStarted };
}

function completeStoryJob(runtime, job, currentMinute) {
  if (runtime.status !== EVENT_CHAIN_STATUS.waitingJob || runtime.waitingJob?.jobId !== job.id) return { ok: false, reason: "staleJob" };
  const nav = useNavStore.getState();
  const pinnedTargetId = runtime.waitingJob?.targetNodeId;
  const selected = pinnedTargetId
    ? nav.sector?.nodes?.find((node) => node.id === pinnedTargetId)
    : selectDeterministicStoryTarget({ nodes: nav.sector?.nodes, discovered: nav.discovered, visited: nav.visited, currentNodeId: nav.currentNodeId, seed: runtime.id });
  const target = selected ?? null;
  if (!target) return { ok: true, cancelled: true, runtime: finishRuntime(runtime.id, EVENT_CHAIN_STATUS.cancelled, currentMinute, { reason: "noStoryTarget" }) };
  if (!pinnedTargetId) {
    runtime = setRuntime(runtime.id, (entry) => ({ ...entry, waitingJob: { ...entry.waitingJob, targetNodeId: target.id, targetSectorId: nav.sector?.id }, updatedAt: currentMinute }));
  }
  if (runtime.waitingJob?.targetSectorId && runtime.waitingJob.targetSectorId !== nav.sector?.id) return { ok: true, cancelled: true, runtime: finishRuntime(runtime.id, EVENT_CHAIN_STATUS.cancelled, currentMinute, { reason: "sectorChanged" }) };
  const revealed = nav.revealStoryTarget({ runtimeId: runtime.id, nodeId: target.id, label: GREYWAKE.markerLabel, sectorId: nav.sector?.id });
  if (!revealed.ok) return { ok: true, cancelled: true, runtime: finishRuntime(runtime.id, EVENT_CHAIN_STATUS.cancelled, currentMinute, { reason: revealed.reason }) };
  const next = setRuntime(runtime.id, (entry) => ({ ...entry, status: EVENT_CHAIN_STATUS.waitingLocation, pendingClaim: null, waitingJob: null, waitingLocation: { nodeId: target.id, sectorId: nav.sector.id, revealedAtMinute: currentMinute }, claimSequence: (entry.claimSequence ?? 0) + 1, updatedAt: currentMinute }));
  useGameStore.getState().addLog(`GREYWAKE 해독 완료: ${target.name}에 마지막 당직 신호를 표시했습니다.`);
  return { ok: true, waitingLocation: true, runtime: next, target };
}

export function processStoryJobCompletion(job, currentMinute = useGameStore.getState().currentMinute) {
  const story = job?.payload?.story;
  if (!story?.runtimeId) return { handled: false };
  const runtime = useMissionStore.getState().eventRuntimesById?.[story.runtimeId];
  if (!runtime) return { handled: true, ok: false, reason: "runtimeMissing" };
  return { handled: true, ...completeStoryJob(runtime, job, currentMinute) };
}

function recoverCancelledStoryJob(runtime, job, currentMinute) {
  const refundClaim = `${runtime.waitingJob.claimId}:cancel-refund`;
  useInventoryStore.getState().applyEncounterGrant(refundClaim, { items: runtime.waitingJob.refundItems ?? [] });
  const next = setRuntime(runtime.id, (entry) => ({ ...entry, stageId: entry.waitingJob.returnStageId, status: EVENT_CHAIN_STATUS.scheduled, dueAtMinute: currentMinute, claimSequence: (entry.claimSequence ?? 0) + 1, pendingClaim: null, waitingJob: null, updatedAt: currentMinute }));
  return { ok: true, refunded: true, runtime: next, job };
}

export function cancelEventChainJob({ jobId, currentMinute = useGameStore.getState().currentMinute } = {}) {
  const job = useJobStore.getState().jobs.find((entry) => entry.id === jobId);
  if (!job?.payload?.story?.runtimeId) return { ok: false, reason: "notStoryJob" };
  const runtime = useMissionStore.getState().eventRuntimesById?.[job.payload.story.runtimeId];
  if (!runtime || runtime.waitingJob?.jobId !== jobId) return { ok: false, reason: "staleJob" };
  const cancelled = useJobStore.getState().cancelJob(jobId);
  if (!cancelled.ok) return cancelled;
  return recoverCancelledStoryJob(runtime, { ...job, status: "failed" }, currentMinute);
}

function victoryEffects(runtime) {
  const combat = runtime.pendingClaim?.effects?.find((effect) => effect.kind === "combat");
  return combat?.victoryEffects ?? [];
}

export function reconcileEventChainCombatOutcome(currentMinute = useGameStore.getState().currentMinute, afterStep) {
  const runtimes = Object.values(useMissionStore.getState().eventRuntimesById ?? {}).filter((runtime) => runtime.status === EVENT_CHAIN_STATUS.waitingCombat);
  runtimes.forEach((runtime) => {
    const combat = useCombatStore.getState().combatByVesselId?.[runtime.vesselId];
    if (!combat || combat.source?.kind !== "eventChain" || combat.source?.claimId !== runtime.waitingCombat?.claimId) {
      finishRuntime(runtime.id, EVENT_CHAIN_STATUS.failed, currentMinute, { reason: "combatStateMissing" });
      return;
    }
    if (combat.status === "engaged") return;
    if (combat.status === "won") {
      victoryEffects(runtime).forEach((effect, index) => {
        applyEffectOnce({ runtime: useMissionStore.getState().eventRuntimesById[runtime.id], effect, index: 100 + index, currentMinute });
        afterStep?.(`${effect.kind}:${index}`);
      });
      finishRuntime(runtime.id, runtime.waitingCombat.terminalStatus ?? EVENT_CHAIN_STATUS.completed, currentMinute, { combatResult: "won" });
      useGameStore.getState().setPaused(false);
      return;
    }
    if (["lost", "retreated"].includes(combat.status)) {
      finishRuntime(runtime.id, EVENT_CHAIN_STATUS.failed, currentMinute, { combatResult: combat.status });
      useGameStore.getState().setPaused(false);
    }
  });
}

export function reconcileEventChainRuntimes(currentMinute = useGameStore.getState().currentMinute) {
  const runtimes = Object.values(useMissionStore.getState().eventRuntimesById ?? {});
  runtimes.filter((runtime) => runtime.status === EVENT_CHAIN_STATUS.settling).forEach((runtime) => continuePreparedSettlement(runtime.id, currentMinute));
  Object.values(useMissionStore.getState().eventRuntimesById ?? {}).filter((runtime) => runtime.status === EVENT_CHAIN_STATUS.waitingJob).forEach((runtime) => {
    const job = useJobStore.getState().jobs.find((entry) => entry.id === runtime.waitingJob?.jobId);
    if (job?.status === "done") completeStoryJob(runtime, job, currentMinute);
    else if (job?.status === "failed") recoverCancelledStoryJob(runtime, job, currentMinute);
    else if (!job) finishRuntime(runtime.id, EVENT_CHAIN_STATUS.cancelled, currentMinute, { reason: "storyJobMissing" });
  });
  Object.values(useMissionStore.getState().eventRuntimesById ?? {}).filter((runtime) => runtime.status === EVENT_CHAIN_STATUS.waitingLocation).forEach((runtime) => {
    const nav = useNavStore.getState();
    if (runtime.waitingLocation.sectorId !== nav.sector?.id) {
      finishRuntime(runtime.id, EVENT_CHAIN_STATUS.cancelled, currentMinute, { reason: "sectorChanged" });
      return;
    }
    if (runtime.waitingLocation.nodeId === nav.currentNodeId) setRuntime(runtime.id, (entry) => ({ ...entry, status: EVENT_CHAIN_STATUS.scheduled, dueAtMinute: currentMinute, waitingLocation: null, updatedAt: currentMinute }));
  });
  reconcileEventChainCombatOutcome(currentMinute);
  Object.values(useNavStore.getState().storyMarkersByNodeId ?? {}).forEach((marker) => {
    const runtime = useMissionStore.getState().eventRuntimesById?.[marker.runtimeId];
    if (!runtime || isStoryRuntimeTerminal(runtime)) clearMarker(marker.runtimeId);
  });
}

export function hasSectorBoundStoryRuntime(vesselId) {
  return Object.values(useMissionStore.getState().eventRuntimesById ?? {}).some((runtime) => runtime.vesselId === vesselId && runtime.chainId === GREYWAKE.chainId && !isStoryRuntimeTerminal(runtime));
}

export function hasUnsettledEventChainCombat(vesselId) {
  return Object.values(useMissionStore.getState().eventRuntimesById ?? {}).some((runtime) => runtime.vesselId === vesselId && [EVENT_CHAIN_STATUS.settling, EVENT_CHAIN_STATUS.waitingCombat].includes(runtime.status) && runtime.pendingClaim?.effects?.some((effect) => effect.kind === "combat"));
}
