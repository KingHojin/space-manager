import { JOB_DURATION, JOB_ECONOMY, JOB_LOAD_COST, JOB_PRIORITY, JOB_REQUIRED_ROLE, ROOM_CONFIG } from "../data/constants";

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

const ROOM_ALIASES = {
  engine_room: "engineering",
  cargo_bay: "cargo",
  cargo_hold: "cargo",
  medical: "medbay",
  bridge_room: "bridge",
};

function createId(prefix) {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function normalizedRequiredRole(job, type) {
  if (type === "recovery") return null;
  return hasOwn(job, "requiredRole") ? job.requiredRole : JOB_REQUIRED_ROLE[type] ?? null;
}

export function normalizeRoomId(roomId, type = null) {
  const fallback = DEFAULT_ROOM_BY_TYPE[type] ?? "living";
  const normalized = ROOM_ALIASES[roomId] ?? roomId ?? fallback;
  return ROOM_CONFIG[normalized] ? normalized : fallback;
}

export function normalizeJobPriority(priority) {
  if (typeof priority === "number" && Number.isFinite(priority)) return Math.max(0, Math.round(priority));
  if (JOB_PRIORITY[priority]) return JOB_PRIORITY[priority];
  return JOB_ECONOMY.defaultPriority;
}

export function priorityToActivityPriority(priority) {
  const value = normalizeJobPriority(priority);
  if (value <= JOB_PRIORITY.emergency) return "emergency";
  if (value <= JOB_PRIORITY.high) return "high";
  if (value <= JOB_PRIORITY.normal) return "normal";
  return "low";
}

export function jobTypeLabel(type) {
  if (type === "recovery") return "회복 절차";
  if (type === "hull_repair") return "선체 정비";
  if (type === "salvage") return "잔해 분해";
  if (type === "module_upgrade") return "부품 개선";
  if (type === "training") return "역할 훈련";
  return type ?? "작업";
}

export function progressFromLegacyTime(job = {}, now = null) {
  const type = job.type ?? "training";
  const duration = Math.max(1, numeric(job.duration, JOB_DURATION[type] ?? 60));
  const startedAt = job.startedAt === null ? null : numeric(job.startedAt, numeric(job.createdAt, 0));
  if (job.progress !== undefined && job.progress !== null) return clamp01(numeric(job.progress, 0));
  if (now === null || startedAt === null) return 0;
  return clamp01((numeric(now, startedAt) - startedAt) / duration);
}

export function normalizeJob(job = {}, now = null) {
  const type = job.type ?? "training";
  const duration = Math.max(1, numeric(job.duration, JOB_DURATION[type] ?? 60));
  const createdAt = numeric(job.createdAt, numeric(job.startedAt, 0));
  const startedAt = job.startedAt === null || job.startedAt === undefined ? null : numeric(job.startedAt, createdAt);
  const roomId = normalizeRoomId(job.roomId, type);
  const progress = progressFromLegacyTime({ ...job, type, duration, startedAt, createdAt }, now);
  const status = job.status ?? "backlog";
  return {
    id: job.id ?? createId("job"),
    type,
    roomId,
    status,
    assignedCrewId: job.assignedCrewId ?? null,
    requiredRole: normalizedRequiredRole(job, type),
    priority: normalizeJobPriority(job.priority),
    progress,
    duration,
    loadCost: numeric(job.loadCost, JOB_LOAD_COST[type] ?? 1),
    createdAt,
    startedAt: status === "backlog" ? null : startedAt,
    arrivalAt: job.arrivalAt ?? null,
    payload: job.payload ?? {},
    events: Array.isArray(job.events) ? job.events : [],
    cost: numeric(job.cost, 0),
  };
}

function shipWorkToJob(task, now) {
  const type = SHIP_WORK_TYPE_MAP[task?.type];
  if (!task?.id || !type) return null;
  return normalizeJob(
    {
      id: task.id,
      type,
      roomId: task.roomId ?? DEFAULT_ROOM_BY_TYPE[type],
      priority: task.priority ?? (type === "hull_repair" ? "high" : "normal"),
      duration: task.duration,
      startedAt: task.startedAt,
      createdAt: task.startedAt,
      cost: task.cost,
      payload: task.payload ?? {},
      status: "in_progress",
    },
    now,
  );
}

function recoveryToJob(task, now) {
  if (!task?.id || !task?.memberId) return null;
  return normalizeJob(
    {
      id: task.id,
      type: "recovery",
      roomId: "medbay",
      assignedCrewId: task.memberId,
      priority: task.priority ?? "normal",
      duration: task.duration,
      startedAt: task.startedAt,
      createdAt: task.startedAt,
      cost: task.cost,
      payload: {
        targetCrewId: task.memberId,
        fatigueRecovery: task.fatigueRecovery ?? JOB_ECONOMY.recovery.fatigueRecovery,
      },
      status: "in_progress",
    },
    now,
  );
}

export function migrateLegacyQueues(shipWorkQueue = [], recoveryQueue = [], now = null) {
  const jobs = [];
  const errors = [];
  shipWorkQueue.forEach((task) => {
    const job = shipWorkToJob(task, now);
    if (job) jobs.push(job);
    else errors.push({ source: "shipWorkQueue", id: task?.id ?? null, reason: "unsupported_task" });
  });
  recoveryQueue.forEach((task) => {
    const job = recoveryToJob(task, now);
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
    status: normalized.status,
    cost: normalized.cost,
    duration: normalized.duration,
    payload: normalized.payload,
    priority: normalized.priority,
    startedAt: normalized.startedAt ?? normalized.createdAt,
    completeAt: (normalized.startedAt ?? normalized.createdAt) + normalized.duration,
  };
}

export function jobToLegacyRecovery(job) {
  const normalized = normalizeJob(job);
  if (normalized.type !== "recovery") return null;
  return {
    id: normalized.id,
    memberId: normalized.payload?.targetCrewId,
    roomId: normalized.roomId,
    status: normalized.status,
    assignedCrewId: normalized.assignedCrewId,
    cost: normalized.cost,
    duration: normalized.duration,
    fatigueRecovery: normalized.payload?.fatigueRecovery ?? JOB_ECONOMY.recovery.fatigueRecovery,
    priority: normalized.priority,
    startedAt: normalized.startedAt ?? normalized.createdAt,
    completeAt: (normalized.startedAt ?? normalized.createdAt) + normalized.duration,
    progress: normalized.progress,
  };
}
