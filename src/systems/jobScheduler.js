import { ROOM_TRAVEL_MINUTES } from "../data/constants";
import { canWorkWithInjury } from "./injurySystem";
import { normalizeJobPriority } from "./jobMigration";

const ROLE_BY_CREW_ROLE = {
  기관실: "engineer",
  의무실: "medic",
};

function isCrewUsable(member) {
  if (!member?.alive) return false;
  if (!canWorkWithInjury(member.injury)) return false;
  if ((member.fatigue ?? 0) >= 85) return false;
  return true;
}

function matchesRole(member, requiredRole) {
  if (!requiredRole) return true;
  return ROLE_BY_CREW_ROLE[member.role] === requiredRole;
}

function activeJobIdsForRoom(jobs, roomId) {
  return jobs.filter((job) => job.roomId === roomId && job.status === "in_progress").map((job) => job.id);
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
  return new Set(jobs.filter((job) => ["assigned", "in_progress"].includes(job.status) && job.assignedCrewId).map((job) => job.assignedCrewId));
}

export function scheduleJobs(jobs = [], rooms = {}, crew = [], now = 0) {
  const results = [];
  const warnings = [];
  const reservedCrewIds = assignedCrewIds(jobs);
  const usedByRoom = new Map(Object.keys(rooms).map((roomId) => [roomId, usedSlotIdsForRoom(jobs, roomId)]));

  jobs.filter((job) => job.status === "assigned").forEach((job) => {
    const member = crew.find((entry) => entry.id === job.assignedCrewId);
    if (job.assignedCrewId && !isCrewUsable(member)) {
      results.push({ kind: "rollback", jobId: job.id, reason: "crew_unavailable" });
      reservedCrewIds.delete(job.assignedCrewId);
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
    const candidate = crew.find((member) => isCrewUsable(member) && matchesRole(member, job.requiredRole) && !reservedCrewIds.has(member.id));
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
  const hasCrew = crew.some((member) => isCrewUsable(member) && matchesRole(member, job.requiredRole));
  if (!hasCrew) return "크루 대기";
  return "배정 대기";
}
