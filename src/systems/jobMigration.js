import { JOB_DURATION, JOB_ECONOMY, JOB_LOAD_COST, JOB_PRIORITY, JOB_REQUIRED_ROLE, ROOM_CONFIG } from "../data/constants";

const SHIP_WORK_TYPE_MAP = {
  hullRepair: "hull_repair",
  salvageProcessing: "salvage",
};

const DEFAULT_ROOM_BY_TYPE = {
  recovery: "medbay",
  treatment: "medbay",
  hull_repair: "engineering",
  salvage: "cargo",
  module_upgrade: "engineering",
  training: "living",
  decode: "ops",
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
  if (job?.payload?.story && hasOwn(job, "requiredRole")) return job.requiredRole;
  if (type === "recovery" || type === "treatment" || type === "training") return null;
  return hasOwn(job, "requiredRole") ? job.requiredRole : JOB_REQUIRED_ROLE[type] ?? null;
}

function legacyStartedAt(task, type) {
  const duration = Math.max(1, numeric(task?.duration, JOB_DURATION[type] ?? 60));
  if (task?.startedAt !== undefined && task?.startedAt !== null) return numeric(task.startedAt, 0);
  if (task?.completeAt !== undefined && task?.completeAt !== null) return numeric(task.completeAt, duration) - duration;
  return numeric(task?.createdAt, 0);
}

function legacyDuration(task, type) {
  const startedAt = legacyStartedAt(task, type);
  if (task?.duration !== undefined && task?.duration !== null) return Math.max(1, numeric(task.duration, JOB_DURATION[type] ?? 60));
  if (task?.completeAt !== undefined && task?.completeAt !== null) return Math.max(1, numeric(task.completeAt, startedAt + (JOB_DURATION[type] ?? 60)) - startedAt);
  return Math.max(1, JOB_DURATION[type] ?? 60);
}

function legacyStatus(task) {
  if (task?.status) return task.status;
  return "in_progress";
}

const ACTIVE_JOB_STATUSES = new Set(["backlog", "assigned", "in_progress"]);

// Shared "still-live" filter for deriving legacy-shaped queue views from the
// unified jobStore.jobs list. Centralized here (rather than duplicated per
// consumer) so every UI/consumer surface agrees on what counts as active.
export function activeLegacyJobs(jobs = [], converter) {
  return jobs.filter((job) => ACTIVE_JOB_STATUSES.has(job.status)).map(converter).filter(Boolean);
}

export function normalizeRoomId(roomId, type = null) {
  const fallback = DEFAULT_ROOM_BY_TYPE[type] ?? "living";
  const normalized = ROOM_ALIASES[roomId] ?? roomId ?? fallback;
  return ROOM_CONFIG[normalized] ? normalized : fallback;
}

// Phase 18-E: priority-vocabulary boundary note.
//
// jobStore.jobs[].priority is stored as a NUMBER (JOB_PRIORITY: emergency=1,
// high=3, normal=5, low=7 — lower sorts first), not a string, and that
// numeric domain is jobStore's own vocabulary. It is NOT a fourth vocabulary
// in the sense of needing its own conversion table, though: JOB_PRIORITY's
// keys deliberately reuse systems/priorities.js's activity-priority strings
// verbatim, so the two functions below ARE the single, already-centralized
// boundary between "numeric job priority" and "activity priority" (this was
// unified in Phase 18-B). Every call site that needs to go from a job to a
// legacy-shaped/activity-facing priority routes through
// priorityToActivityPriority; every call site accepting a priority into a
// job (jobStore.setJobPriority, makeJob, etc.) routes through
// normalizeJobPriority. Do not add ad-hoc numeric<->string mappings
// elsewhere — extend these two functions instead.
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
  if (type === "treatment") return "의무실 치료";
  if (type === "hull_repair") return "선체 정비";
  if (type === "salvage") return "잔해 분해";
  if (type === "module_upgrade") return "모듈 작업";
  if (type === "training") return "역할 훈련";
  if (type === "decode") return "단서 해독";
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
  const effectiveDuration = job.effectiveDuration === undefined || job.effectiveDuration === null ? null : Math.max(1, numeric(job.effectiveDuration, duration));
  const progress = progressFromLegacyTime({ ...job, type, duration: effectiveDuration ?? duration, startedAt, createdAt }, now);
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
    effectiveDuration,
    moodWorkMultiplier: numeric(job.moodWorkMultiplier, 1),
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
  const startedAt = legacyStartedAt(task, type);
  return normalizeJob({ id: task.id, type, roomId: task.roomId ?? DEFAULT_ROOM_BY_TYPE[type], priority: task.priority ?? (type === "hull_repair" ? "high" : "normal"), duration: legacyDuration(task, type), startedAt, createdAt: startedAt, cost: task.cost, payload: task.payload ?? {}, status: legacyStatus(task) }, now);
}

function recoveryToJob(task, now) {
  if (!task?.id || !task?.memberId) return null;
  const type = "recovery";
  const startedAt = legacyStartedAt(task, type);
  return normalizeJob({ id: task.id, type, roomId: "medbay", assignedCrewId: task.memberId, priority: task.priority ?? "normal", duration: legacyDuration(task, type), startedAt, createdAt: startedAt, cost: task.cost, payload: { targetCrewId: task.memberId, fatigueRecovery: task.fatigueRecovery ?? JOB_ECONOMY.recovery.fatigueRecovery }, status: legacyStatus(task) }, now);
}

function trainingToJob(task, now) {
  if (!task?.id || !task?.memberId || !task?.statKey) return null;
  const type = "training";
  const startedAt = legacyStartedAt(task, type);
  return normalizeJob({ id: task.id, type, roomId: "living", assignedCrewId: task.memberId, priority: task.priority ?? "normal", duration: legacyDuration(task, type), startedAt, createdAt: startedAt, cost: task.cost, payload: { targetCrewId: task.memberId, statKey: task.statKey }, status: legacyStatus(task) }, now);
}

function treatmentToJob(task, now) {
  if (!task?.id || !task?.memberId) return null;
  const type = "treatment";
  const startedAt = legacyStartedAt(task, type);
  return normalizeJob({ id: task.id, type, roomId: "medbay", assignedCrewId: task.memberId, priority: task.priority ?? "high", duration: legacyDuration(task, type), startedAt, createdAt: startedAt, cost: task.cost, payload: { targetCrewId: task.memberId, injury: task.injury, fatiguePenalty: task.fatiguePenalty }, status: legacyStatus(task) }, now);
}

export function migrateLegacyQueues(shipWorkQueue = [], recoveryQueue = [], trainingQueue = [], treatmentQueue = [], now = null) {
  if (!Array.isArray(trainingQueue)) {
    now = trainingQueue;
    trainingQueue = [];
    treatmentQueue = [];
  }

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
  trainingQueue.forEach((task) => {
    const job = trainingToJob(task, now);
    if (job) jobs.push(job);
    else errors.push({ source: "trainingQueue", id: task?.id ?? null, reason: "invalid_task" });
  });
  treatmentQueue.forEach((task) => {
    const job = treatmentToJob(task, now);
    if (job) jobs.push(job);
    else errors.push({ source: "treatmentQueue", id: task?.id ?? null, reason: "invalid_task" });
  });
  return { jobs, errors };
}

export function jobToLegacyShipWork(job) {
  const normalized = normalizeJob(job);
  if (normalized.type !== "hull_repair" && normalized.type !== "salvage") return null;
  const duration = normalized.effectiveDuration ?? normalized.duration;
  return { id: normalized.id, type: normalized.type === "hull_repair" ? "hullRepair" : "salvageProcessing", roomId: normalized.roomId, status: normalized.status, cost: normalized.cost, duration: normalized.duration, effectiveDuration: normalized.effectiveDuration, payload: normalized.payload, priority: priorityToActivityPriority(normalized.priority), startedAt: normalized.startedAt ?? normalized.createdAt, completeAt: (normalized.startedAt ?? normalized.createdAt) + duration };
}

export function jobToLegacyModuleWork(job) {
  const normalized = normalizeJob(job);
  if (normalized.type !== "module_upgrade") return null;
  return {
    id: normalized.id,
    type: normalized.payload?.action ?? "upgrade",
    slot: normalized.payload?.slot,
    moduleId: normalized.payload?.moduleId,
    roomId: normalized.roomId,
    status: normalized.status,
    cost: normalized.cost,
    duration: normalized.duration,
    payload: normalized.payload,
    priority: priorityToActivityPriority(normalized.priority),
    startedAt: normalized.startedAt ?? normalized.createdAt,
    completeAt: (normalized.startedAt ?? normalized.createdAt) + normalized.duration,
    progress: normalized.progress,
  };
}

export function jobToLegacyRecovery(job) {
  const normalized = normalizeJob(job);
  if (normalized.type !== "recovery") return null;
  return { id: normalized.id, memberId: normalized.payload?.targetCrewId, roomId: normalized.roomId, status: normalized.status, assignedCrewId: normalized.assignedCrewId, cost: normalized.cost, duration: normalized.duration, fatigueRecovery: normalized.payload?.fatigueRecovery ?? JOB_ECONOMY.recovery.fatigueRecovery, priority: priorityToActivityPriority(normalized.priority), startedAt: normalized.startedAt ?? normalized.createdAt, completeAt: (normalized.startedAt ?? normalized.createdAt) + normalized.duration, progress: normalized.progress };
}

export function jobToLegacyTraining(job) {
  const normalized = normalizeJob(job);
  if (normalized.type !== "training") return null;
  return { id: normalized.id, memberId: normalized.payload?.targetCrewId, statKey: normalized.payload?.statKey, roomId: normalized.roomId, status: normalized.status, assignedCrewId: normalized.assignedCrewId, cost: normalized.cost, duration: normalized.duration, priority: priorityToActivityPriority(normalized.priority), startedAt: normalized.startedAt ?? normalized.createdAt, completeAt: (normalized.startedAt ?? normalized.createdAt) + normalized.duration, progress: normalized.progress };
}

export function jobToLegacyTreatment(job) {
  const normalized = normalizeJob(job);
  if (normalized.type !== "treatment") return null;
  return { id: normalized.id, memberId: normalized.payload?.targetCrewId, injury: normalized.payload?.injury, roomId: normalized.roomId, status: normalized.status, assignedCrewId: normalized.assignedCrewId, cost: normalized.cost, duration: normalized.duration, fatiguePenalty: normalized.payload?.fatiguePenalty, priority: priorityToActivityPriority(normalized.priority), startedAt: normalized.startedAt ?? normalized.createdAt, completeAt: (normalized.startedAt ?? normalized.createdAt) + normalized.duration, progress: normalized.progress };
}
