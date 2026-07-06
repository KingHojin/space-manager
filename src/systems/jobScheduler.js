import { ROOM_TRAVEL_MINUTES } from "../data/constants";
import { canWorkWithInjury } from "./injurySystem";
import { normalizeJobPriority } from "./jobMigration";

const ROLE_BY_CREW_ROLE = {
  기관실: "engineer",
  의무실: "medic",
};

const TARGETED_CREW_JOB_TYPES = new Set(["recovery", "training", "treatment"]);

function isCrewUsable(member) {
  if (!member?.alive) return false;
  if (!canWorkWithInjury(member.injury)) return false;
  if ((member.fatigue ?? 0) >= 85) return false;
  return true;
}

function canReserveTargetForJob(job, member) {
  if (!member?.alive) return false;
  if (job.type === "treatment") return true;
  return isCrewUsable(member);
}

function matchesRole(member, requiredRole) {
  if (!requiredRole) return true;
  return ROLE_BY_CREW_ROLE[member.role] === requiredRole;
}

function usedSlotIdsForRoom(jobs, roomId) {
  return jobs.filter((job) => job.roomId === roomId && ["assigned", "in_progress"].includes(job.status)).map((job) => job.id);
}

function hasSlot(room, usedIds) {
  const capacity = Math.max(0, room?.slotCapacity ?? 0);
  return capacity > usedIds.length;
}

function backlogSort(a, b) {
  const priorityDelta = normalizeJobPriority(a.priority) - normalizeJobPriority(b.priority);
  if (priorityDelta !== 0) return priorityDelta;
  return (a.createdAt ?? 0) - (b.createdAt ?? 0);
}

function assignedCrewIds(jobs) {
  const ids = new Set();
  jobs.forEach((job) => {
    if (!["assigned", "in_progress"].includes(job.status)) return;
    if (job.assignedCrewId) ids.add(job.assignedCrewId);
    if (TARGETED_CREW_JOB_TYPES.has(job.type) && job.payload?.targetCrewId) ids.add(job.payload.targetCrewId);
  });
  return ids;
}

function findCandidateForJob(job, crew, reservedCrewIds) {
  const targetCrewId = job.payload?.targetCrewId;

  if (targetCrewId) {
    const target = crew.find((member) => member.id === targetCrewId);
    if (!canReserveTargetForJob(job, target)) return null;
    if (!matchesRole(target, job.requiredRole)) return null;
    if (reservedCrewIds.has(target.id)) return null;
    return target;
  }

  return crew.find((member) => isCrewUsable(member) && matchesRole(member, job.requiredRole) && !reservedCrewIds.has(member.id)) ?? null;
}

export function scheduleJobs(jobs = [], rooms = {}, crew = [], now = 0) {
  const results = [];
  const warnings = [];
  const reservedCrewIds = assignedCrewIds(jobs);
  const usedByRoom = new Map(Object.keys(rooms).map((roomId) => [roomId, usedSlotIdsForRoom(jobs, roomId)]));

  jobs.filter((job) => job.status === "assigned").forEach((job) => {
    const reservedCrewId = TARGETED_CREW_JOB_TYPES.has(job.type) ? job.payload?.targetCrewId ?? job.assignedCrewId : job.assignedCrewId;
    const member = crew.find((entry) => entry.id === reservedCrewId);
    if (reservedCrewId && !canReserveTargetForJob(job, member)) {
      results.push({ kind: "rollback", jobId: job.id, reason: "crew_unavailable" });
      reservedCrewIds.delete(reservedCrewId);
      const used = usedByRoom.get(job.roomId) ?? [];
      usedByRoom.set(job.roomId, used.filter((id) => id !== job.id));
      return;
    }
    if ((job.arrivalAt ?? Infinity) <= now) results.push({ kind: "start", jobId: job.id, crewId: job.assignedCrewId });
  });

  jobs.filter((job) => job.status === "backlog").sort(backlogSort).forEach((job) => {
    const room = rooms[job.roomId];
    if (!room) {
      warnings.push({ jobId: job.id, roomId: job.roomId, reason: "missing_room" });
      return;
    }
    const usedIds = usedByRoom.get(job.roomId) ?? [];
    if (!hasSlot(room, usedIds)) return;
    const candidate = findCandidateForJob(job, crew, reservedCrewIds);
    if (!candidate) return;
    reservedCrewIds.add(candidate.id);
    usedByRoom.set(job.roomId, [...usedIds, job.id]);
    results.push({ kind: "assign", jobId: job.id, crewId: candidate.id, arrivalAt: now + ROOM_TRAVEL_MINUTES });
  });

  return { results, warnings };
}

export function explainBacklogReason(job, jobs = [], rooms = {}, crew = []) {
  if (!job || job.status !== "backlog") return null;
  const room = rooms[job.roomId];
  if (!room) return "방 없음";
  const usedIds = usedSlotIdsForRoom(jobs, job.roomId);
  if (!hasSlot(room, usedIds)) return "슬롯 대기";
  const hasCrew = Boolean(findCandidateForJob(job, crew, assignedCrewIds(jobs)));
  if (!hasCrew) return "크루 대기";
  return "배정 대기";
}
