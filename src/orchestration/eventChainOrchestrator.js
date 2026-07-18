import { EVENT_CHAIN_STATUS, getEventChain } from "../data/eventChains";
import { ROOM_CONFIG } from "../data/constants";
import { autoAssignTacticalCrew, buildTacticalStationSnapshot, createCombatState, resolveEnemyFleet } from "../systems/combatEngine";
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
import { canWorkWithInjury } from "../systems/injurySystem";
import { scheduleJobs } from "../systems/jobScheduler";
import { useEquipmentStore, equipmentForCrew } from "../stores/equipmentStore";
import { prepareCrewLead, projectActionModifiers, specialtyAvailability } from "../systems/crewCapabilitySystem";

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

export function getStoryLeadCandidates(runtime, option) {
  const effect = option?.effects?.find((entry) => entry.kind === "enqueueStoryJob");
  const context = effect?.context ?? (effect?.type === "decode" ? "greywake" : effect?.type === "treatment" ? "quarantine" : null);
  if (!context) return [];
  const threshold = effect?.threshold ?? 14;
  const instances = useEquipmentStore.getState().instances ?? [];
  return useCrewStore.getState().crew.filter((member) => member.alive && canWorkWithInjury(member.injury) && (member.fatigue ?? 0) < 90 && (!effect?.requiredRole || (effect.requiredRole === "medic" ? member.role === "의무실" : true))).map((member) => prepareCrewLead({ member, context, threshold, equipment: equipmentForCrew(instances, member.id) }));
}

// This projection is shared by the choice card and settlement.  The card
// never estimates from display text: it previews the exact immutable lead
// record that will be persisted with the claim.
export function getStoryLeadProjection(runtime, option, leadCrewId = null, useSpecialty = false) {
  const effect = option?.effects?.find((entry) => entry.kind === "enqueueStoryJob");
  if (!effect) return { ok: true, lead: null, specialty: null, duration: null, resourceDelta: {} };
  const lead = getStoryLeadCandidates(runtime, option).find((entry) => entry.leadCrewId === leadCrewId);
  if (!lead) return { ok: false, reason: "leadRequired", candidates: getStoryLeadCandidates(runtime, option) };
  const modifiers = projectActionModifiers(lead);
  const sectorId = useNavStore.getState().sector?.id ?? "sector";
  const member = useCrewStore.getState().crew.find((entry) => entry.id === lead.leadCrewId);
  const availability = specialtyAvailability({ member, sectorId, context: lead.context, profile: lead.profile });
  if (useSpecialty && !availability.ok) return { ok: false, reason: `specialty:${availability.reason}`, lead: { ...lead, modifiers }, specialtyAvailability: availability };
  const specialty = useSpecialty ? { id: availability.specialty.id, crewId: lead.leadCrewId, sectorId } : null;
  const specialtyDuration = specialty?.id === "signal-separation" ? -60 : 0;
  const specialtyFatigue = specialty?.id === "triage" ? -10 : 0;
  const resourceDelta = { ...(effect.resourceCost ?? {}) };
  Object.entries(modifiers.resourceDelta ?? {}).forEach(([key, value]) => { resourceDelta[key] = (resourceDelta[key] ?? 0) + Number(value ?? 0); });
  return { ok: true, lead: { ...lead, modifiers }, specialty, specialtyAvailability: availability, duration: Math.max(30, (effect.duration ?? 240) + modifiers.durationMinutes + specialtyDuration), completionCrewFatigue: Math.max(0, (effect.completionCrewFatigue ?? 0) + Number(modifiers.fatigueDelta ?? 0) + specialtyFatigue), resourceDelta };
}

function getStoryJobEffect(runtime) {
  const stageId = runtime?.pendingClaim?.stageId ?? runtime?.waitingJob?.returnStageId;
  const optionId = runtime?.pendingClaim?.optionId;
  return getEventChain(runtime?.chainId)?.stages?.find((stage) => stage.id === stageId)?.options?.find((option) => option.id === optionId)?.effects?.find((effect) => effect.kind === "enqueueStoryJob") ?? null;
}

function getEffectState(runtime, effectKind) {
  const entries = Object.entries(runtime?.pendingClaim?.effectState ?? {});
  return entries.find(([receiver]) => receiver.startsWith(`${effectKind}:`))?.[1] ?? null;
}

function storyOutcomeDetails(runtime) {
  const state = getEffectState(runtime, "revealHighestDangerOrReputation");
  if (!state) return {};
  return { targetNodeId: state.targetNodeId ?? null, reputation: state.reputation ?? null };
}

function storyOutcomeSummary(runtime, status, extra = {}) {
  const chain = getEventChain(runtime.chainId);
  const optionId = runtime.pendingClaim?.optionId;
  const key = extra.combatResult ? `${optionId}:${extra.combatResult}` : optionId;
  const publicState = getEffectState(runtime, "revealHighestDangerOrReputation");
  if (publicState) {
    const target = publicState.targetNodeId
      ? useNavStore.getState().sector?.nodes?.find((node) => node.id === publicState.targetNodeId)
      : null;
    const reputation = publicState.reputation ?? 0;
    return publicState.targetNodeId
      ? `공개 증언 — 평판 +${reputation}, ${target?.name ?? publicState.targetNodeId} 공개.`
      : `공개 증언 — 평판 +${reputation}, 새 좌표 없음.`;
  }
  if (chain?.outcomeCopy?.[key]) return chain.outcomeCopy[key];
  const reason = chain?.failureCopy?.[extra.reason] ?? extra.reason;
  return `${chain?.title ?? runtime.chainId} ${status === EVENT_CHAIN_STATUS.completed ? "완료" : "중단"}${reason ? ` — ${reason}` : ""}.`;
}

function recordStoryOutcome(runtime, status, currentMinute, extra = {}) {
  const chain = getEventChain(runtime.chainId);
  if (!chain?.reportTitle) return;
  const receiptId = runtime.pendingClaim?.claimId ?? `${runtime.id}:terminal:${status}:${extra.combatResult ?? extra.reason ?? "none"}`;
  const summary = storyOutcomeSummary(runtime, status, extra);
  const applied = useReportStore.getState().applyStoryReport(receiptId, buildNavigationReport({
    title: chain.reportTitle,
    summary,
    navKind: "storyOutcome",
    currentMinute,
    priority: status === EVENT_CHAIN_STATUS.failed ? "high" : "medium",
    details: { runtimeId: runtime.id, optionId: runtime.pendingClaim?.optionId ?? null, status, ...storyOutcomeDetails(runtime) },
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

function selectHighestDangerHiddenField() {
  const nav = useNavStore.getState();
  const discovered = new Set(nav.discovered ?? []);
  return (nav.sector?.nodes ?? [])
    .filter((node) => node?.id && !discovered.has(node.id) && !["exit", "gate", "station", "market", "colony"].includes(node.type))
    .sort((a, b) => (b.danger ?? 0) - (a.danger ?? 0) || a.id.localeCompare(b.id))[0] ?? null;
}

function applyEffectOnce({ runtime, effect, index, currentMinute, afterStep }) {
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
  if (effect.kind === "revealHighestDangerOrReputation") {
    const nav = useNavStore.getState();
    let state = runtime.pendingClaim.effectState?.[receiver] ?? null;
    if (!state) {
      const selected = selectHighestDangerHiddenField();
      state = { targetNodeId: selected?.id ?? null, reputation: selected ? effect.reputationWithReveal ?? 2 : effect.fallbackReputation ?? 3 };
      setRuntime(runtime.id, (entry) => ({ ...entry, pendingClaim: { ...entry.pendingClaim, effectState: { ...(entry.pendingClaim.effectState ?? {}), [receiver]: state } }, updatedAt: currentMinute }));
      afterStep?.(`effectState:${index}`);
    }
    const target = state.targetNodeId ? nav.sector?.nodes?.find((node) => node.id === state.targetNodeId) : null;
    const reputation = state.reputation;
    useInventoryStore.getState().applyEncounterGrant(`${claimId}:story:public-reputation:${index}`, { items: [{ itemId: "reputation-token", qty: reputation }] });
    afterStep?.(`publicReputation:${index}`);
    if (target) nav.revealStoryTarget({ runtimeId: runtime.id, nodeId: target.id, label: "공개 증언 위험구역", sectorId: nav.sector?.id });
    afterStep?.(`publicReveal:${index}`);
    markReceipt(runtime.id, claimId, receiver);
    return { ok: true, target, fallback: !target, reputation };
  }
  if (effect.kind === "enqueueStoryJob") {
    const jobId = `story-job:${claimId}`;
    const existing = useJobStore.getState().jobs.find((job) => job.id === jobId);
    if (!existing) {
      const lead = runtime.pendingClaim?.lead ?? null;
      const specialty = runtime.pendingClaim?.specialty ?? null;
      if (specialty) {
        const used = useCrewStore.getState().claimSpecialtyUse({ crewId: specialty.crewId, sectorId: specialty.sectorId, claimId: `${claimId}:specialty` });
        if (!used.ok && !used.repeated) return used;
      }
      const modifiers = lead?.modifiers ?? {};
      const specialtyId = specialty?.id ?? null;
      const specialtyDuration = specialtyId === "signal-separation" ? -60 : 0;
      const specialtyFatigue = specialtyId === "triage" ? -10 : 0;
      const duration = Math.max(30, (effect.duration ?? 240) + Number(modifiers.durationMinutes ?? 0) + specialtyDuration);
      useJobStore.getState().enqueueJob({
        id: jobId,
        type: effect.type ?? "decode",
        roomId: effect.roomId ?? "ops",
        duration,
        assignedCrewId: lead?.leadCrewId ?? null,
        requiredRole: effect.requiredRole ?? null,
        priority: "normal",
        createdAt: currentMinute,
        // Refund ownership stays in runtime.waitingJob. Omitting generic
        // inputItems prevents old job UIs from refunding the same recorder
        // before the story cancellation receipt runs.
        payload: { targetCrewId: lead?.leadCrewId ?? null, story: { runtimeId: runtime.id, chainId: runtime.chainId, stageId: runtime.pendingClaim.stageId, claimId, optionId: runtime.pendingClaim.optionId, nextStageId: effect.nextStageId, leadCrewId: lead?.leadCrewId ?? null, completionCrewFatigue: Math.max(0, (effect.completionCrewFatigue ?? 0) + Number(modifiers.fatigueDelta ?? 0) + specialtyFatigue), refundItemsBeforeStart: effect.refundItemsBeforeStart ?? [], target: effect.target ?? null, markerLabel: effect.markerLabel ?? null, lead } },
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
    const crew = useCrewStore.getState().crew.filter((member) => member.alive !== false);
    const equipmentInstances = useEquipmentStore.getState().instances;
    const assignments = autoAssignTacticalCrew(crew, equipmentInstances);
    const stationSnapshot = buildTacticalStationSnapshot({ crew, equipmentInstances, assignments, mode: "auto" });
    const combat = {
      ...createCombatState(resolved.enemy, { stationSnapshot }),
      source: { kind: "eventChain", runtimeId: runtime.id, stageId: runtime.pendingClaim.stageId, claimId, optionId: runtime.pendingClaim.optionId, chainId: runtime.chainId },
    };
    const started = useCombatStore.getState().startCombat({ vesselId, combat, targetId: "hull", feed: [`${getEventChain(runtime.chainId)?.title ?? "연속 사건"} 교전: ${resolved.enemy.name}`, "승리 전에는 조건부 보상이 지급되지 않습니다."] });
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
    const result = applyEffectOnce({ runtime, effect: effects[index], index, currentMinute, afterStep });
    if (!result.ok) return result;
    afterStep?.(`${effects[index].kind}:${index}`);
  }
  runtime = useMissionStore.getState().eventRuntimesById[runtimeId];
  const transition = runtime.pendingClaim.transition ?? {};
  if (transition.waitingStatus === EVENT_CHAIN_STATUS.waitingJob) {
    const jobId = `story-job:${runtime.pendingClaim.claimId}`;
    const storyEffect = runtime.pendingClaim.effects?.find((effect) => effect.kind === "enqueueStoryJob") ?? {};
    const next = setRuntime(runtimeId, (entry) => ({ ...entry, stageId: transition.nextStageId, status: EVENT_CHAIN_STATUS.waitingJob, waitingJob: { jobId, claimId: entry.pendingClaim.claimId, returnStageId: entry.pendingClaim.stageId, nextStageId: transition.nextStageId, assignedCrewId: null, refundItemsBeforeStart: storyEffect.refundItemsBeforeStart ?? [], failurePolicy: storyEffect.failurePolicy ?? "terminal", target: storyEffect.target ?? null, markerLabel: storyEffect.markerLabel ?? null, completionCrewFatigue: storyEffect.completionCrewFatigue ?? 0 }, updatedAt: currentMinute }));
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

export function getStoryOptionAvailability(option) {
  for (const effect of option?.effects ?? []) {
    if (effect.kind === "resource" && !resourceCostAvailable(effect.delta)) return { available: false, code: "insufficientResource", reason: "산소가 부족합니다." };
    if (effect.kind === "inventoryConsume") {
      const missing = (effect.items ?? []).find(({ itemId, qty }) => (useInventoryStore.getState().items.find((item) => item.id === itemId)?.qty ?? 0) < (qty ?? 0));
      if (missing) return { available: false, code: "missingItem", reason: `${missing.itemId}이(가) 부족합니다.` };
    }
    if (effect.kind === "enqueueStoryJob" && effect.requiredRole === "medic") {
      const crew = useCrewStore.getState().crew;
      const medic = crew.find((member) => member.alive && member.role === "의무실" && canWorkWithInjury(member.injury) && (member.fatigue ?? 0) < 85);
      if (!medic) return { available: false, code: "medicUnavailable", reason: "투입 가능한 의무관이 없습니다. 원격 이송을 선택할 수 있습니다." };
      const jobs = useJobStore.getState().jobs ?? [];
      const probeId = "story-option-availability-probe";
      const probe = {
        id: probeId,
        type: effect.type ?? "treatment",
        roomId: effect.roomId ?? "medbay",
        status: "backlog",
        assignedCrewId: null,
        requiredRole: effect.requiredRole,
        priority: "normal",
        createdAt: useGameStore.getState().currentMinute,
        duration: effect.duration ?? 1,
        payload: { story: { availabilityProbe: true } },
      };
      const { results } = scheduleJobs([...jobs, probe], ROOM_CONFIG, crew, useGameStore.getState().currentMinute);
      const canAssignImmediately = results.some((result) => result.jobId === probeId && result.kind === "assign");
      if (!canAssignImmediately) return { available: true, waitText: "의무실 슬롯 또는 의무관이 선행 작업에 예약됨 · 대기열에 등록됩니다." };
    }
    if (effect.kind === "recruitOffer") {
      const duplicateCandidate = (useRecruitStore.getState().candidatePool ?? []).some((entry) => entry.templateId === effect.templateId);
      const duplicateCrew = (useCrewStore.getState().crew ?? []).some((member) => member.alive !== false && member.templateId === effect.templateId);
      if (!getCrewTemplate(effect.templateId) || duplicateCandidate || duplicateCrew) return { available: false, code: "recruitUnavailable", reason: "이미 확보했거나 영입할 수 없는 후보입니다." };
    }
    if (effect.kind === "revealHighestDangerOrReputation") {
      const target = selectHighestDangerHiddenField();
      return { available: true, dynamicPreview: target ? `평판 +${effect.reputationWithReveal ?? 2} · ${target.name} 공개` : `공개할 미탐사 위험구역 없음 · 평판 +${effect.fallbackReputation ?? 3}` };
    }
  }
  return { available: true };
}

export function settleEventChainChoice({ vesselId = useShipStore.getState().activeVesselId, runtimeId, stageId, claimId, optionId, leadCrewId = null, useSpecialty = false, currentMinute = useGameStore.getState().currentMinute, afterStep } = {}) {
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
    const availability = getStoryOptionAvailability(option);
    if (!availability.available) return { ok: false, reason: availability.code ?? "optionUnavailable", detail: availability.reason };
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
    const candidates = getStoryLeadCandidates(current, option);
    if (candidates.length > 0) {
      const projection = getStoryLeadProjection(current, option, leadCrewId, useSpecialty);
      if (!projection.ok) return { ok: false, reason: projection.reason, candidates };
    }
  }
  const prepared = state.prepareStoryEncounter({ vesselId, runtimeId, stageId, claimId, optionId, currentMinute });
  if (!prepared.ok) return prepared;
  if (leadCrewId) {
    const option = getEventChain(current?.chainId)?.stages?.find((stage) => stage.id === stageId)?.options?.find((entry) => entry.id === optionId);
    const projection = getStoryLeadProjection(current, option, leadCrewId, useSpecialty);
    if (projection.ok && projection.lead) setRuntime(runtimeId, (entry) => ({ ...entry, pendingClaim: { ...entry.pendingClaim, lead: projection.lead, specialty: projection.specialty } }));
  }
  afterStep?.("prepared");
  return continuePreparedSettlement(runtimeId, currentMinute, afterStep);
}

export function settleManualEventChainStarter({ encounter, option, currentMinute = 0, manual = false, expectedClaimId = null, afterStep } = {}) {
  const starterEffect = option?.outcome?.find((effect) => effect.kind === "startEventChain");
  const chain = getEventChain(starterEffect?.chainId);
  const starter = chain?.starter;
  if (!encounter || !option || !chain || starter?.encounterId !== encounter.id || starter?.optionId !== option.id) return { ok: false, reason: "notEventChainStarter" };
  if (!manual) return { ok: false, reason: "manualOnly" };
  if (!encounter.claimId || expectedClaimId !== encounter.claimId) return { ok: false, reason: "staleClaim" };
  const vesselId = useShipStore.getState().activeVesselId;
  const claimId = `${encounter.claimId}:salvage`;
  const resourceDelta = {};
  (option.outcome ?? []).filter((effect) => effect.kind === "resource").forEach((effect) => Object.entries(effect.delta ?? {}).forEach(([key, value]) => { resourceDelta[key] = (resourceDelta[key] ?? 0) + value; }));
  if (Object.keys(resourceDelta).length > 0) useGameStore.getState().applyEncounterResources(`${claimId}:game`, resourceDelta);
  afterStep?.("salvageResources");
  const mission = useMissionStore.getState();
  const alreadyStarted = Boolean(mission.storyFlags?.[starter.startedFlagId]?.value);
  if (!alreadyStarted) {
    const nav = useNavStore.getState();
    const runtime = createEventRuntime({ chain, vesselId, currentMinute, dueAtMinute: currentMinute, seed: `${nav.sector?.id}:${encounter.claimId}` });
    if (!runtime) return { ok: false, reason: "invalidStoryRuntime" };
    const registered = useMissionStore.getState().registerEventRuntime(runtime);
    if (!registered.ok && registered.reason !== "duplicate") return registered;
    afterStep?.("storyRuntime");
    useMissionStore.getState().setStoryFlag({ flagId: starter.startedFlagId, value: true, currentMinute, sourceRuntimeId: runtime.id });
  } else {
    (starter.repeatEffects ?? []).forEach((effect, index) => {
      if (effect.kind === "resource") useGameStore.getState().applyEncounterResources(`${claimId}:repeat:game:${index}`, effect.delta ?? {});
      if (effect.kind === "inventoryGrant") useInventoryStore.getState().applyEncounterGrant(`${claimId}:repeat:inventory:${index}`, { items: effect.items ?? [] });
      afterStep?.(`repeatEffect:${index}`);
    });
    if (starter.repeatLabel) useNavStore.setState((state) => ({ pendingEncounter: state.pendingEncounter?.claimId === encounter.claimId ? { ...state.pendingEncounter, options: state.pendingEncounter.options.map((entry) => entry.id === option.id ? { ...entry, label: starter.repeatLabel } : entry) } : state.pendingEncounter }));
  }
  const resolved = useNavStore.getState().resolveEncounter(option.id, currentMinute, { allowGateTransit: true });
  (resolved.logs ?? []).forEach((message) => useGameStore.getState().addLog(`항해 조우: ${message}`));
  afterStep?.("navFinalize");
  return { ok: true, effects: [], logs: resolved.logs ?? [], started: !alreadyStarted, chainId: chain.id, chainTitle: chain.title };
}

// Save-compatible export for callers/tests from the first authored chain.
export const settleManualSalvageEncounter = settleManualEventChainStarter;

function selectNearestTransferTarget(nav, runtime) {
  const nodeTypes = new Set(runtime.waitingJob?.target?.nodeTypes ?? []);
  if (nodeTypes.size === 0) return null;
  const discovered = new Set(nav.discovered ?? []);
  const current = nav.sector?.nodes?.find((node) => node.id === nav.currentNodeId);
  const distance = (node) => current ? Math.hypot((node.pos?.x ?? 0) - (current.pos?.x ?? 0), (node.pos?.y ?? 0) - (current.pos?.y ?? 0)) : 0;
  const discoveredTargets = (nav.sector?.nodes ?? []).filter((node) => nodeTypes.has(node.type) && discovered.has(node.id));
  if (discoveredTargets.length > 0) return [...discoveredTargets].sort((a, b) => distance(a) - distance(b) || a.id.localeCompare(b.id))[0];
  return (nav.sector?.nodes ?? []).filter((node) => node.type === "exit").sort((a, b) => distance(a) - distance(b) || a.id.localeCompare(b.id))[0] ?? null;
}

function completeStoryJob(runtime, job, currentMinute) {
  if (runtime.status !== EVENT_CHAIN_STATUS.waitingJob || runtime.waitingJob?.jobId !== job.id) return { ok: false, reason: "staleJob" };
  const assignedCrewId = runtime.waitingJob.assignedCrewId ?? job.assignedCrewId;
  if (assignedCrewId && !runtime.waitingJob.assignedCrewId) runtime = setRuntime(runtime.id, (entry) => ({ ...entry, waitingJob: { ...entry.waitingJob, assignedCrewId }, updatedAt: currentMinute }));
  if (runtime.waitingJob.completionCrewFatigue > 0) {
    const crewClaimId = `${runtime.waitingJob.claimId}:crew-completion`;
    const medic = useCrewStore.getState().crew.find((member) => member.id === assignedCrewId);
    if (!useCrewStore.getState().encounterReceipts?.[crewClaimId] && !medic?.alive) return { ok: true, failed: true, runtime: finishRuntime(runtime.id, EVENT_CHAIN_STATUS.failed, currentMinute, { reason: "assignedMedicUnavailable" }) };
    useCrewStore.getState().applyStoryCrewOutcome(crewClaimId, { memberId: assignedCrewId, fatigue: runtime.waitingJob.completionCrewFatigue });
  }
  const nav = useNavStore.getState();
  const pinnedTargetId = runtime.waitingJob?.targetNodeId;
  const selected = pinnedTargetId
    ? nav.sector?.nodes?.find((node) => node.id === pinnedTargetId)
    : runtime.waitingJob?.target?.nodeTypes?.length
      ? selectNearestTransferTarget(nav, runtime)
      : selectDeterministicStoryTarget({ nodes: nav.sector?.nodes, discovered: nav.discovered, visited: nav.visited, currentNodeId: nav.currentNodeId, seed: runtime.id });
  const target = selected ?? null;
  if (!target) return { ok: true, cancelled: true, runtime: finishRuntime(runtime.id, EVENT_CHAIN_STATUS.cancelled, currentMinute, { reason: "noStoryTarget" }) };
  if (!pinnedTargetId) {
    runtime = setRuntime(runtime.id, (entry) => ({ ...entry, waitingJob: { ...entry.waitingJob, targetNodeId: target.id, targetSectorId: nav.sector?.id }, updatedAt: currentMinute }));
  }
  if (runtime.waitingJob?.targetSectorId && runtime.waitingJob.targetSectorId !== nav.sector?.id) return { ok: true, cancelled: true, runtime: finishRuntime(runtime.id, EVENT_CHAIN_STATUS.cancelled, currentMinute, { reason: "sectorChanged" }) };
  const chain = getEventChain(runtime.chainId);
  const revealed = nav.revealStoryTarget({ runtimeId: runtime.id, nodeId: target.id, label: runtime.waitingJob?.markerLabel ?? chain?.title ?? "STORY", sectorId: nav.sector?.id });
  if (!revealed.ok) return { ok: true, cancelled: true, runtime: finishRuntime(runtime.id, EVENT_CHAIN_STATUS.cancelled, currentMinute, { reason: revealed.reason }) };
  const next = setRuntime(runtime.id, (entry) => ({ ...entry, status: EVENT_CHAIN_STATUS.waitingLocation, pendingClaim: null, waitingJob: null, waitingLocation: { nodeId: target.id, sectorId: nav.sector.id, revealedAtMinute: currentMinute }, claimSequence: (entry.claimSequence ?? 0) + 1, updatedAt: currentMinute }));
  useGameStore.getState().addLog(`${chain?.title ?? "연속 사건"} 작업 완료: ${target.name}에 ${runtime.waitingJob?.markerLabel ?? "이송 목표"} 표식을 남겼습니다.`);
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
  const refundItems = runtime.waitingJob.refundItemsBeforeStart ?? runtime.waitingJob.refundItems ?? [];
  useInventoryStore.getState().applyEncounterGrant(refundClaim, { items: refundItems });
  const next = setRuntime(runtime.id, (entry) => ({ ...entry, stageId: entry.waitingJob.returnStageId, status: EVENT_CHAIN_STATUS.scheduled, dueAtMinute: currentMinute, claimSequence: (entry.claimSequence ?? 0) + 1, pendingClaim: null, waitingJob: null, updatedAt: currentMinute }));
  return { ok: true, refunded: refundItems.length > 0, runtime: next, job };
}

export function cancelEventChainJob({ jobId, currentMinute = useGameStore.getState().currentMinute, afterStep } = {}) {
  const job = useJobStore.getState().jobs.find((entry) => entry.id === jobId);
  if (!job?.payload?.story?.runtimeId) return { ok: false, reason: "notStoryJob" };
  const runtime = useMissionStore.getState().eventRuntimesById?.[job.payload.story.runtimeId];
  if (!runtime || runtime.waitingJob?.jobId !== jobId) return { ok: false, reason: "staleJob" };
  if (job.status === "in_progress") return { ok: false, reason: "in_progress", job };
  if (!["backlog", "assigned", "failed"].includes(job.status)) return { ok: false, reason: "not_cancellable", job };
  setRuntime(runtime.id, (entry) => ({ ...entry, waitingJob: { ...entry.waitingJob, cancelRequestedAt: currentMinute }, updatedAt: currentMinute }));
  afterStep?.("cancelIntent");
  const cancelled = useJobStore.getState().cancelJob(jobId);
  if (!cancelled.ok && job.status !== "failed") return cancelled;
  afterStep?.("jobCancelled");
  return recoverCancelledStoryJob(useMissionStore.getState().eventRuntimesById[runtime.id], { ...job, status: "failed" }, currentMinute);
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
    let job = useJobStore.getState().jobs.find((entry) => entry.id === runtime.waitingJob?.jobId);
    const definition = getStoryJobEffect(runtime);
    if (definition && (!runtime.waitingJob?.failurePolicy || !runtime.waitingJob?.markerLabel && definition.markerLabel)) {
      runtime = setRuntime(runtime.id, (entry) => ({ ...entry, waitingJob: { ...entry.waitingJob, failurePolicy: entry.waitingJob.failurePolicy ?? definition.failurePolicy ?? "terminal", refundItemsBeforeStart: entry.waitingJob.refundItemsBeforeStart ?? entry.waitingJob.refundItems ?? definition.refundItemsBeforeStart ?? [], target: entry.waitingJob.target ?? definition.target ?? null, markerLabel: entry.waitingJob.markerLabel ?? definition.markerLabel ?? null, completionCrewFatigue: entry.waitingJob.completionCrewFatigue ?? definition.completionCrewFatigue ?? 0 }, updatedAt: currentMinute }));
    }
    if (job?.assignedCrewId && !runtime.waitingJob?.assignedCrewId) {
      runtime = setRuntime(runtime.id, (entry) => ({ ...entry, waitingJob: { ...entry.waitingJob, assignedCrewId: job.assignedCrewId }, updatedAt: currentMinute }));
    }
    if (runtime.waitingJob?.cancelRequestedAt !== undefined && runtime.waitingJob?.cancelRequestedAt !== null) {
      if (["backlog", "assigned"].includes(job?.status)) {
        useJobStore.getState().cancelJob(job.id);
        job = useJobStore.getState().jobs.find((entry) => entry.id === runtime.waitingJob?.jobId);
      }
      if (job?.status === "failed") {
        recoverCancelledStoryJob(runtime, job, currentMinute);
        return;
      }
      if (job?.status === "in_progress") runtime = setRuntime(runtime.id, (entry) => ({ ...entry, waitingJob: { ...entry.waitingJob, cancelRequestedAt: null }, updatedAt: currentMinute }));
    }
    if (job?.status === "done") completeStoryJob(runtime, job, currentMinute);
    else if (job?.status === "failed") {
      if (runtime.waitingJob?.failurePolicy === "retry") recoverCancelledStoryJob(runtime, job, currentMinute);
      else finishRuntime(runtime.id, EVENT_CHAIN_STATUS.failed, currentMinute, { reason: job.payload?.story?.failureReason ?? "interruptedCare" });
    }
    else if (!job) finishRuntime(runtime.id, EVENT_CHAIN_STATUS.failed, currentMinute, { reason: "storyJobMissing" });
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
  return Object.values(useMissionStore.getState().eventRuntimesById ?? {}).some((runtime) => runtime.vesselId === vesselId && getEventChain(runtime.chainId)?.sectorBound && !isStoryRuntimeTerminal(runtime));
}

export function getSectorBoundStoryBlocker(vesselId) {
  const runtime = Object.values(useMissionStore.getState().eventRuntimesById ?? {}).find((entry) => entry.vesselId === vesselId && getEventChain(entry.chainId)?.sectorBound && !isStoryRuntimeTerminal(entry));
  return runtime ? { runtime, title: getEventChain(runtime.chainId)?.title ?? runtime.chainId } : null;
}

export function hasUnsettledEventChainCombat(vesselId) {
  return Object.values(useMissionStore.getState().eventRuntimesById ?? {}).some((runtime) => runtime.vesselId === vesselId && [EVENT_CHAIN_STATUS.settling, EVENT_CHAIN_STATUS.waitingCombat].includes(runtime.status) && runtime.pendingClaim?.effects?.some((effect) => effect.kind === "combat"));
}
