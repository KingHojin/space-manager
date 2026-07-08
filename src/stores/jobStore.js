import { create } from "zustand";
import { persist } from "zustand/middleware";
import { JOB_DURATION, JOB_LOAD_COST, JOB_REQUIRED_ROLE, ROOM_CONFIG, SLOT_ROOM } from "../data/constants";
import { getActiveModifiers } from "../systems/cardEffects";
import { activeLegacyJobs, jobToLegacyModuleWork, jobToLegacyRecovery, jobToLegacyShipWork, jobToLegacyTraining, jobToLegacyTreatment, migrateLegacyQueues, normalizeJob, normalizeJobPriority, normalizeRoomId } from "../systems/jobMigration";
import { scheduleJobs } from "../systems/jobScheduler";
import { tickJobs } from "../systems/jobTick";
import { useInventoryStore } from "./inventoryStore";
import { passthroughMigrate, PERSIST_VERSION } from "./persistVersion";

const ACTIVE = new Set(["backlog", "assigned", "in_progress"]);
const LEGACY_MIGRATION_VERSION = 3;
const MODULE_ROOM_BY_SLOT = SLOT_ROOM;

function createId() {
  return globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `job-${Date.now()}`;
}

function createRooms() {
  return Object.fromEntries(Object.entries(ROOM_CONFIG).map(([id, config]) => [id, { id, ...config, activeJobIds: [], currentLoad: 0 }]));
}

function clampProgress(value) {
  return Math.min(1, Math.max(0, value));
}

function normalizeJobs(jobs = [], now = null) {
  const seen = new Set();
  return jobs.map((job) => normalizeJob(job, now)).filter((job) => {
    if (seen.has(job.id)) return false;
    seen.add(job.id);
    return true;
  });
}

// Phase 18-D: jobStore.rooms is a pure "job-slot index" — slotCapacity/
// loadThreshold from ROOM_CONFIG plus activeJobIds/currentLoad derived from
// the in-progress `jobs` array. It is NOT an independent source of truth and
// carries no state of its own: it is fully recomputable from `jobs` at any
// time, which is exactly what this function does. This is a different
// concept from shipInteriorStore.rooms' `condition`/`load`, which track
// physical room wear/crisis state and decay over time independent of job
// scheduling (see systems/roomJobs.js). Do not conflate the two "load"
// fields — one is job-queue occupancy, the other is ship maintenance wear.
function roomsFromJobs(jobs = []) {
  const rooms = createRooms();
  jobs.forEach((job) => {
    if (job.status !== "in_progress" || !rooms[job.roomId]) return;
    rooms[job.roomId].activeJobIds.push(job.id);
    rooms[job.roomId].currentLoad += job.loadCost ?? JOB_LOAD_COST[job.type] ?? 1;
  });
  return rooms;
}

function makeJob(input = {}) {
  const type = input.type ?? "training";
  const speedMult = getActiveModifiers(useInventoryStore.getState().getActiveCards()).jobSpeedMult;
  return normalizeJob({
    id: input.id ?? createId(),
    type,
    roomId: normalizeRoomId(input.roomId, type),
    status: input.status ?? "backlog",
    assignedCrewId: input.assignedCrewId ?? null,
    requiredRole: input.requiredRole ?? JOB_REQUIRED_ROLE[type] ?? null,
    priority: normalizeJobPriority(input.priority),
    progress: input.progress ?? 0,
    duration: Math.max(1, Math.round((input.duration ?? JOB_DURATION[type] ?? 60) / Math.max(0.1, speedMult))),
    loadCost: input.loadCost ?? JOB_LOAD_COST[type] ?? 1,
    createdAt: input.createdAt ?? input.startedAt ?? 0,
    startedAt: input.startedAt ?? null,
    arrivalAt: input.arrivalAt ?? null,
    payload: input.payload ?? {},
    events: input.events ?? [],
    cost: input.cost ?? 0,
  });
}

function moduleRoom(slot) {
  return MODULE_ROOM_BY_SLOT[slot] ?? "engineering";
}

export const useJobStore = create(
  persist(
    (set, get) => ({
      jobs: [],
      rooms: createRooms(),
      legacyMigrationVersion: 0,
      legacyMigrationErrors: [],
      enqueueJob: (typeOrInput, roomId = null, payload = {}, options = {}) => {
        const input = typeof typeOrInput === "object" ? typeOrInput : { ...options, type: typeOrInput, roomId, payload };
        const job = makeJob(input);
        set((state) => {
          const jobs = [...normalizeJobs(state.jobs), job];
          return { jobs, rooms: roomsFromJobs(jobs) };
        });
        return job;
      },
      enqueueShipWork: ({ type, roomId, cost = 0, duration, payload = {}, priority = "normal", completeAt = null, createdAt = null }) => {
        const jobType = type === "hullRepair" ? "hull_repair" : type === "salvageProcessing" ? "salvage" : type;
        const start = createdAt ?? (completeAt && duration ? completeAt - duration : 0);
        return get().enqueueJob({ type: jobType, roomId, cost, duration, priority, createdAt: start, payload });
      },
      enqueueModuleWork: ({ action = "upgrade", slot = null, moduleId, cost = 0, duration, priority = "normal", completeAt = null, createdAt = null, payload = {} }) => {
        const start = createdAt ?? (completeAt && duration ? completeAt - duration : 0);
        const roomId = moduleRoom(slot);
        return get().enqueueJob({
          type: "module_upgrade",
          roomId,
          cost,
          duration,
          priority,
          createdAt: start,
          payload: { ...payload, action, slot, moduleId },
        });
      },
      enqueueTraining: ({ memberId, statKey, cost = 0, duration, priority = "normal", completeAt = null, createdAt = null }) => {
        const start = createdAt ?? (completeAt && duration ? completeAt - duration : 0);
        return get().enqueueJob({ type: "training", roomId: "living", cost, duration, priority, createdAt: start, payload: { targetCrewId: memberId, statKey } });
      },
      enqueueTreatment: ({ memberId, injury, cost = 0, duration, fatiguePenalty = 10, priority = "high", completeAt = null, createdAt = null }) => {
        const start = createdAt ?? (completeAt && duration ? completeAt - duration : 0);
        return get().enqueueJob({ type: "treatment", roomId: "medbay", cost, duration, priority, createdAt: start, payload: { targetCrewId: memberId, injury, fatiguePenalty } });
      },
      enqueueRecovery: ({ memberId, cost = 0, duration, fatigueRecovery = 32, priority = "normal", completeAt = null, createdAt = null }) => {
        const start = createdAt ?? (completeAt && duration ? completeAt - duration : 0);
        return get().enqueueJob({ type: "recovery", roomId: "medbay", cost, duration, priority, createdAt: start, payload: { targetCrewId: memberId, fatigueRecovery } });
      },
      enqueueDecode: ({ itemId, priority = "normal", createdAt = null }) =>
        get().enqueueJob({ type: "decode", roomId: "ops", duration: JOB_DURATION.decode, priority, createdAt: createdAt ?? 0, payload: { itemId } }),
      setJobPriority: (jobId, priority) => set((state) => ({ jobs: normalizeJobs(state.jobs).map((job) => (job.id === jobId ? { ...job, priority: normalizeJobPriority(priority) } : job)) })),
      nudgeJobPriority: (jobId, direction) => set((state) => ({ jobs: normalizeJobs(state.jobs).map((job) => (job.id === jobId && job.status === "backlog" ? { ...job, priority: Math.max(0, job.priority + direction) } : job)) })),
      cancelJob: (jobId) => {
        let result = { ok: false, reason: "not_found" };
        set((state) => {
          const jobs = normalizeJobs(state.jobs).map((job) => {
            if (job.id !== jobId) return job;
            if (job.status === "in_progress") {
              result = { ok: false, reason: "in_progress", job };
              return job;
            }
            if (!["backlog", "assigned"].includes(job.status)) return job;
            result = { ok: true, reason: "cancelled", job };
            return { ...job, status: "failed", assignedCrewId: null, arrivalAt: null };
          });
          return { jobs, rooms: roomsFromJobs(jobs) };
        });
        return result;
      },
      // Unlike cancelJob (which refuses to touch an in_progress job, since a
      // player-initiated cancel shouldn't discard work already underway), a
      // dead crew member's jobs must be force-cancelled including in_progress
      // — there is no one left to keep performing the work, and leaving it
      // running would occupy the room slot until an eventual no-op completion
      // (crewStore's complete*Job handlers already guard on `member.alive`).
      cancelJobsForCrew: (memberId) => {
        const cancelled = [];
        set((state) => {
          const jobs = normalizeJobs(state.jobs).map((job) => {
            if (!ACTIVE.has(job.status) || job.payload?.targetCrewId !== memberId) return job;
            cancelled.push(job);
            return { ...job, status: "failed", assignedCrewId: null, arrivalAt: null, startedAt: null };
          });
          return { jobs, rooms: roomsFromJobs(jobs) };
        });
        return cancelled;
      },
      migrateLegacyQueues: ({ shipWorkQueue = [], recoveryQueue = [], trainingQueue = [], treatmentQueue = [], currentMinute = null }) => {
        if (get().legacyMigrationVersion >= LEGACY_MIGRATION_VERSION) return { migrated: 0, errors: [] };
        const result = migrateLegacyQueues(shipWorkQueue, recoveryQueue, trainingQueue, treatmentQueue, currentMinute);
        set((state) => {
          const ids = new Set(normalizeJobs(state.jobs).map((job) => job.id));
          const jobs = [...normalizeJobs(state.jobs), ...result.jobs.filter((job) => !ids.has(job.id))];
          return { jobs, rooms: roomsFromJobs(jobs), legacyMigrationVersion: LEGACY_MIGRATION_VERSION, legacyMigrationErrors: result.errors };
        });
        return { migrated: result.jobs.length, errors: result.errors };
      },
      migrateProgressJobs: (currentMinute) => {
        if (get().legacyMigrationVersion >= 2) return { migrated: 0 };
        const jobs = normalizeJobs(get().jobs, currentMinute);
        set((state) => ({ jobs, rooms: roomsFromJobs(jobs), legacyMigrationVersion: 2 }));
        return { migrated: jobs.length };
      },
      runScheduler: ({ currentMinute = 0, crew = [] } = {}) => {
        const { results, warnings } = scheduleJobs(normalizeJobs(get().jobs), roomsFromJobs(get().jobs), crew, currentMinute);
        set((state) => {
          const jobs = normalizeJobs(state.jobs).map((job) => {
            const action = results.find((entry) => entry.jobId === job.id);
            if (!action) return job;
            if (action.kind === "rollback") return { ...job, status: "backlog", assignedCrewId: null, arrivalAt: null, startedAt: null };
            if (action.kind === "assign") return { ...job, status: "assigned", assignedCrewId: action.crewId, arrivalAt: action.arrivalAt };
            if (action.kind === "start") return { ...job, status: "in_progress", arrivalAt: null, startedAt: job.startedAt ?? currentMinute };
            return job;
          });
          return { jobs, rooms: roomsFromJobs(jobs) };
        });
        return [...results.map((entry) => `작업 스케줄: ${entry.kind}`), ...warnings.map((entry) => `작업 대기: ${entry.roomId} 방 없음`)];
      },
      advanceJobs: (deltaMinutes = 0) => {
        const done = [];
        set((state) => {
          const tick = tickJobs(normalizeJobs(state.jobs), deltaMinutes);
          const progress = new Map(tick.results.filter((entry) => entry.kind === "progress").map((entry) => [entry.jobId, entry.progress]));
          const complete = new Set(tick.results.filter((entry) => entry.kind === "complete").map((entry) => entry.jobId));
          const jobs = normalizeJobs(state.jobs).map((job) => {
            const nextProgress = progress.get(job.id) ?? job.progress;
            if (!complete.has(job.id)) return { ...job, progress: nextProgress };
            const finished = { ...job, progress: 1, status: "done" };
            done.push(finished);
            return finished;
          });
          return { jobs, rooms: roomsFromJobs(jobs) };
        });
        return done;
      },
      completeReadyJobs: (currentMinute) => {
        const done = [];
        set((state) => {
          const jobs = normalizeJobs(state.jobs).map((job) => {
            if (job.status !== "in_progress" || job.startedAt === null) return job;
            const progress = clampProgress((currentMinute - job.startedAt) / Math.max(1, job.duration));
            if (progress < 1) return { ...job, progress };
            const finished = { ...job, progress: 1, status: "done" };
            done.push(finished);
            return finished;
          });
          return { jobs, rooms: roomsFromJobs(jobs) };
        });
        return done;
      },
      recomputeRoomLoad: () => set((state) => ({ rooms: roomsFromJobs(state.jobs) })),
      getLegacyShipWorkQueue: () => activeLegacyJobs(normalizeJobs(get().jobs), jobToLegacyShipWork),
      getLegacyModuleQueue: () => activeLegacyJobs(normalizeJobs(get().jobs), jobToLegacyModuleWork),
      getLegacyTrainingQueue: () => activeLegacyJobs(normalizeJobs(get().jobs), jobToLegacyTraining),
      getLegacyTreatmentQueue: () => activeLegacyJobs(normalizeJobs(get().jobs), jobToLegacyTreatment),
      getLegacyRecoveryQueue: () => activeLegacyJobs(normalizeJobs(get().jobs), jobToLegacyRecovery),
      getActiveJobs: () => normalizeJobs(get().jobs).filter((job) => ACTIVE.has(job.status)),
      getBacklogJobs: () => normalizeJobs(get().jobs).filter((job) => job.status === "backlog"),
      getRunningJobs: () => normalizeJobs(get().jobs).filter((job) => ["assigned", "in_progress"].includes(job.status)),
    }),
    {
      name: "space-manager-jobs",
      version: PERSIST_VERSION,
      migrate: passthroughMigrate,
      // rooms is a derived job-slot index (see roomsFromJobs above), not
      // independent state, so it is excluded from what gets written to
      // storage going forward. Older saves may still carry a `rooms` field
      // (from before Phase 18-D) — merge below always recomputes rooms from
      // `jobs` and ignores whatever shape persistedState.rooms happens to be
      // in, so those old saves keep loading correctly without any special
      // migration step.
      partialize: (state) => {
        const { rooms: _rooms, ...persisted } = state;
        return persisted;
      },
      merge: (persistedState, currentState) => {
        const jobs = normalizeJobs(persistedState?.jobs ?? currentState.jobs);
        return { ...currentState, ...(persistedState ?? {}), jobs, rooms: roomsFromJobs(jobs), legacyMigrationVersion: persistedState?.legacyMigrationVersion ?? 0, legacyMigrationErrors: persistedState?.legacyMigrationErrors ?? [] };
      },
    },
  ),
);
