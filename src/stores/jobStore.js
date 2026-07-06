import { create } from "zustand";
import { persist } from "zustand/middleware";
import { JOB_DURATION, JOB_LOAD_COST, JOB_REQUIRED_ROLE, ROOM_CONFIG } from "../data/constants";
import { migrateLegacyQueues, normalizeJob, normalizeJobPriority, normalizeRoomId } from "../systems/jobMigration";
import { scheduleJobs } from "../systems/jobScheduler";
import { tickJobs } from "../systems/jobTick";

const ACTIVE = new Set(["backlog", "assigned", "in_progress"]);

function createId() {
  return globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `job-${Date.now()}`;
}

function createRooms() {
  return Object.fromEntries(Object.entries(ROOM_CONFIG).map(([id, config]) => [id, { id, ...config, activeJobIds: [], currentLoad: 0 }]));
}

function normalizeJobs(jobs = [], now = null) {
  const seen = new Set();
  return jobs.map((job) => normalizeJob(job, now)).filter((job) => {
    if (seen.has(job.id)) return false;
    seen.add(job.id);
    return true;
  });
}

function roomsFromJobs(savedRooms = {}, jobs = []) {
  const rooms = createRooms();
  Object.keys(rooms).forEach((roomId) => {
    const saved = savedRooms?.[roomId] ?? {};
    rooms[roomId].activeJobIds = Array.isArray(saved.activeJobIds) ? saved.activeJobIds : [];
    rooms[roomId].currentLoad = Number(saved.currentLoad ?? 0) || 0;
    rooms[roomId].activeJobIds = [];
    rooms[roomId].currentLoad = 0;
  });
  jobs.forEach((job) => {
    if (job.status !== "in_progress" || !rooms[job.roomId]) return;
    rooms[job.roomId].activeJobIds.push(job.id);
    rooms[job.roomId].currentLoad += job.loadCost ?? JOB_LOAD_COST[job.type] ?? 1;
  });
  return rooms;
}

function makeJob(input = {}) {
  const type = input.type ?? "training";
  return normalizeJob({
    id: input.id ?? createId(),
    type,
    roomId: normalizeRoomId(input.roomId, type),
    status: input.status ?? "backlog",
    assignedCrewId: input.assignedCrewId ?? null,
    requiredRole: input.requiredRole ?? JOB_REQUIRED_ROLE[type] ?? null,
    priority: normalizeJobPriority(input.priority),
    progress: input.progress ?? 0,
    duration: Math.max(1, input.duration ?? JOB_DURATION[type] ?? 60),
    loadCost: input.loadCost ?? JOB_LOAD_COST[type] ?? 1,
    createdAt: input.createdAt ?? input.startedAt ?? 0,
    startedAt: input.startedAt ?? null,
    arrivalAt: input.arrivalAt ?? null,
    payload: input.payload ?? {},
    events: input.events ?? [],
    cost: input.cost ?? 0,
  });
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
          return { jobs, rooms: roomsFromJobs(state.rooms, jobs) };
        });
        return job;
      },
      enqueueShipWork: ({ type, roomId, cost = 0, duration, payload = {}, priority = "normal", completeAt = null, createdAt = null }) => {
        const jobType = type === "hullRepair" ? "hull_repair" : type === "salvageProcessing" ? "salvage" : type;
        const start = createdAt ?? (completeAt && duration ? completeAt - duration : 0);
        return get().enqueueJob({ type: jobType, roomId, cost, duration, priority, createdAt: start, payload });
      },
      enqueueRecovery: ({ memberId, cost = 0, duration, fatigueRecovery = 32, priority = "normal", completeAt = null, createdAt = null }) => {
        const start = createdAt ?? (completeAt && duration ? completeAt - duration : 0);
        return get().enqueueJob({ type: "recovery", roomId: "medbay", cost, duration, priority, createdAt: start, payload: { targetCrewId: memberId, fatigueRecovery } });
      },
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
          return { jobs, rooms: roomsFromJobs(state.rooms, jobs) };
        });
        return result;
      },
      migrateLegacyQueues: ({ shipWorkQueue = [], recoveryQueue = [], currentMinute = null }) => {
        if (get().legacyMigrationVersion >= 1) return { migrated: 0, errors: [] };
        const result = migrateLegacyQueues(shipWorkQueue, recoveryQueue, currentMinute);
        set((state) => {
          const ids = new Set(normalizeJobs(state.jobs).map((job) => job.id));
          const jobs = [...normalizeJobs(state.jobs), ...result.jobs.filter((job) => !ids.has(job.id))];
          return { jobs, rooms: roomsFromJobs(state.rooms, jobs), legacyMigrationVersion: 1, legacyMigrationErrors: result.errors };
        });
        return { migrated: result.jobs.length, errors: result.errors };
      },
      migrateProgressJobs: (currentMinute) => {
        if (get().legacyMigrationVersion >= 2) return { migrated: 0 };
        const jobs = normalizeJobs(get().jobs, currentMinute);
        set((state) => ({ jobs, rooms: roomsFromJobs(state.rooms, jobs), legacyMigrationVersion: 2 }));
        return { migrated: jobs.length };
      },
      runScheduler: ({ currentMinute = 0, crew = [] } = {}) => {
        const { results, warnings } = scheduleJobs(normalizeJobs(get().jobs), roomsFromJobs(get().rooms, get().jobs), crew, currentMinute);
        set((state) => {
          const jobs = normalizeJobs(state.jobs).map((job) => {
            const action = results.find((entry) => entry.jobId === job.id);
            if (!action) return job;
            if (action.kind === "rollback") return { ...job, status: "backlog", assignedCrewId: null, arrivalAt: null, startedAt: null };
            if (action.kind === "assign") return { ...job, status: "assigned", assignedCrewId: action.crewId, arrivalAt: action.arrivalAt };
            if (action.kind === "start") return { ...job, status: "in_progress", arrivalAt: null, startedAt: job.startedAt ?? currentMinute };
            return job;
          });
          return { jobs, rooms: roomsFromJobs(state.rooms, jobs) };
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
          return { jobs, rooms: roomsFromJobs(state.rooms, jobs) };
        });
        return done;
      },
      recomputeRoomLoad: () => set((state) => ({ rooms: roomsFromJobs(state.rooms, state.jobs) })),
      getActiveJobs: () => normalizeJobs(get().jobs).filter((job) => ACTIVE.has(job.status)),
      getBacklogJobs: () => normalizeJobs(get().jobs).filter((job) => job.status === "backlog"),
      getRunningJobs: () => normalizeJobs(get().jobs).filter((job) => ["assigned", "in_progress"].includes(job.status)),
    }),
    {
      name: "space-manager-jobs",
      merge: (persistedState, currentState) => {
        const jobs = normalizeJobs(persistedState?.jobs ?? currentState.jobs);
        return { ...currentState, ...(persistedState ?? {}), jobs, rooms: roomsFromJobs(persistedState?.rooms ?? currentState.rooms, jobs), legacyMigrationVersion: persistedState?.legacyMigrationVersion ?? 0, legacyMigrationErrors: persistedState?.legacyMigrationErrors ?? [] };
      },
    },
  ),
);
