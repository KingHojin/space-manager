import { ROOM_TRAVEL_MINUTES } from "../data/constants";
import { items as itemCatalog } from "../data/items";
import { getRoomDef } from "../data/shipRooms";
import { scheduleJobs } from "./jobScheduler";
import { getJobDurationForCrew } from "./jobDuration";

const ITEM_NAMES = new Map(itemCatalog.map((item) => [item.id, item.name]));
const RESOURCE_NAMES = { credits: "크레딧", fuel: "연료", oxygen: "산소", hull: "선체" };
const NEED_NAMES = { stress: "스트레스", hunger: "배고픔", sleepDebt: "수면 부채" };
const CRISIS_NAMES = { hull_breach: "선체 누출", power_loss: "정전", fire: "화재", overheat: "과열", intruder: "침입" };
const ROLE_BY_CREW_ROLE = { 기관실: "engineer", 의무실: "medic" };
const PREVIEW_JOB_ID = "__incident-job-preview__";

function signed(value) {
  return value > 0 ? `+${value}` : `${value}`;
}

function appendCrewChanges(lines, scope, effect) {
  if (effect.fatigue) lines.push(`${scope} 피로 ${signed(effect.fatigue)}`);
  if (effect.morale) lines.push(`${scope} 사기 ${signed(effect.morale)}`);
  if (effect.injury) lines.push(`${scope} 부상 ${effect.injury}`);
  Object.entries(effect.needs ?? {}).forEach(([key, value]) => lines.push(`${scope} ${NEED_NAMES[key] ?? key} ${signed(value)}`));
}

export function summarizeIncidentEffect(effect, targetNames = []) {
  if (effect.type === "resources") return Object.entries(effect.delta ?? {}).map(([key, value]) => `${RESOURCE_NAMES[key] ?? key} ${signed(value)}`);
  if (effect.type === "items") return (effect.grants ?? []).map(({ itemId, qty }) => `${ITEM_NAMES.get(itemId) ?? itemId} +${qty}`);
  if (effect.type === "room") {
    const room = getRoomDef(effect.roomId)?.label ?? effect.roomId;
    return [effect.condition ? `${room} 상태 ${signed(effect.condition)}` : null, effect.load ? `${room} 부하 ${signed(effect.load)}` : null].filter(Boolean);
  }
  if (effect.type === "crisis") return [`${getRoomDef(effect.roomId)?.label ?? effect.roomId} ${CRISIS_NAMES[effect.crisisType] ?? effect.crisisType} 위기 ${effect.severity ?? 1}단계`];
  if (!["crewAll", "targetCrew", "targetPair"].includes(effect.type)) return [];

  const scope = effect.type === "crewAll" ? "전 승무원" : targetNames.length > 0 ? targetNames.join(" · ") : "대상 승무원";
  const lines = [];
  appendCrewChanges(lines, scope, effect);
  if (effect.affinity) lines.push(`${scope} 관계 ${signed(effect.affinity)}`);
  if (effect.firstMorale && targetNames[0]) lines.push(`${targetNames[0]} 사기 ${signed(effect.firstMorale)}`);
  if (effect.secondMorale && targetNames[1]) lines.push(`${targetNames[1]} 사기 ${signed(effect.secondMorale)}`);
  Object.entries(effect.firstNeeds ?? {}).forEach(([key, value]) => lines.push(`${targetNames[0] ?? "첫 대상"} ${NEED_NAMES[key] ?? key} ${signed(value)}`));
  Object.entries(effect.secondNeeds ?? {}).forEach(([key, value]) => lines.push(`${targetNames[1] ?? "둘째 대상"} ${NEED_NAMES[key] ?? key} ${signed(value)}`));
  return lines;
}

export function summarizeIncidentEffects(effects = [], targetNames = []) {
  return effects.flatMap((effect) => summarizeIncidentEffect(effect, targetNames));
}

export function formatIncidentClock(totalMinutes) {
  if (!Number.isFinite(totalMinutes)) return "--:--";
  const minuteOfDay = ((Math.floor(totalMinutes) % 1440) + 1440) % 1440;
  const hour = String(Math.floor(minuteOfDay / 60)).padStart(2, "0");
  const minute = String(minuteOfDay % 60).padStart(2, "0");
  return `${hour}:${minute}`;
}

export function formatIncidentDeadlineForecast(forecast, deadlineAtMinute) {
  const late = !forecast || !Number.isFinite(deadlineAtMinute) || forecast.completionAt > deadlineAtMinute;
  return {
    late,
    label: `완료 예상 ${formatIncidentClock(forecast?.completionAt)} / 마감 ${formatIncidentClock(deadlineAtMinute)} / ${late ? "늦음 위험" : "시한 내 예상"}`,
  };
}

function jobDuration(job, now) {
  const duration = Math.max(1, job.effectiveDuration ?? job.duration ?? 1);
  if (job.status === "in_progress" && !Number.isFinite(job.startedAt)) return Math.max(1, Math.ceil(duration * (1 - (job.progress ?? 0))));
  if (job.status === "in_progress") return Math.max(0, job.startedAt + duration - now);
  return duration;
}

function jobCompletionAt(job, now) {
  if (job.status !== "in_progress") return null;
  if (Number.isFinite(job.startedAt)) return job.startedAt + Math.max(1, job.effectiveDuration ?? job.duration ?? 1);
  return now + jobDuration(job, now);
}

function applyScheduleActions(jobs, actions, now, crew) {
  return jobs.map((job) => {
    const action = actions.find((entry) => entry.jobId === job.id);
    if (!action) return job;
    if (action.kind === "rollback") return { ...job, status: "backlog", assignedCrewId: null, arrivalAt: null, startedAt: null };
    if (action.kind === "assign") return { ...job, status: "assigned", assignedCrewId: action.crewId, arrivalAt: action.arrivalAt };
    if (action.kind === "start") {
      const assigned = { ...job, assignedCrewId: action.crewId };
      return { ...assigned, ...getJobDurationForCrew(assigned, crew), status: "in_progress", arrivalAt: null, startedAt: job.startedAt ?? now };
    }
    return job;
  });
}

/** Read-only scheduler forecast. It runs the production scheduler against cloned jobs. */
export function estimateIncidentJobTiming({ option, runtime, currentMinute, jobs = [], rooms = {}, crew = [], jobId = null } = {}) {
  const authoredJob = option?.job;
  let simulated = jobs.map((job) => ({ ...job, payload: { ...(job.payload ?? {}) } }));
  const targetId = jobId ?? PREVIEW_JOB_ID;
  if (!jobId) {
    if (!authoredJob) return null;
    simulated.push({
      id: PREVIEW_JOB_ID,
      type: "incident_response",
      roomId: authoredJob.roomId,
      status: "backlog",
      assignedCrewId: null,
      requiredRole: ROLE_BY_CREW_ROLE[authoredJob.requiredRole] ?? authoredJob.requiredRole ?? null,
      priority: runtime?.severity === "medium" ? "high" : "normal",
      progress: 0,
      duration: authoredJob.duration,
      effectiveDuration: authoredJob.duration,
      createdAt: currentMinute,
      payload: { incident: { preview: true } },
    });
  }

  let now = currentMinute;
  for (let pass = 0; pass < 500; pass += 1) {
    simulated = simulated.map((job) => {
      const completeAt = jobCompletionAt(job, now);
      return completeAt !== null && completeAt <= now ? { ...job, status: "done", progress: 1 } : job;
    });
    const targetBefore = simulated.find((job) => job.id === targetId);
    if (!targetBefore) return null;
    if (targetBefore.status === "done") {
      const startAt = targetBefore.startedAt ?? now;
      return { startAt, completionAt: startAt + Math.max(1, targetBefore.effectiveDuration ?? targetBefore.duration ?? 1), duration: targetBefore.duration };
    }
    if (targetBefore.status === "in_progress") {
      const startAt = targetBefore.startedAt ?? now;
      return { startAt, completionAt: startAt + Math.max(1, targetBefore.effectiveDuration ?? targetBefore.duration ?? 1), duration: targetBefore.duration };
    }
    if (targetBefore.status === "assigned") {
      const startAt = Math.max(now, targetBefore.arrivalAt ?? now + ROOM_TRAVEL_MINUTES);
      return { startAt, completionAt: startAt + Math.max(1, targetBefore.effectiveDuration ?? targetBefore.duration ?? 1), duration: targetBefore.duration };
    }
    if (targetBefore.status === "failed") return null;

    const { results } = scheduleJobs(simulated, rooms, crew, now);
    simulated = applyScheduleActions(simulated, results, now, crew);
    const targetAfter = simulated.find((job) => job.id === targetId);
    if (targetAfter?.status === "assigned") {
      const startAt = targetAfter.arrivalAt ?? now + ROOM_TRAVEL_MINUTES;
      return { startAt, completionAt: startAt + Math.max(1, targetAfter.effectiveDuration ?? targetAfter.duration ?? 1), duration: targetAfter.duration };
    }
    if (targetAfter?.status === "in_progress") {
      const startAt = targetAfter.startedAt ?? now;
      return { startAt, completionAt: startAt + Math.max(1, targetAfter.effectiveDuration ?? targetAfter.duration ?? 1), duration: targetAfter.duration };
    }

    const futureEvents = simulated.flatMap((job) => {
      if (job.status === "assigned" && Number.isFinite(job.arrivalAt) && job.arrivalAt > now) return [job.arrivalAt];
      const completeAt = jobCompletionAt(job, now);
      return completeAt !== null && completeAt > now ? [completeAt] : [];
    });
    if (futureEvents.length === 0) return null;
    now = Math.min(...futureEvents);
  }
  return null;
}
