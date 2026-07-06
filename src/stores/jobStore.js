import { create } from "zustand";
import { persist } from "zustand/middleware";
import { JOB_DURATION, JOB_ECONOMY, JOB_LOAD_COST } from "../data/constants";
import { jobToLegacyRecovery, jobToLegacyShipWork, migrateLegacyQueues, normalizeJob } from "../systems/jobMigration";
import { normalizePriority } from "../systems/priorities";

const ACTIVE_STATUSES = new Set(["backlog", "assigned", "in_progress"]);

function createJobId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `job-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeJobs(jobs = []) {
  const seen = new Set();
  return jobs.map(normalizeJob).filter((job) => {
    if (seen.has(job.id)) return false;
    seen.add(job.id);
    return true;
  });
}

function activeJobs(jobs = []) {
  return normalizeJobs(jobs).filter((job) => ACTIVE_STATUSES.has(job.status));
}

function makeJob({ type, roomId, payload = {}, completeAt, cost = 0, duration, priority = "normal", assignedCrewId = null, startedAt = null }) {
  const safeDuration = Math.max(1, duration ?? JOB_DURATION[type] ?? 60);
  const safeStartedAt = startedAt ?? completeAt - safeDuration;
  return normalizeJob({
    id: createJobId(),
    type,
    roomId,
    status: "in_progress",
    assignedCrewId: assignedCrewId ?? payload.targetCrewId ?? null,
    priority: normalizePriority(priority),
    duration: safeDuration,
    completeAt,
    loadCost: JOB_LOAD_COST[type] ?? 1,
    createdAt: safeStartedAt,
    startedAt: safeStartedAt,
    payload,
    cost,
  });
}

export const useJobStore = create(
  persist(
    (set, get) => ({
      jobs: [],
      legacyMigrationVersion: 0,
      legacyMigrationErrors: [],
      enqueueJob: (jobInput) => {
        const job = normalizeJob({ ...jobInput, id: jobInput.id ?? createJobId() });
        set((state) => ({ jobs: [...normalizeJobs(state.jobs), job] }));
        return job;
      },
      enqueueShipWork: ({ type, roomId, completeAt, cost = 0, duration, payload = {}, priority = "normal" }) => {
        const jobType = type === "hullRepair" ? "hull_repair" : type === "salvageProcessing" ? "salvage" : type;
        const job = makeJob({ type: jobType, roomId, completeAt, cost, duration, payload, priority });
        set((state) => ({ jobs: [...normalizeJobs(state.jobs), job] }));
        return job;
      },
      enqueueRecovery: ({ memberId, completeAt, cost = 0, duration, fatigueRecovery = JOB_ECONOMY.recovery.fatigueRecovery, priority = "normal" }) => {
        const job = makeJob({
          type: "recovery",
          roomId: "medbay",
          completeAt,
          cost,
          duration,
          priority,
          assignedCrewId: memberId,
          payload: { targetCrewId: memberId, fatigueRecovery },
        });
        set((state) => ({ jobs: [...normalizeJobs(state.jobs), job] }));
        return job;
      },
      setJobPriority: (jobId, priority) => set((state) => ({ jobs: normalizeJobs(state.jobs).map((job) => (job.id === jobId ? { ...job, priority: normalizePriority(priority) } : job)) })),
      cancelJob: (jobId) => {
        let cancelled = null;
        set((state) => ({
          jobs: normalizeJobs(state.jobs).map((job) => {
            if (job.id !== jobId || job.status !== "backlog") return job;
            cancelled = { ...job, status: "failed", events: [...(job.events ?? []), { type: "cancelled" }] };
            return cancelled;
          }),
        }));
        return cancelled;
      },
      migrateLegacyQueues: ({ shipWorkQueue = [], recoveryQueue = [] }) => {
        if (get().legacyMigrationVersion >= 1) return { migrated: 0, errors: [] };
        const result = migrateLegacyQueues(shipWorkQueue, recoveryQueue);
        set((state) => {
          const existingIds = new Set(normalizeJobs(state.jobs).map((job) => job.id));
          const additions = result.jobs.filter((job) => !existingIds.has(job.id));
          return {
            jobs: [...normalizeJobs(state.jobs), ...additions],
            legacyMigrationVersion: 1,
            legacyMigrationErrors: result.errors,
          };
        });
        return { migrated: result.jobs.length, errors: result.errors };
      },
      completeReadyJobs: (currentMinute) => {
        const completed = [];
        set((state) => {
          const jobs = normalizeJobs(state.jobs).map((job) => {
            if (!ACTIVE_STATUSES.has(job.status) || job.completeAt > currentMinute) return job;
            const done = { ...job, status: "done", progress: 1, events: [...(job.events ?? []), { type: "completed", at: currentMinute }] };
            completed.push(done);
            return done;
          });
          return { jobs };
        });
        return completed;
      },
      getLegacyShipWorkQueue: () => activeJobs(get().jobs).map(jobToLegacyShipWork).filter(Boolean),
      getLegacyRecoveryQueue: () => activeJobs(get().jobs).map(jobToLegacyRecovery).filter(Boolean),
      getActiveJobs: () => activeJobs(get().jobs),
    }),
    {
      name: "space-manager-jobs",
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...(persistedState ?? {}),
        jobs: normalizeJobs(persistedState?.jobs ?? currentState.jobs),
        legacyMigrationVersion: persistedState?.legacyMigrationVersion ?? 0,
        legacyMigrationErrors: persistedState?.legacyMigrationErrors ?? [],
      }),
    },
  ),
);