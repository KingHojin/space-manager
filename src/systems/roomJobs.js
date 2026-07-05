import { ROOM_IDS } from "../data/shipRooms";

export const ROOM_CONDITION_DECAY_PER_HOUR = 0.5;
export const ROOM_LOAD_GROWTH_PER_HOUR = 0.8;

const ROLE_ROOM = { 함교: "bridge", 포탑: "ops", 기관실: "engineering", 의무실: "medbay" };

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

export function createInitialRoomState() {
  return Object.fromEntries(
    ROOM_IDS.map((id) => [
      id,
      { id, condition: 82, load: 18, jobId: null, assignedMemberId: null, progress: 0, activeCrisisId: null, status: "안정" },
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

/**
 * Scores how well-suited a member is to pick up the given room's job this tick.
 * Returns null when the member cannot take the job at all.
 */
export function scoreJobForMember(member, room, job, context = {}) {
  if (!job || !member?.alive) return null;
  if (member.injury && member.injury !== "정상") return null;
  if (room.activeCrisisId) return null;

  const roleMatch = ROLE_ROOM[member.role] === room.id;
  let score = roleMatch ? 40 : 10;

  score += (100 - room.condition) * 0.3;
  score += room.load * 0.3;
  score -= (member.fatigue ?? 0) * 0.2;

  if (room.assignedMemberId === member.id) score += 15;
  if (context.activeTravel && ["bridge", "engineering"].includes(room.id)) score += 10;

  return score;
}

/**
 * Picks the best available room job for each idle member, honoring one active
 * assignment per room within this tick. Members are processed in array order;
 * earlier claims block later members from taking the same room.
 */
export function pickRoomJobsForIdleCrew({ idleMembers, rooms, currentMinute, context = {} }) {
  const claimedRoomIds = new Set();
  const assignments = new Map();

  idleMembers.forEach((member) => {
    let bestRoomId = null;
    let bestScore = -Infinity;

    ROOM_IDS.forEach((roomId) => {
      if (claimedRoomIds.has(roomId)) return;
      const room = rooms[roomId];
      if (!room) return;
      if (room.activeCrisisId) return;
      if (room.assignedMemberId && room.assignedMemberId !== member.id) return;

      const job = getRoomJob(roomId);
      const score = scoreJobForMember(member, room, job, context);
      if (score === null) return;
      if (score > bestScore) {
        bestScore = score;
        bestRoomId = roomId;
      }
    });

    if (bestRoomId) {
      claimedRoomIds.add(bestRoomId);
      const job = getRoomJob(bestRoomId);
      const room = rooms[bestRoomId];
      assignments.set(member.id, {
        roomId: bestRoomId,
        jobId: job.id,
        station: room ? `${room.id}` : bestRoomId,
        action: job.label,
        updatedAt: currentMinute,
      });
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

/**
 * Advances room progress/condition/load for one clock tick. Pure — the caller
 * is responsible for applying `nextRooms` and any resource/crew side effects
 * described in `completedJobs` to the relevant stores.
 *
 * `roomActivities` maps roomId -> { memberId, jobId } for members who claimed
 * (or continue to hold) that room's job this tick, as decided by crew AI.
 */
export function applyRoomTick({ rooms, roomActivities = {}, deltaMinutes = 0, currentMinute = 0 }) {
  const hours = deltaMinutes / 60;
  const nextRooms = {};
  const completedJobs = [];
  const logs = [];

  ROOM_IDS.forEach((roomId) => {
    const room = rooms[roomId] ?? createInitialRoomState()[roomId];
    const claim = roomActivities[roomId];
    const job = getRoomJob(roomId);

    let condition = room.condition;
    let load = room.load;
    let progress = room.progress;
    let jobId = room.jobId;
    let assignedMemberId = room.assignedMemberId;
    const activeCrisisId = room.activeCrisisId ?? null;

    if (activeCrisisId) {
      jobId = null;
      assignedMemberId = null;
      progress = 0;
      condition = clamp(condition - ROOM_CONDITION_DECAY_PER_HOUR * hours, 0, 100);
      load = clamp(load + ROOM_LOAD_GROWTH_PER_HOUR * hours * 1.35, 0, 100);
    } else if (claim && job) {
      assignedMemberId = claim.memberId;
      jobId = job.id;
      progress = clamp(progress + (deltaMinutes / job.durationMinutes) * 100, 0, 100);

      if (progress >= 100) {
        condition = clamp(condition + job.conditionRestore, 0, 100);
        load = clamp(load - job.loadRelief, 0, 100);
        progress = 0;
        const effect = jobCompletionEffect(job);
        completedJobs.push({ roomId, jobId, memberId: assignedMemberId, effect });
        logs.push(`${job.label} 완료 (${roomId}).`);
        jobId = null;
        assignedMemberId = null;
      }
    } else {
      jobId = null;
      assignedMemberId = null;
      progress = 0;
      condition = clamp(condition - ROOM_CONDITION_DECAY_PER_HOUR * hours, 0, 100);
      load = clamp(load + ROOM_LOAD_GROWTH_PER_HOUR * hours, 0, 100);
    }

    const draftRoom = { id: roomId, condition, load, jobId, assignedMemberId, progress, activeCrisisId };
    nextRooms[roomId] = { ...draftRoom, status: deriveRoomStatus(draftRoom), updatedAt: currentMinute };
  });

  return { nextRooms, completedJobs, logs };
}
