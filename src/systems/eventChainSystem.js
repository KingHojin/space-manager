import { EVENT_CHAIN_STATUS } from "../data/eventChains";

export const STORY_HISTORY_LIMIT = 40;
const TERMINAL_EVENT_CHAIN_STATUSES = new Set([
  EVENT_CHAIN_STATUS.completed,
  EVENT_CHAIN_STATUS.failed,
  EVENT_CHAIN_STATUS.cancelled,
]);

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function normalizeStoryFlags(flags) {
  return Object.fromEntries(Object.entries(record(flags)).filter(([key]) => Boolean(key)));
}

export function normalizeEventRuntime(runtime) {
  if (!runtime?.id || !runtime.chainId || !runtime.vesselId) return null;
  return {
    id: runtime.id,
    chainId: runtime.chainId,
    chainVersion: runtime.chainVersion ?? 1,
    missionId: runtime.missionId ?? null,
    vesselId: runtime.vesselId,
    stageId: runtime.stageId ?? null,
    status: Object.values(EVENT_CHAIN_STATUS).includes(runtime.status) ? runtime.status : EVENT_CHAIN_STATUS.scheduled,
    dueAtMinute: Number.isFinite(runtime.dueAtMinute) ? runtime.dueAtMinute : 0,
    localFlags: record(runtime.localFlags),
    pendingClaim: runtime.pendingClaim ?? null,
    history: Array.isArray(runtime.history) ? runtime.history.slice(-STORY_HISTORY_LIMIT) : [],
    createdAt: runtime.createdAt ?? 0,
    updatedAt: runtime.updatedAt ?? runtime.createdAt ?? 0,
  };
}

export function normalizeEventRuntimeMap(runtimes) {
  return Object.fromEntries(Object.entries(record(runtimes)).map(([id, runtime]) => [id, normalizeEventRuntime({ ...runtime, id: runtime?.id ?? id })]).filter(([, runtime]) => Boolean(runtime)));
}

export function cancelUnknownEventRuntimes(runtimes, knownChainIds = []) {
  const known = new Set(knownChainIds);
  return Object.fromEntries(Object.entries(normalizeEventRuntimeMap(runtimes)).map(([id, runtime]) => [id, known.has(runtime.chainId) ? runtime : { ...runtime, status: EVENT_CHAIN_STATUS.cancelled, pendingClaim: null }]));
}

export function normalizePendingStoryMap(pending, runtimes = {}) {
  return Object.fromEntries(Object.entries(record(pending)).filter(([vesselId, encounter]) => {
    const runtime = runtimes[encounter?.runtimeId];
    return Boolean(vesselId && encounter?.runtimeId && runtime?.vesselId === vesselId && runtime.status === EVENT_CHAIN_STATUS.pending);
  }));
}

export function normalizeStoryHistory(history) {
  return (Array.isArray(history) ? history : []).filter(Boolean).slice(0, STORY_HISTORY_LIMIT);
}

export function createEventRuntime({ chain, vesselId, missionId = null, stageId = null, currentMinute = 0, dueAtMinute = currentMinute, seed = "story" } = {}) {
  if (!chain?.id || !vesselId) return null;
  const firstStage = stageId ?? chain.stages?.[0]?.id ?? null;
  return normalizeEventRuntime({
    id: `${vesselId}:${chain.id}:${missionId ?? "expedition"}:${seed}`,
    chainId: chain.id,
    chainVersion: chain.version ?? 1,
    vesselId,
    missionId,
    stageId: firstStage,
    status: EVENT_CHAIN_STATUS.scheduled,
    dueAtMinute,
    createdAt: currentMinute,
    updatedAt: currentMinute,
  });
}

export function getDueEventRuntimes(runtimes, currentMinute) {
  return Object.values(normalizeEventRuntimeMap(runtimes))
    .filter((runtime) => runtime.status === EVENT_CHAIN_STATUS.scheduled && runtime.dueAtMinute <= currentMinute)
    .sort((left, right) => left.dueAtMinute - right.dueAtMinute || left.id.localeCompare(right.id));
}

export function canPresentStoryRuntime({ runtime, pendingByVesselId = {}, blockedVesselIds = new Set() } = {}) {
  if (!runtime || runtime.status !== EVENT_CHAIN_STATUS.scheduled) return false;
  if (pendingByVesselId[runtime.vesselId]) return false;
  return !blockedVesselIds.has(runtime.vesselId);
}

export function resolveStoryEncounterChoice({ runtime, encounter, chain, runtimeId, stageId, claimId, optionId, currentMinute = 0 } = {}) {
  if (!runtime || !encounter || !chain) return { ok: false, reason: "notFound" };
  if (runtime.id !== runtimeId || runtime.stageId !== stageId || encounter.runtimeId !== runtimeId || encounter.stageId !== stageId || encounter.claimId !== claimId) return { ok: false, reason: "staleEncounter" };
  if (runtime.status !== EVENT_CHAIN_STATUS.pending) return { ok: false, reason: "notPending" };
  const stage = chain.stages?.find((entry) => entry.id === stageId);
  const option = stage?.options?.find((entry) => entry.id === optionId);
  if (!option) return { ok: false, reason: "optionNotFound" };
  const transition = option.transition ?? {};
  const terminal = transition.terminalStatus;
  const validTerminal = !terminal || TERMINAL_EVENT_CHAIN_STATUSES.has(terminal);
  const validNextStage = Boolean(terminal) || Boolean(transition.nextStageId && chain.stages?.some((entry) => entry.id === transition.nextStageId));
  if (!validTerminal || !validNextStage) {
    const cancelled = normalizeEventRuntime({ ...runtime, status: EVENT_CHAIN_STATUS.cancelled, pendingClaim: null, updatedAt: currentMinute, history: [...(runtime.history ?? []), { stageId, optionId, atMinute: currentMinute, reason: "invalidTransition" }].slice(-STORY_HISTORY_LIMIT) });
    return { ok: true, runtime: cancelled, flagUpdates: {}, safeCancelled: true, reason: "invalidTransition", historyEntry: { runtimeId, chainId: chain.id, stageId, optionId, atMinute: currentMinute, status: cancelled.status, reason: "invalidTransition" } };
  }
  const nextRuntime = normalizeEventRuntime({ ...runtime, stageId: transition.nextStageId ?? runtime.stageId, status: terminal ? terminal : EVENT_CHAIN_STATUS.scheduled, dueAtMinute: currentMinute + Math.max(0, transition.delayMinutes ?? 0), localFlags: { ...runtime.localFlags, ...(transition.setFlags ?? {}) }, pendingClaim: null, updatedAt: currentMinute, history: [...runtime.history, { stageId, optionId, atMinute: currentMinute }].slice(-STORY_HISTORY_LIMIT) });
  const flagUpdates = Object.fromEntries(Object.entries(transition.setFlags ?? {}).map(([flagId, value]) => [flagId, { value, setAtMinute: currentMinute, sourceRuntimeId: runtime.id }]));
  return { ok: true, runtime: nextRuntime, flagUpdates, historyEntry: { runtimeId, chainId: chain.id, stageId, optionId, atMinute: currentMinute, status: nextRuntime.status } };
}
