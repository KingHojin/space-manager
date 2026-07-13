import { getDirectorIncident } from "../data/directorIncidents";
import { canWorkWithInjury } from "../systems/injurySystem";
import { buildIncidentReport } from "../systems/reportSystem";
import { activeRuntimeCounts, advanceDirectorWindow, canPresentIncident, INCIDENT_TERMINAL_STATUSES } from "../systems/incidentDirectorSystem";
import { useCombatStore } from "../stores/combatStore";
import { useCrewStore } from "../stores/crewStore";
import { useExplorationStore } from "../stores/explorationStore";
import { useGameStore } from "../stores/gameStore";
import { useIncidentStore } from "../stores/incidentStore";
import { useInventoryStore } from "../stores/inventoryStore";
import { useJobStore } from "../stores/jobStore";
import { useMissionStore } from "../stores/missionStore";
import { useNavStore } from "../stores/navStore";
import { useReportStore } from "../stores/reportStore";
import { useShipInteriorStore } from "../stores/shipInteriorStore";
import { useShipStore } from "../stores/shipStore";

function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
function addDelta(target, source = {}) { Object.entries(source).forEach(([key, value]) => { target[key] = (target[key] ?? 0) + value; }); }

function aliveCrew() { return useCrewStore.getState().crew.filter((member) => member.alive); }
function isUsableCrew(member) { return Boolean(member?.alive && canWorkWithInjury(member.injury) && (member.fatigue ?? 0) < 85); }

function pinTargets(template) {
  const crew = aliveCrew();
  if (template.targetMode === "highestFatigue") {
    const target = [...crew].sort((a, b) => (b.fatigue ?? 0) - (a.fatigue ?? 0) || a.id.localeCompare(b.id))[0];
    return { crewId: target?.id ?? null };
  }
  if (template.targetMode === "lowestAffinityPair") {
    const relations = useCrewStore.getState().relationships ?? {};
    let best = null;
    for (let first = 0; first < crew.length; first += 1) for (let second = first + 1; second < crew.length; second += 1) {
      const ids = [crew[first].id, crew[second].id].sort();
      const affinity = relations[ids.join("::")]?.affinity ?? 0;
      if (!best || affinity < best.affinity || affinity === best.affinity && ids.join("::") < best.ids.join("::")) best = { ids, affinity };
    }
    return { crewIds: best?.ids ?? crew.slice(0, 2).map((member) => member.id) };
  }
  return {};
}

function riskSnapshot() {
  const resources = useGameStore.getState().resources;
  const rooms = Object.values(useShipInteriorStore.getState().rooms ?? {});
  const crew = aliveCrew();
  const resourceRisk = [resources.fuel, resources.oxygen, resources.hull].reduce((sum, value) => sum + Math.max(0, 50 - value) / 2, 0);
  const roomRisk = rooms.reduce((sum, room) => sum + Math.max(0, 60 - (room.condition ?? 100)) / 8 + Math.max(0, (room.load ?? 0) - 60) / 8, 0);
  const crewRisk = crew.reduce((sum, member) => sum + Math.max(0, (member.fatigue ?? 0) - 55) / 10 + Math.max(0, (member.needs?.stress ?? 0) - 55) / 10, 0);
  return clamp(resourceRisk + roomRisk + crewRisk, 0, 100);
}

export function buildIncidentStateSnapshot() {
  const crewState = useCrewStore.getState();
  const crew = aliveCrew();
  const inventory = useInventoryStore.getState();
  const nav = useNavStore.getState();
  const roomEntries = Object.entries(useShipInteriorStore.getState().rooms ?? {});
  const rooms = Object.fromEntries(roomEntries.map(([id, value]) => [id, { condition: value.condition ?? 100, load: value.load ?? 0 }]));
  const highestFatigue = [...crew].sort((a, b) => (b.fatigue ?? 0) - (a.fatigue ?? 0) || a.id.localeCompare(b.id))[0];
  let lowestAffinity = 0;
  for (let first = 0; first < crew.length; first += 1) for (let second = first + 1; second < crew.length; second += 1) {
    const key = [crew[first].id, crew[second].id].sort().join("::");
    lowestAffinity = Math.min(lowestAffinity, crewState.relationships?.[key]?.affinity ?? 0);
  }
  const currentNode = nav.sector?.nodes?.find((node) => node.id === nav.currentNodeId);
  const destinationNode = nav.sector?.nodes?.find((node) => node.id === nav.travel?.toId);
  const itemFoodQty = inventory.items.filter((item) => item.type === "food").reduce((sum, item) => sum + (item.qty ?? 0), 0);
  const average = (selector) => crew.length > 0 ? crew.reduce((sum, member) => sum + selector(member), 0) / crew.length : 0;
  const activeCrises = useShipInteriorStore.getState().activeCrises ?? [];
  return {
    aliveCrewCount: crew.length,
    avgHunger: average((member) => member.needs?.hunger ?? 0),
    avgFatigue: average((member) => member.fatigue ?? 0),
    targetFatigue: highestFatigue?.fatigue ?? 0,
    targetSleepDebt: highestFatigue?.needs?.sleepDebt ?? 0,
    highStressCrewCount: crew.filter((member) => (member.needs?.stress ?? 0) >= 60).length,
    lowestAffinity,
    foodQty: itemFoodQty,
    oxygen: useGameStore.getState().resources.oxygen ?? 100,
    rooms,
    highLoadRoomCount: roomEntries.filter(([, value]) => (value.load ?? 0) >= 70).length,
    traveling: Boolean(nav.travel),
    isNebula: currentNode?.type === "nebula" || destinationNode?.type === "nebula",
    isUnexplored: currentNode?.type === "unknown" || destinationNode?.type === "unknown" || Boolean(destinationNode && !(nav.visited ?? []).includes(destinationNode.id)),
    hasActiveCrisis: activeCrises.length > 0,
    campaignStartMinute: 0,
  };
}

function presentationBlockers(vesselId) {
  const mission = useMissionStore.getState();
  const incident = useIncidentStore.getState();
  return {
    combat: useCombatStore.getState().combatByVesselId?.[vesselId]?.status === "engaged" || Boolean(useExplorationStore.getState().pendingCombatEncounter),
    navigation: Boolean(useNavStore.getState().pendingEncounter),
    missionEncounter: Boolean(mission.pendingMissionEncountersByVesselId?.[vesselId]),
    story: Boolean(mission.pendingStoryEncounterByVesselId?.[vesselId]),
    incidentPresented: Boolean(incident.presentedByVesselId?.[vesselId]),
  };
}

function directorContext(vesselId) {
  const runtimes = Object.values(useIncidentStore.getState().runtimesById).filter((runtime) => runtime.vesselId === vesselId && !INCIDENT_TERMINAL_STATUSES.has(runtime.status));
  const counts = activeRuntimeCounts(runtimes);
  return { hasMedium: counts.medium > 0, hasActiveCrisis: (useShipInteriorStore.getState().activeCrises ?? []).length > 0, aliveCrewCount: aliveCrew().length, operationalActive: counts.operational, hasUnresolvedDecision: counts.unresolvedDecision };
}

function makeRuntime(selected, vesselId) {
  const template = getDirectorIncident(selected.templateId);
  const id = `incident:${vesselId}:${selected.templateId}:${selected.pulseMinute}:${selected.sequence}`;
  return { id, templateId: template.id, templateVersion: 1, vesselId, severity: template.severity, category: template.category, roomId: template.roomId, targets: pinTargets(template), status: "queued", stageId: "decision", offerClaimId: `offer:${id}:decision`, createdAtMinute: selected.pulseMinute, history: [{ kind: "created", atMinute: selected.pulseMinute }] };
}

function preflightSnapshot(runtime, option) {
  if (runtime.deadlineAtMinute !== null && useGameStore.getState().currentMinute >= runtime.deadlineAtMinute) return { ok: false, reason: "deadlineExpired" };
  const costs = option.costs ?? [];
  const items = useInventoryStore.getState().items;
  const missingItem = costs.find((cost) => cost.type === "item" && (items.find((item) => item.id === cost.itemId)?.qty ?? 0) < cost.qty);
  if (missingItem) return { ok: false, reason: "missingItem", detail: missingItem.itemId };
  const resourceDelta = {};
  (option.effects ?? []).filter((effect) => effect.type === "resources").forEach((effect) => addDelta(resourceDelta, effect.delta));
  const resources = useGameStore.getState().resources;
  const missingResource = Object.entries(resourceDelta).find(([key, value]) => value < 0 && (resources[key] ?? 0) < -value);
  if (missingResource) return { ok: false, reason: "insufficientResource", detail: missingResource[0] };
  const targetIds = runtime.targets.crewIds ?? (runtime.targets.crewId ? [runtime.targets.crewId] : []);
  if (targetIds.some((id) => !aliveCrew().some((member) => member.id === id))) return { ok: false, reason: "targetUnavailable" };
  let waitText = null;
  if (option.job) {
    const workers = useCrewStore.getState().crew.filter((member) => isUsableCrew(member) && (!option.job.requiredRole || member.role === option.job.requiredRole));
    if (workers.length === 0) return option.job.requiredRole
      ? { ok: false, reason: "requiredRoleUnavailable", detail: option.job.requiredRole }
      : { ok: false, reason: "noUsableCrew" };
    const jobState = useJobStore.getState();
    const activeJobs = jobState.jobs.filter((job) => ["assigned", "in_progress"].includes(job.status));
    const reservedCrewIds = new Set(activeJobs.flatMap((job) => [job.assignedCrewId, job.payload?.targetCrewId]).filter(Boolean));
    const room = jobState.rooms?.[option.job.roomId];
    const roomUsed = activeJobs.filter((job) => job.roomId === option.job.roomId).length;
    const roomBusy = room && roomUsed >= Math.max(0, room.slotCapacity ?? 0);
    const crewBusy = workers.every((member) => reservedCrewIds.has(member.id));
    if (roomBusy || crewBusy) waitText = `${roomBusy ? "작업 슬롯" : option.job.requiredRole ? "필수 역할 승무원" : "작업 가능 승무원"}이 선행 작업에 예약됨 · 대기열에 등록됩니다.`;
  }
  return { ok: true, waitText, snapshot: { effects: option.effects ?? [], costs, job: option.job ?? null, label: option.label, detail: option.detail, targets: runtime.targets } };
}

export function getIncidentOptionAvailability(runtime, option) {
  return preflightSnapshot(runtime, option);
}

function expandCrewEffects(effects, targets) {
  const living = aliveCrew();
  const changes = new Map();
  let relation = null;
  const apply = (ids, patch) => ids.forEach((id, index) => {
    const current = changes.get(id) ?? { memberId: id, needs: {} };
    addDelta(current.needs, patch.needs ?? {});
    current.fatigue = (current.fatigue ?? 0) + (patch.fatigue ?? 0);
    current.morale = (current.morale ?? 0) + (patch.morale ?? 0);
    if (patch.injury) current.injury = patch.injury;
    if (index === 0) { current.morale += patch.firstMorale ?? 0; addDelta(current.needs, patch.firstNeeds ?? {}); }
    if (index === 1) { current.morale += patch.secondMorale ?? 0; addDelta(current.needs, patch.secondNeeds ?? {}); }
    changes.set(id, current);
  });
  effects.forEach((effect) => {
    if (effect.type === "crewAll") apply(living.map((member) => member.id), effect);
    if (effect.type === "targetCrew" && targets.crewId) apply([targets.crewId], effect);
    if (effect.type === "targetPair") {
      apply(targets.crewIds ?? [], effect);
      if ((targets.crewIds ?? []).length === 2 && effect.affinity) relation = { crewIds: targets.crewIds, affinity: effect.affinity };
    }
  });
  return { members: [...changes.values()], relation };
}

function applyEffectSnapshot(runtime, claimId, snapshot, currentMinute, afterStep) {
  const effects = snapshot.effects ?? [];
  const resources = {};
  effects.filter((effect) => effect.type === "resources").forEach((effect) => addDelta(resources, effect.delta));
  if (Object.keys(resources).length > 0) useGameStore.getState().applyIncidentResources(claimId, resources);
  afterStep?.("resources");

  const costs = (snapshot.costs ?? []).filter((cost) => cost.type === "item").map(({ itemId, qty }) => ({ itemId, qty }));
  const grants = effects.filter((effect) => effect.type === "items").flatMap((effect) => effect.grants ?? []);
  if (costs.length > 0 || grants.length > 0) {
    const result = useInventoryStore.getState().applyIncidentItems(claimId, { costs, grants });
    if (!result.ok) return { ok: false, reason: result.reason };
  }
  afterStep?.("inventory");

  const crew = expandCrewEffects(effects, snapshot.targets ?? runtime.targets);
  if (crew.members.length > 0 || crew.relation) useCrewStore.getState().applyIncidentOutcome(claimId, { ...crew, currentMinute });
  afterStep?.("crew");

  const roomEffects = effects.filter((effect) => effect.type === "room");
  const crisisEffect = effects.find((effect) => effect.type === "crisis");
  if (roomEffects.length > 0 || crisisEffect) {
    const crisis = crisisEffect ? { id: `crisis:incident:${claimId}`, roomId: crisisEffect.roomId, type: crisisEffect.crisisType, severity: crisisEffect.severity ?? 1 } : null;
    const result = useShipInteriorStore.getState().applyIncidentPhysicalEffects(claimId, { roomEffects, crisis, currentMinute });
    if (crisis && !result.crisis) useGameStore.getState().applyIncidentResources(`${claimId}:occupied-fallback`, { oxygen: -2 });
  }
  afterStep?.("physical");
  return { ok: true };
}

function resolutionReport(runtime, claimId, summary, outcome, currentMinute) {
  const template = getDirectorIncident(runtime.templateId);
  return useReportStore.getState().applyIncidentReport(claimId, buildIncidentReport({ title: template?.title ?? "항해 사건", summary, incidentId: runtime.templateId, outcome, currentMinute, priority: outcome === "escalated" ? "high" : "info" }));
}

function settlePrepared(runtimeId, currentMinute, afterStep) {
  const runtime = useIncidentStore.getState().runtimesById[runtimeId];
  const pending = runtime?.pendingClaim;
  if (!runtime || runtime.status !== "settling" || !pending) return { ok: false, reason: "notSettling" };
  const applied = applyEffectSnapshot(runtime, pending.claimId, pending.snapshot, currentMinute, afterStep);
  if (!applied.ok) return applied;
  afterStep?.("effects");
  if (pending.snapshot.job) {
    const spec = pending.snapshot.job;
    const jobId = `incident-job:${pending.claimId}`;
    const requiredRole = spec.requiredRole === "기관실" ? "engineer" : spec.requiredRole === "의무실" ? "medic" : spec.requiredRole ?? null;
    const jobResult = useJobStore.getState().applyIncidentJob(pending.claimId, { id: jobId, type: "incident_response", roomId: spec.roomId, duration: spec.duration, requiredRole, priority: runtime.severity === "medium" ? "high" : "normal", createdAt: currentMinute, payload: { incident: { runtimeId, claimId: pending.claimId, completionEffects: spec.completionEffects ?? [], failureEffects: spec.failureEffects ?? [], label: pending.snapshot.label } } });
    afterStep?.("job");
    useIncidentStore.getState().setWaitingJob(runtimeId, { jobId, claimId: pending.claimId, failureEffects: spec.failureEffects ?? [] }, currentMinute);
    return { ok: true, waitingJob: true, job: jobResult.job };
  }
  resolutionReport(runtime, pending.claimId, `${pending.snapshot.label} — ${pending.snapshot.detail ?? "처리 완료"}`, "resolved", currentMinute);
  afterStep?.("report");
  useIncidentStore.getState().finalize(runtimeId, "resolved", pending.optionId, currentMinute);
  return { ok: true, waitingJob: false };
}

export function settleIncidentChoice({ runtimeId, stageId, claimId, optionId, manual = false, currentMinute = useGameStore.getState().currentMinute, afterStep } = {}) {
  if (!manual) return { ok: false, reason: "manualOnly" };
  const runtime = useIncidentStore.getState().runtimesById[runtimeId];
  const template = getDirectorIncident(runtime?.templateId);
  const option = template?.options?.find((entry) => entry.id === optionId);
  if (!runtime || !option || runtime.status !== "pending" || runtime.stageId !== stageId || runtime.offerClaimId !== claimId) return { ok: false, reason: "staleSettlement" };
  if (runtime.deadlineAtMinute !== null && currentMinute >= runtime.deadlineAtMinute) return { ok: false, reason: "deadlineExpired" };
  const preflight = preflightSnapshot(runtime, option);
  if (!preflight.ok) return preflight;
  const prepared = useIncidentStore.getState().beginSettlement({ runtimeId, stageId, claimId, optionId, snapshot: preflight.snapshot, currentMinute });
  if (!prepared.ok) return prepared;
  afterStep?.("prepared");
  return settlePrepared(runtimeId, currentMinute, afterStep);
}

function prepareEscalation(runtime, effects, currentMinute, reason) {
  const claimId = `incident:${runtime.id}:timeout`;
  const pendingClaim = { claimId, offerClaimId: runtime.offerClaimId, optionId: "timeout", snapshot: { effects, costs: [], job: null, label: "대응 지연", detail: "사건이 악화되었습니다.", targets: runtime.targets }, createdAtMinute: currentMinute };
  useIncidentStore.setState((state) => ({ runtimesById: { ...state.runtimesById, [runtime.id]: { ...state.runtimesById[runtime.id], status: "settling", pendingClaim, history: [...state.runtimesById[runtime.id].history, { kind: "timeout", reason, atMinute: currentMinute }].slice(-20) } } }));
  return pendingClaim;
}

function settleEscalation(runtime, effects, currentMinute, reason) {
  const pending = runtime.status === "settling" && runtime.pendingClaim?.optionId === "timeout" ? runtime.pendingClaim : prepareEscalation(runtime, effects, currentMinute, reason);
  const fresh = useIncidentStore.getState().runtimesById[runtime.id];
  const result = applyEffectSnapshot(fresh, pending.claimId, pending.snapshot, currentMinute);
  if (!result.ok) return result;
  resolutionReport(fresh, pending.claimId, `대응 시한을 넘겨 ${reason} 후유증이 발생했습니다.`, "escalated", currentMinute);
  useIncidentStore.getState().finalize(runtime.id, "failed", reason, currentMinute);
  return { ok: true };
}

export function processIncidentJobCompletion(job, currentMinute = useGameStore.getState().currentMinute, afterStep) {
  const incident = job?.payload?.incident;
  if (!incident?.runtimeId) return { handled: false };
  const runtime = useIncidentStore.getState().runtimesById[incident.runtimeId];
  if (!runtime || INCIDENT_TERMINAL_STATUSES.has(runtime.status)) return { handled: true, ok: false, reason: "terminal" };
  const completedAt = (job.startedAt ?? currentMinute) + (job.effectiveDuration ?? job.duration ?? 0);
  if (runtime.deadlineAtMinute !== null && completedAt > runtime.deadlineAtMinute) {
    return { handled: true, ...settleEscalation(runtime, incident.failureEffects ?? [], currentMinute, "작업 지연") };
  }
  const claimId = `${incident.claimId}:completion`;
  const snapshot = { effects: incident.completionEffects ?? [], costs: [], targets: runtime.targets };
  applyEffectSnapshot(runtime, claimId, snapshot, currentMinute);
  afterStep?.("completionEffects");
  resolutionReport(runtime, claimId, `${incident.label ?? "대응 작업"} 완료.`, "resolved", currentMinute);
  afterStep?.("completionReport");
  useIncidentStore.getState().finalize(runtime.id, "resolved", "jobComplete", currentMinute);
  afterStep?.("completionFinalized");
  return { handled: true, ok: true };
}

function reconcilePinnedTargets(runtime, template, currentMinute) {
  if (!["queued", "pending"].includes(runtime.status) || !template.targetMode) return runtime;
  const expectedCount = template.targetMode === "lowestAffinityPair" ? 2 : 1;
  const currentIds = runtime.targets.crewIds ?? (runtime.targets.crewId ? [runtime.targets.crewId] : []);
  const livingIds = new Set(aliveCrew().map((member) => member.id));
  if (currentIds.length === expectedCount && currentIds.every((id) => livingIds.has(id))) return runtime;
  const targets = pinTargets(template);
  const nextIds = targets.crewIds ?? (targets.crewId ? [targets.crewId] : []);
  if (nextIds.length !== expectedCount || nextIds.some((id) => !livingIds.has(id))) {
    useIncidentStore.getState().finalize(runtime.id, "cancelled", "targetUnavailable", currentMinute);
    if (runtime.status === "pending" && runtime.pauseOwned) useGameStore.getState().setPaused(false);
    return null;
  }
  let updated = null;
  useIncidentStore.setState((state) => {
    const current = state.runtimesById[runtime.id];
    if (!current || !["queued", "pending"].includes(current.status)) return state;
    updated = { ...current, targets, history: [...current.history, { kind: "retargeted", atMinute: currentMinute }].slice(-20) };
    return { runtimesById: { ...state.runtimesById, [runtime.id]: updated } };
  });
  return updated ?? runtime;
}

function reconcileRuntime(runtime, currentMinute) {
  const template = getDirectorIncident(runtime.templateId);
  if (!template) { useIncidentStore.getState().finalize(runtime.id, "cancelled", "unknownTemplate", currentMinute); return; }
  runtime = reconcilePinnedTargets(runtime, template, currentMinute);
  if (!runtime) return;
  if (runtime.status === "settling" && runtime.pendingClaim) {
    if (runtime.pendingClaim.optionId === "timeout") settleEscalation(runtime, runtime.pendingClaim.snapshot.effects, currentMinute, runtime.terminalReason ?? "대응 지연");
    else settlePrepared(runtime.id, currentMinute);
    return;
  }
  if (runtime.status === "pending" && runtime.deadlineAtMinute !== null && currentMinute >= runtime.deadlineAtMinute) {
    if ((template.timeoutEffects ?? []).length === 0) {
      useIncidentStore.getState().finalize(runtime.id, "cancelled", "opportunityExpired", currentMinute);
      return;
    }
    settleEscalation(runtime, template.timeoutEffects ?? [], currentMinute, "대응 지연");
    return;
  }
  if (runtime.status !== "waitingJob") return;
  const job = useJobStore.getState().jobs.find((entry) => entry.id === runtime.waitingJob?.jobId);
  if (!job) { settleEscalation(runtime, runtime.waitingJob?.failureEffects ?? [], currentMinute, "작업 기록 유실"); return; }
  if (job.status === "failed") { settleEscalation(runtime, job.payload?.incident?.failureEffects ?? [], currentMinute, "작업 취소 또는 담당자 이탈"); return; }
  if (job.status === "done") { processIncidentJobCompletion(job, currentMinute); return; }
  if (job.assignedCrewId && !aliveCrew().some((member) => member.id === job.assignedCrewId)) {
    useJobStore.getState().cancelJobsForCrew(job.assignedCrewId);
    settleEscalation(runtime, job.payload?.incident?.failureEffects ?? [], currentMinute, "담당자 이탈");
    return;
  }
  if (runtime.deadlineAtMinute !== null && currentMinute >= runtime.deadlineAtMinute && job.status !== "done") settleEscalation(runtime, job.payload?.incident?.failureEffects ?? [], currentMinute, "작업 지연");
}

export function processIncidentOrchestration(currentMinute = useGameStore.getState().currentMinute, deltaMinutes = 0) {
  useJobStore.getState().jobs.filter((job) => job.payload?.incident?.runtimeId && ["backlog", "assigned"].includes(job.status)).forEach((job) => {
    const linked = useIncidentStore.getState().runtimesById[job.payload.incident.runtimeId];
    if (!linked || INCIDENT_TERMINAL_STATUSES.has(linked.status)) useJobStore.getState().cancelJob(job.id);
  });
  Object.values(useIncidentStore.getState().runtimesById).forEach((runtime) => reconcileRuntime(runtime, currentMinute));
  const vesselId = useShipStore.getState().activeVesselId;
  if (deltaMinutes > 0) {
    const state = useIncidentStore.getState();
    const director = state.directorsByVesselId[vesselId];
    const fromMinute = currentMinute - deltaMinutes;
    const sectorId = useNavStore.getState().sector?.id ?? useNavStore.getState().sector?.number ?? "sector";
    const result = advanceDirectorWindow({ director, fromMinute, toMinute: currentMinute, vesselId, sectorId, risk: riskSnapshot(), context: directorContext(vesselId), snapshot: buildIncidentStateSnapshot() });
    useIncidentStore.getState().setDirector(vesselId, result.director);
    if (result.selected) useIncidentStore.getState().addRuntime(makeRuntime(result.selected, vesselId));
  }
  const blockers = presentationBlockers(vesselId);
  if (canPresentIncident(blockers)) {
    const presented = useIncidentStore.getState().presentNext(vesselId, currentMinute);
    if (presented?.severity === "medium" && getDirectorIncident(presented.templateId)?.pauseOnPresent) {
      const pauseOwned = !useGameStore.getState().isPaused;
      useIncidentStore.setState((state) => ({ runtimesById: { ...state.runtimesById, [presented.id]: { ...state.runtimesById[presented.id], pauseOwned } } }));
      useGameStore.getState().setPaused(true);
    }
  }
}

export function getIncidentPresentation(vesselId = useShipStore.getState().activeVesselId) {
  const state = useIncidentStore.getState();
  const runtime = state.runtimesById[state.presentedByVesselId[vesselId]];
  if (!runtime) return null;
  const template = getDirectorIncident(runtime.templateId);
  if (!template) return null;
  const crewById = new Map(useCrewStore.getState().crew.map((member) => [member.id, member]));
  const targetNames = (runtime.targets.crewIds ?? (runtime.targets.crewId ? [runtime.targets.crewId] : [])).map((id) => crewById.get(id)?.name ?? id);
  return { runtime, template, targetNames, queueCount: (state.queueByVesselId[vesselId] ?? []).length, activeCount: Object.values(state.runtimesById).filter((entry) => entry.vesselId === vesselId && !INCIDENT_TERMINAL_STATUSES.has(entry.status)).length };
}
