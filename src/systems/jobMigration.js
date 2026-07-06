import { JOB_DURATION, JOB_ECONOMY, JOB_LOAD_COST } from "../data/constants";
import { normalizePriority } from "./priorities";

const SHIP_WORK_TYPE_MAP = {
  hullRepair: "hull_repair",
  salvageProcessing: "salvage",
};

const DEFAULT_ROOM_BY_TYPE = {
  recovery: "medbay",
  hull_repair: "engineering",
  salvage: "cargo",
  module_upgrade: "engineering",
  training: "living",
};

const REQUIRED_ROLE_BY_TYPE = {
  recovery: "의무실",
  hull_repair: "기관실",
  salvage: "기관실",
  module_upgrade: "기관실",
  training: null,
};

function createId(prefix) {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function normalizeJob(job = {}) {
  const type = job.type ?? "training";
  const duration = Math.max(1, numeric(job.duration, JOB_DURATION[type] ?? 60));
  const startedAt = numeric(job.startedAt, numeric(job.completeAt, 0) - duration);
  const completeAt = numeric(job.completeAt, startedAt + duration);
  const roomId = job.roomId ?? DEFAULT_ROOM_BY_TYPE[type] ?? "living";
  return {
    id: job.id ?? createId("job"),
    type,
    roomId,
    status: job.status ?? "in_progress",
    assignedCrewId: job.assignedCrewId ?? job.payload?.targetCrewId ?? null,
    requiredRole: job.requiredRole ?? REQUIRED_ROLE_BY_TYPE[type] ?? null,
    priority: normalizePriority(job.priority ?? "normal"),
    progress: Math.max(0, Math.min(1, numeric(job.progress, 0))),
    duration,
    completeAt,
    loadCost: numeric(job.loadCost, JOB_LOAD_COST[type] ?? 1),
    createdAt: numeric(job.createdAt, startedAt),
    startedAt,
    payload: job.payload ?? {},
    events: Array.isArray(job.events) ? job.events : [],
    cost: numeric(job.cost, 0),
  };
}

function shipWorkToJob(task) {
  const type = SHIP_WORK_TYPE_MAP[task?.type];
  if (!task?.id || !type) return null;
  return normalizeJob({
    id: task.id,
    type,
    roomId: task.roomId ?? DEFAULT_ROOM_BY_TYPE[type],
    priority: task.priority ?? (type === "hull_repair" ? "high" : "normal"),
    duration: task.duration,
    completeAt: task.completeAt,
    startedAt: task.startedAt,
    cost: task.cost,
    payload: task.payload ?? {},
  });
}

function recoveryToJob(task) {
  if (!task?.id || !task?.memberId) return null;
  return normalizeJob({
    id: task.id,
    type: "recovery",
    roomId: "medbay",
    assignedCrewId: task.memberId,
    priority: task.priority ?? "normal",
    duration: task.duration,
    completeAt: task.completeAt,
    startedAt: task.startedAt,
    cost: task.cost,
    payload: {
      targetCrewId: task.memberId,
      fatigueRecovery: task.fatigueRecovery ?? JOB_ECONOMY.recovery.fatigueRecovery,
    },
  });
}

export function migrateLegacyQueues(shipWorkQueue = [], recoveryQueue = []) {
  const jobs = [];
  const errors = [];
  shipWorkQueue.forEach((task) => {
    const job = shipWorkToJob(task);
    if (job) jobs.push(job);
    else errors.push({ source: "shipWorkQueue", id: task?.id ?? null, reason: "unsupported_task" });
  });
  recoveryQueue.forEach((task) => {
    const job = recoveryToJob(task);
    if (job) jobs.push(job);
    else errors.push({ source: "recoveryQueue", id: task?.id ?? null, reason: "invalid_task" });
  });
  return { jobs, errors };
}

export function jobToLegacyShipWork(job) {
  const normalized = normalizeJob(job);
  if (normalized.type !== "hull_repair" && normalized.type !== "salvage") return null;
  return {
    id: normalized.id,
    type: normalized.type === "hull_repair" ? "hullRepair" : "salvageProcessing",
    roomId: normalized.roomId,
    completeAt: normalized.completeAt,
    cost: normalized.cost,
    duration: normalized.duration,
    payload: normalized.payload,
    priority: normalized.priority,
    startedAt: normalized.startedAt,
  };
}

export function jobToLegacyRecovery(job) {
  const normalized = normalizeJob(job);
  if (normalized.type !== "recovery") return null;
  return {
    id: normalized.id,
    memberId: normalized.payload?.targetCrewId ?? normalized.assignedCrewId,
    completeAt: normalized.completeAt,
    cost: normalized.cost,
    duration: normalized.duration,
    fatigueRecovery: normalized.payload?.fatigueRecovery ?? JOB_ECONOMY.recovery.fatigueRecovery,
    priority: normalized.priority,
    startedAt: normalized.startedAt,
  };
}