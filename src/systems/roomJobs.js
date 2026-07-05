import { ROOM_IDS } from "../data/shipRooms";
import { calculateRoomModifiers } from "../data/roomModules";
import { canWorkWithInjury, injuryWorkSpeedMultiplier } from "./injurySystem";

export const ROOM_CONDITION_DECAY_PER_HOUR = 0.5;
export const ROOM_LOAD_GROWTH_PER_HOUR = 0.8;

const ROLE_ROOM = { 함교: "bridge", 포탑: "ops", 기관실: "engineering", 의무실: "medbay" };
const SUPPORT_ROOMS = new Set(["cargo", "living"]);

export const ROOM_JOB_CATALOG = {
  bridge: { id: "bridge-route-analysis", roomId: "bridge", label: "항로 정밀 분석", durationMinutes: 90, conditionRestore: 20, loadRelief: 20 },
  ops: { id: "ops-threat-scan", roomId: "ops", label: "위협 스캔", durationMinutes: 60, conditionRestore: 20, loadRelief: 20 },
  medbay: { id: "medbay-support-care", roomId: "medbay", label: "예방 진료 보조", durationMinutes: 75, conditionRestore: 20, loadRelief: 25 },
  engineering: { id: "engineering-tuning", roomId: "engineering", label: "엔진 튜닝", durationMinutes: 100, conditionRestore: 25, loadRelief: 15 },
  cargo: { id: "cargo-sorting", roomId: "cargo", label: "화물 정리", durationMinutes: 70, conditionRestore: 10, loadRelief: 25 },
  living: { id: "living-rest-cycle", roomId: "living", label: "생활구역 정비", durationMinutes: 80, conditionRestore: 10, loadRelief: 20 },
};

export function getRoomJob(roomId) {
  return ROOM_JOB_CATALOG[roomId] ?? null;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeAssignedIds(room) {
  if (Array.isArray(room.assignedMemberIds)) return room.assignedMemberIds.filter(Boolean);
  return room.assignedMemberId ? [room.assignedMemberId] : [];
}

function primaryAssignedId(ids) {
  return ids[0] ?? null;
}

function claimsForRoom(roomActivities, roomId, jobId) {
  const direct = roomActivities[roomId];
  if (Array.isArray(direct)) return direct;
  if (direct?.memberId) return [direct];
  return Object.values(roomActivities).flatMap((entry) => Array.isArray(entry) ? entry : entry ? [entry] : []).filter((activity) => activity.roomId === roomId || activity.jobId === jobId);
}

export function createInitialRoomState() {
  return Object.fromEntries(
    ROOM_IDS.map((id) => [
      id,
      { id, condition: 82, load: 18, jobId: null, assignedMemberId: null, assignedMemberIds: [], progress: 0, activeCrisisId: null, status: "안정", tier: 1, modules: [] },
    ]),
  );
}

export function deriveRoomStatus(room) {
  if (room.activeCrisisId) return "위기";
  if (room.jobId) return "작업 중";
  if (room.condition < 35 || room.load > 75) return "위험";
  if (room.condition < 70 || room.load > 40) return "점검 필요";
  return "안정";
}

export function getRoomSlots(room) {
  return Math.max(1, Math.round(calculateRoomModifiers(room).slots ?? 1));
}

function roomNeedScore(room) {
  const conditionNeed = Math.max(0, 100 - (room.condition ?? 100));
  const loadNeed = Math.max(0, room.load ?? 0);
  let score = conditionNeed * 0.3 + loadNeed * 0.3;
  if ((room.condition ?? 100) < 70 || (room.load ?? 0) > 40) score += 18;
  if ((room.condition ?? 100) < 35 || (room.load ?? 0) > 75) score += 28;
  return score;
}

export function scoreJobForMember(member, room, job, context = {}) {
  if (!job || !member?.alive) return null;
  if (!canWorkWithInjury(member.injury)) return null;
  if (room.activeCrisisId) return null;
  const assignedIds = normalizeAssignedIds(room);
  if (assignedIds.length >= getRoomSlots(room) && !assignedIds.includes(member.id)) return null;
  const roleMatch = ROLE_ROOM[member.role] === room.id;
  const supportRoom = SUPPORT_ROOMS.has(room.id);
  let score = roleMatch ? 40 : supportRoom ? 22 : 10;
  score += roomNeedScore(room);
  score -= (member.fatigue ?? 0) * 0.2;
  if (assignedIds.includes(member.id)) score += 15;
  if (context.activeTravel && ["bridge", "engineering"].includes(room.id)) score += 10;
  if (supportRoom && ((room.condition ?? 100) < 70 || (room.load ?? 0) > 40)) score += 14;
  score *= injuryWorkSpeedMultiplier(member.injury);
  score *= calculateRoomModifiers(room).jobSpeedMul;
  return score;
}

export function pickRoomJobsForIdleCrew({ idleMembers, rooms, currentMinute, context = {} }) {
  const claimedByRoom = new Map();
  const assignments = new Map();
  idleMembers.forEach((member) => {
    let bestRoomId = null;
    let bestScore = -Infinity;
    ROOM_IDS.forEach((roomId) => {
      const room = rooms[roomId];
      if (!room || room.activeCrisisId) return;
      const alreadyClaimed = claimedByRoom.get(roomId) ?? 0;
      const assignedIds = normalizeAssignedIds(room);
      const slots = getRoomSlots(room);
      if (assignedIds.length + alreadyClaimed >= slots && !assignedIds.includes(member.id)) return;
      const job = getRoomJob(roomId);
      const score = scoreJobForMember(member, room, job, context);
      if (score === null) return;
      if (score > bestScore) {
        bestScore = score;
        bestRoomId = roomId;
      }
    });
    if (bestRoomId) {
      claimedByRoom.set(bestRoomId, (claimedByRoom.get(bestRoomId) ?? 0) + 1);
      const job = getRoomJob(bestRoomId);
      assignments.set(member.id, { roomId: bestRoomId, jobId: job.id, station: bestRoomId, action: job.label, updatedAt: currentMinute });
    }
  });
  return assignments;
}

function jobCompletionEffect(job) {
  if (job.roomId === "medbay") return { crewFatigueAll: -3 };
  if (job.roomId === "living") return { crewFatigueAll: -2 };
  if (job.roomId === "engineering") return { hullDelta: 2 };
  return {};
}

export function applyRoomTick({ rooms, roomActivities = {}, deltaMinutes = 0, currentMinute = 0, roleCoverage = null }) {
  const hours = deltaMinutes / 60;
  const nextRooms = {};
  const completedJobs = [];
  const logs = [];
  const missingRoles = new Set(roleCoverage?.missingRoles ?? []);
  ROOM_IDS.forEach((roomId) => {
    const room = rooms[roomId] ?? createInitialRoomState()[roomId];
    const job = getRoomJob(roomId);
    const claims = claimsForRoom(roomActivities, roomId, job?.id);
    const modifiers = calculateRoomModifiers(room);
    let condition = room.condition;
    let load = room.load;
    let progress = room.progress;
    let jobId = room.jobId;
    let assignedMemberIds = normalizeAssignedIds(room);
    const activeCrisisId = room.activeCrisisId ?? null;
    const engineerMissingPenalty = missingRoles.has("기관실") && roomId === "engineering" ? 2.3 : 1;
    const medicMissingPenalty = missingRoles.has("의무실") && roomId === "medbay" ? 1.4 : 1;
    const rolePenalty = Math.max(engineerMissingPenalty, medicMissingPenalty);
    const decayMultiplier = rolePenalty * modifiers.conditionDecayMul;
    const loadGrowthMultiplier = rolePenalty / Math.max(0.4, modifiers.loadCapacityMul);
    if (activeCrisisId) {
      jobId = null;
      assignedMemberIds = [];
      progress = 0;
      condition = clamp(condition - ROOM_CONDITION_DECAY_PER_HOUR * hours * decayMultiplier, 0, 100);
      load = clamp(load + ROOM_LOAD_GROWTH_PER_HOUR * hours * 1.35 * loadGrowthMultiplier, 0, 100);
    } else if (claims.length > 0 && job) {
      const slots = getRoomSlots(room);
      assignedMemberIds = Array.from(new Set(claims.map((claim) => claim.memberId).filter(Boolean))).slice(0, slots);
      jobId = job.id;
      const speed = claims.slice(0, slots).reduce((sum, claim) => sum + (claim.speedMultiplier ?? 1), 0);
      progress = clamp(progress + (deltaMinutes / job.durationMinutes) * 100 * Math.max(0.5, speed) * modifiers.jobSpeedMul, 0, 100);
      if (progress >= 100) {
        condition = clamp(condition + job.conditionRestore, 0, 100);
        load = clamp(load - job.loadRelief * modifiers.loadCapacityMul, 0, 100);
        progress = 0;
        const effect = jobCompletionEffect(job);
        completedJobs.push({ roomId, jobId, memberId: primaryAssignedId(assignedMemberIds), memberIds: assignedMemberIds, effect });
        logs.push(`${job.label} 완료 (${roomId}) · ${assignedMemberIds.length}명 작업.`);
        jobId = null;
        assignedMemberIds = [];
      }
    } else {
      jobId = null;
      assignedMemberIds = [];
      progress = 0;
      condition = clamp(condition - ROOM_CONDITION_DECAY_PER_HOUR * hours * decayMultiplier, 0, 100);
      load = clamp(load + ROOM_LOAD_GROWTH_PER_HOUR * hours * loadGrowthMultiplier, 0, 100);
    }
    const draftRoom = { ...room, id: roomId, condition, load, jobId, assignedMemberId: primaryAssignedId(assignedMemberIds), assignedMemberIds, progress, activeCrisisId };
    nextRooms[roomId] = { ...draftRoom, status: deriveRoomStatus(draftRoom), updatedAt: currentMinute };
  });
  return { nextRooms, completedJobs, logs };
}
