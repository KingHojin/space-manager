import { create } from "zustand";
import { persist } from "zustand/middleware";
import { getDirectorIncident, INCIDENT_DIRECTOR_RULES } from "../data/directorIncidents";
import { INCIDENT_TERMINAL_STATUSES, normalizeDirector } from "../systems/incidentDirectorSystem";
import { passthroughMigrate, PERSIST_VERSION } from "./persistVersion";

const ACTIVE_STATUSES = new Set(["queued", "pending", "settling", "waitingJob", "monitoring"]);

function normalizeRuntime(runtime = {}) {
  const status = ACTIVE_STATUSES.has(runtime.status) || INCIDENT_TERMINAL_STATUSES.has(runtime.status) ? runtime.status : "cancelled";
  return {
    id: String(runtime.id ?? "incident-unknown"),
    templateId: String(runtime.templateId ?? "unknown"),
    templateVersion: runtime.templateVersion ?? 1,
    vesselId: String(runtime.vesselId ?? "vessel-starter"),
    severity: runtime.severity === "medium" ? "medium" : "daily",
    category: runtime.category ?? "general",
    roomId: runtime.roomId ?? null,
    targets: runtime.targets && typeof runtime.targets === "object" ? runtime.targets : {},
    status,
    stageId: runtime.stageId ?? "decision",
    offerClaimId: runtime.offerClaimId ?? `offer:${runtime.id ?? "unknown"}:decision`,
    createdAtMinute: Number.isFinite(runtime.createdAtMinute) ? runtime.createdAtMinute : 0,
    presentedAtMinute: Number.isFinite(runtime.presentedAtMinute) ? runtime.presentedAtMinute : null,
    deadlineAtMinute: Number.isFinite(runtime.deadlineAtMinute) ? runtime.deadlineAtMinute : null,
    pendingClaim: runtime.pendingClaim ?? null,
    receipts: runtime.receipts && typeof runtime.receipts === "object" ? runtime.receipts : {},
    waitingJob: runtime.waitingJob ?? null,
    history: Array.isArray(runtime.history) ? runtime.history.slice(-20) : [],
    terminalAtMinute: Number.isFinite(runtime.terminalAtMinute) ? runtime.terminalAtMinute : null,
    terminalReason: runtime.terminalReason ?? null,
    pauseOwned: Boolean(runtime.pauseOwned),
  };
}

function terminalizeUnknown(runtime) {
  if (!ACTIVE_STATUSES.has(runtime.status) || getDirectorIncident(runtime.templateId)) return runtime;
  return { ...runtime, status: "cancelled", terminalReason: "unknownTemplate", terminalAtMinute: runtime.terminalAtMinute ?? runtime.createdAtMinute, pendingClaim: null, waitingJob: null };
}

function capRuntimes(runtimesById) {
  const values = Object.values(runtimesById);
  const active = values.filter((runtime) => ACTIVE_STATUSES.has(runtime.status));
  const terminal = values.filter((runtime) => !ACTIVE_STATUSES.has(runtime.status)).sort((a, b) => (b.terminalAtMinute ?? b.createdAtMinute) - (a.terminalAtMinute ?? a.createdAtMinute)).slice(0, INCIDENT_DIRECTOR_RULES.maxHistory);
  return Object.fromEntries([...active, ...terminal].map((runtime) => [runtime.id, runtime]));
}

export function mergePersistedIncidentState(persistedState, currentState) {
  const runtimes = Object.fromEntries(Object.entries(persistedState?.runtimesById ?? {}).map(([id, runtime]) => [id, terminalizeUnknown(normalizeRuntime({ ...runtime, id }))]));
  const knownIds = new Set(Object.keys(runtimes));
  const queueByVesselId = Object.fromEntries(Object.entries(persistedState?.queueByVesselId ?? {}).map(([vesselId, ids]) => [vesselId, [...new Set(Array.isArray(ids) ? ids : [])].filter((id) => knownIds.has(id) && runtimes[id].status === "queued").slice(0, INCIDENT_DIRECTOR_RULES.maxQueue)]));
  const presentedByVesselId = Object.fromEntries(Object.entries(persistedState?.presentedByVesselId ?? {}).filter(([, id]) => knownIds.has(id) && runtimes[id].status === "pending"));
  const directorsByVesselId = Object.fromEntries(Object.entries(persistedState?.directorsByVesselId ?? {}).map(([id, director]) => [id, normalizeDirector(director, 0)]));
  return {
    ...currentState,
    ...(persistedState ?? {}),
    directorsByVesselId,
    runtimesById: capRuntimes(runtimes),
    queueByVesselId,
    presentedByVesselId,
    incidentHistory: Array.isArray(persistedState?.incidentHistory) ? persistedState.incidentHistory.slice(-INCIDENT_DIRECTOR_RULES.maxHistory) : [],
  };
}

export const useIncidentStore = create(
  persist(
    (set, get) => ({
      directorsByVesselId: {},
      runtimesById: {},
      queueByVesselId: {},
      presentedByVesselId: {},
      incidentHistory: [],
      setDirector: (vesselId, director) => set((state) => ({ directorsByVesselId: { ...state.directorsByVesselId, [vesselId]: normalizeDirector(director, 0) } })),
      addRuntime: (runtime) => {
        const normalized = normalizeRuntime(runtime);
        let result = { ok: false, reason: "duplicate" };
        set((state) => {
          if (state.runtimesById[normalized.id]) return state;
          const queue = state.queueByVesselId[normalized.vesselId] ?? [];
          if (queue.length >= INCIDENT_DIRECTOR_RULES.maxQueue) {
            result = { ok: false, reason: "capacity" };
            return { incidentHistory: [...state.incidentHistory, { id: normalized.id, templateId: normalized.templateId, vesselId: normalized.vesselId, status: "suppressed", atMinute: normalized.createdAtMinute, reason: "capacity" }].slice(-INCIDENT_DIRECTOR_RULES.maxHistory) };
          }
          result = { ok: true, runtime: normalized };
          return { runtimesById: { ...state.runtimesById, [normalized.id]: normalized }, queueByVesselId: { ...state.queueByVesselId, [normalized.vesselId]: [...queue, normalized.id] } };
        });
        return result;
      },
      presentNext: (vesselId, currentMinute) => {
        let presented = null;
        set((state) => {
          const existing = state.presentedByVesselId[vesselId];
          if (existing && state.runtimesById[existing]?.status === "pending") return state;
          const activeCount = Object.values(state.runtimesById).filter((runtime) => runtime.vesselId === vesselId && ["pending", "settling", "waitingJob", "monitoring"].includes(runtime.status)).length;
          if (activeCount >= INCIDENT_DIRECTOR_RULES.maxActive) return state;
          const queue = [...(state.queueByVesselId[vesselId] ?? [])];
          const runtimeId = queue.find((id) => state.runtimesById[id]?.status === "queued");
          if (!runtimeId) return { presentedByVesselId: { ...state.presentedByVesselId, [vesselId]: undefined }, queueByVesselId: { ...state.queueByVesselId, [vesselId]: [] } };
          const runtime = state.runtimesById[runtimeId];
          const template = getDirectorIncident(runtime.templateId);
          if (!template) return state;
          presented = { ...runtime, status: "pending", presentedAtMinute: currentMinute, deadlineAtMinute: currentMinute + template.deadlineMinutes, history: [...runtime.history, { kind: "presented", atMinute: currentMinute }].slice(-20) };
          return { runtimesById: { ...state.runtimesById, [runtimeId]: presented }, queueByVesselId: { ...state.queueByVesselId, [vesselId]: queue.filter((id) => id !== runtimeId) }, presentedByVesselId: { ...state.presentedByVesselId, [vesselId]: runtimeId } };
        });
        return presented;
      },
      beginSettlement: ({ runtimeId, stageId, claimId, optionId, snapshot, currentMinute }) => {
        const runtime = get().runtimesById[runtimeId];
        if (!runtime || runtime.status !== "pending" || runtime.stageId !== stageId || runtime.offerClaimId !== claimId) return { ok: false, reason: "staleSettlement" };
        const template = getDirectorIncident(runtime.templateId);
        const option = template?.options?.find((entry) => entry.id === optionId);
        if (!option || !option.manualOnly && template?.manualOnly !== true) return { ok: false, reason: "invalidOption" };
        const settlementClaimId = `incident:${runtimeId}:${stageId}:${optionId}`;
        const pendingClaim = { claimId: settlementClaimId, offerClaimId: claimId, optionId, snapshot, createdAtMinute: currentMinute };
        set((state) => ({ runtimesById: { ...state.runtimesById, [runtimeId]: { ...state.runtimesById[runtimeId], status: "settling", pendingClaim, history: [...state.runtimesById[runtimeId].history, { kind: "choice", optionId, atMinute: currentMinute }].slice(-20) } } }));
        return { ok: true, claimId: settlementClaimId, pendingClaim };
      },
      markReceipt: (runtimeId, destination) => set((state) => {
        const runtime = state.runtimesById[runtimeId];
        if (!runtime) return state;
        return { runtimesById: { ...state.runtimesById, [runtimeId]: { ...runtime, receipts: { ...runtime.receipts, [`${runtime.pendingClaim?.claimId}:${destination}`]: true } } } };
      }),
      setWaitingJob: (runtimeId, waitingJob, currentMinute) => set((state) => {
        const runtime = state.runtimesById[runtimeId];
        if (!runtime) return state;
        return { runtimesById: { ...state.runtimesById, [runtimeId]: { ...runtime, status: "waitingJob", waitingJob, pendingClaim: null, history: [...runtime.history, { kind: "waitingJob", jobId: waitingJob.jobId, atMinute: currentMinute }].slice(-20) } } };
      }),
      finalize: (runtimeId, status, reason, currentMinute) => {
        let result = null;
        set((state) => {
          const runtime = state.runtimesById[runtimeId];
          if (!runtime) return state;
          if (INCIDENT_TERMINAL_STATUSES.has(runtime.status)) { result = runtime; return state; }
          const terminal = { ...runtime, status, terminalReason: reason, terminalAtMinute: currentMinute, pendingClaim: null, waitingJob: null, deadlineAtMinute: null, history: [...runtime.history, { kind: status, reason, atMinute: currentMinute }].slice(-20) };
          result = terminal;
          const presented = { ...state.presentedByVesselId };
          if (presented[runtime.vesselId] === runtimeId) delete presented[runtime.vesselId];
          return { runtimesById: capRuntimes({ ...state.runtimesById, [runtimeId]: terminal }), queueByVesselId: { ...state.queueByVesselId, [runtime.vesselId]: (state.queueByVesselId[runtime.vesselId] ?? []).filter((id) => id !== runtimeId) }, presentedByVesselId: presented, incidentHistory: [...state.incidentHistory, { id: runtimeId, templateId: runtime.templateId, vesselId: runtime.vesselId, status, atMinute: currentMinute, reason }].slice(-INCIDENT_DIRECTOR_RULES.maxHistory) };
        });
        return result;
      },
      resetIncidents: () => set({ directorsByVesselId: {}, runtimesById: {}, queueByVesselId: {}, presentedByVesselId: {}, incidentHistory: [] }),
    }),
    { name: "space-manager-incidents", version: PERSIST_VERSION, migrate: passthroughMigrate, merge: mergePersistedIncidentState },
  ),
);

export function getPresentedIncident(vesselId, state = useIncidentStore.getState()) {
  const id = state.presentedByVesselId?.[vesselId];
  return id ? state.runtimesById?.[id] ?? null : null;
}
