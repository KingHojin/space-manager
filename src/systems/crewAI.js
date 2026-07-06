import { ROOMS } from "../data/shipRooms";
import { getCrisisConfig, getCrisisLabel, scoreCrisisForMember } from "./crisisSystem";
import { canWorkWithInjury, chooseTreatmentTarget, injuryLabel, injuryPriority, injuryWorkSpeedMultiplier, isHealthy, isSeriousOrWorse } from "./injurySystem";
import { comparePriorityTasks, getPriorityConfig, normalizePriority } from "./priorities";
import { pickRoomJobsForIdleCrew } from "./roomJobs";

const ROOM_LABELS = Object.fromEntries(ROOMS.map((room) => [room.id, room.label]));

export const CREW_AI_INTERVAL = 12;

const ROLE_DEFAULTS = {
  함교: { station: "브릿지", action: "항로 데이터 갱신", intent: "navigation" },
  기관실: { station: "기관실", action: "엔진 출력 점검", intent: "engineering" },
  포탑: { station: "포탑 관제", action: "표적 추적 시뮬레이션", intent: "combat" },
  의무실: { station: "의무실", action: "응급 키트 정리", intent: "medical" },
};

const IDLE_ACTIONS = ["식사", "휴식", "생활구역 정리", "함내 순찰", "동료와 대화", "개인 장비 점검"];

const MODULE_SLOT_WORK_ROOM = {
  engine: { roomId: "engineering", station: "기관실", action: "추진계 작업" },
  shield: { roomId: "engineering", station: "기관실", action: "방어막 계통 작업" },
  cargo: { roomId: "cargo", station: "창고", action: "화물 모듈 작업" },
  special: { roomId: "ops", station: "관제실", action: "특수 장비 작업" },
  "weapon-a": { roomId: "ops", station: "포탑 관제", action: "무장 슬롯 A 작업" },
  "weapon-b": { roomId: "ops", station: "포탑 관제", action: "무장 슬롯 B 작업" },
};

function stableIndex(seed, offset, length) {
  const value = Math.abs(Math.sin(seed * 12.9898 + offset * 78.233) * 43758.5453);
  return Math.floor(value) % length;
}

function idleAction(member, currentMinute, index) {
  const bucket = Math.floor(currentMinute / CREW_AI_INTERVAL);
  const defaultJob = ROLE_DEFAULTS[member.role] ?? { station: "생활구역", action: "대기", intent: "idle" };
  const action = IDLE_ACTIONS[stableIndex(bucket, index + member.id.length, IDLE_ACTIONS.length)];
  return {
    memberId: member.id,
    station: action === "휴식" || action === "식사" ? "생활구역" : defaultJob.station,
    action: action === "개인 장비 점검" ? `${action}` : action,
    intent: "idle",
    priority: "low",
    detail: "자동 생활 행동",
    updatedAt: currentMinute,
  };
}

function assignedQueueTask(member, queues) {
  const tasks = [
    ...(queues.treatmentQueue ?? []).filter((task) => task.memberId === member.id).map((task) => ({ ...task, queueType: "treatment" })),
    ...(queues.recoveryQueue ?? []).filter((task) => task.memberId === member.id).map((task) => ({ ...task, queueType: "recovery" })),
    ...(queues.trainingQueue ?? []).filter((task) => task.memberId === member.id).map((task) => ({ ...task, queueType: "training" })),
  ].sort(comparePriorityTasks);
  return tasks[0] ?? null;
}

function queueActivity(member, queueTask, currentMinute) {
  if (queueTask?.queueType === "treatment") {
    const priority = normalizePriority(queueTask.priority ?? "high");
    return { memberId: member.id, station: "의무실", action: `${queueTask.injury ?? injuryLabel(member.injury)} 치료 중`, intent: "medical", priority, detail: `완료 대기 · ${getPriorityConfig(priority).label}`, roomId: "medbay", taskId: queueTask.id, updatedAt: currentMinute };
  }
  if (queueTask?.queueType === "recovery") {
    const priority = normalizePriority(queueTask.priority ?? "normal");
    return { memberId: member.id, station: "의무실 회복실", action: "회복 절차 중", intent: "rest", priority, detail: `완료 대기 · ${getPriorityConfig(priority).label}`, roomId: "medbay", taskId: queueTask.id, updatedAt: currentMinute };
  }
  if (queueTask?.queueType === "training") {
    const priority = normalizePriority(queueTask.priority ?? "normal");
    return { memberId: member.id, station: "훈련실", action: "역할 훈련 중", intent: "training", priority, detail: `완료 대기 · ${getPriorityConfig(priority).label}`, taskId: queueTask.id, updatedAt: currentMinute };
  }
  return null;
}

function moduleNameForTask(task, snapshot) {
  return (snapshot.modules ?? []).find((module) => module.id === task.moduleId)?.name ?? task.moduleId ?? "모듈";
}

function slotForModuleTask(task, snapshot) {
  if (task.slot) return task.slot;
  return (snapshot.modules ?? []).find((module) => module.id === task.moduleId)?.slot ?? "engine";
}

function pickInstallationWork(member, snapshot, claimedTaskIds) {
  if (member.role !== "기관실" || !canWorkWithInjury(member.injury)) return null;
  const task = (snapshot.installationQueue ?? [])
    .filter((entry) => entry?.id && !claimedTaskIds.has(entry.id))
    .sort(comparePriorityTasks)[0];
  if (!task) return null;
  claimedTaskIds.add(task.id);
  const slot = slotForModuleTask(task, snapshot);
  const room = MODULE_SLOT_WORK_ROOM[slot] ?? MODULE_SLOT_WORK_ROOM.engine;
  const priority = normalizePriority(task.priority ?? (task.type === "equip" ? "high" : "normal"));
  const moduleName = moduleNameForTask(task, snapshot);
  const action = task.type === "upgrade" ? `${moduleName} 개선 절차` : `${moduleName} 장착 절차`;
  return {
    memberId: member.id,
    station: room.station,
    action,
    intent: "engineering",
    priority,
    detail: `${room.action} · 완료 대기 ${getPriorityConfig(priority).label}`,
    roomId: room.roomId,
    taskId: task.id,
    moduleId: task.moduleId,
    updatedAt: snapshot.currentMinute ?? 0,
  };
}

function pickCrisisAssignment(member, snapshot, claimedCrisisIds) {
  const activeCrises = snapshot.activeCrises ?? [];
  let bestCrisis = null;
  let bestScore = -Infinity;

  activeCrises.forEach((crisis) => {
    if (claimedCrisisIds.has(crisis.id)) return;
    const score = scoreCrisisForMember(member, crisis);
    if (score === null) return;
    if (score > bestScore) {
      bestScore = score;
      bestCrisis = crisis;
    }
  });

  if (!bestCrisis) return null;
  claimedCrisisIds.add(bestCrisis.id);
  const config = getCrisisConfig(bestCrisis.type);
  const roomLabel = ROOM_LABELS[bestCrisis.roomId] ?? bestCrisis.roomId;
  return {
    station: roomLabel,
    action: config.responderAction,
    intent: "crisis-response",
    priority: "emergency",
    detail: `${getCrisisLabel(bestCrisis)} · severity ${bestCrisis.severity}`,
    crisisId: bestCrisis.id,
    roomId: bestCrisis.roomId,
  };
}

function pickMedicalCare(member, crew) {
  if (member.role !== "의무실" || !canWorkWithInjury(member.injury)) return null;
  const target = chooseTreatmentTarget(crew);
  if (!target || target.id === member.id || !isSeriousOrWorse(target.injury)) return null;
  return {
    station: "의무실",
    action: `${target.name} 집중 치료`,
    intent: "medical-care",
    priority: "emergency",
    detail: `${injuryLabel(target.injury)} · 회복 보조`,
    targetMemberId: target.id,
  };
}

function roleCrisisAssignment(member, snapshot) {
  const role = member.role;
  if (snapshot.pendingCombatEncounter) {
    if (role === "포탑") return { station: "포탑 관제", action: "긴급 표적 추적", intent: "combat", priority: "emergency", detail: "교전 대응" };
    if (role === "함교") return { station: "브릿지", action: "교전 지휘 보조", intent: "combat", priority: "emergency", detail: "교전 대응" };
    if (role === "기관실") return { station: "기관실", action: "전투 출력 재분배", intent: "engineering", priority: "emergency", detail: "교전 대응" };
    if (role === "의무실") return { station: "의무실", action: "응급 처치 준비", intent: "medical", priority: "emergency", detail: "교전 대응" };
  }

  if (snapshot.pendingTravelEvent) {
    if (role === "함교") return { station: "브릿지", action: "항해 이벤트 선택지 분석", intent: "navigation", priority: "high", detail: snapshot.pendingTravelEvent.title };
    if (role === "기관실") return { station: "기관실", action: "비상 수리반 대기", intent: "engineering", priority: "high", detail: snapshot.pendingTravelEvent.title };
    if (role === "포탑") return { station: "외곽 센서", action: "위협 접근 감시", intent: "security", priority: "normal", detail: snapshot.pendingTravelEvent.title };
    if (role === "의무실") return { station: "의무실", action: "부상 대응 준비", intent: "medical", priority: "normal", detail: snapshot.pendingTravelEvent.title };
  }

  if ((snapshot.resources?.hull ?? 100) < 35 && role === "기관실") {
    return { station: "기관실", action: "선체 손상 점검", intent: "repair", priority: "high", detail: "선체 경고" };
  }

  if ((snapshot.resources?.oxygen ?? 100) < 35 && role === "의무실") {
    return { station: "의무실", action: "산소 부족 증상 점검", intent: "medical", priority: "high", detail: "산소 경고" };
  }

  if ((snapshot.resources?.fuel ?? 100) < 35 && role === "기관실") {
    return { station: "기관실", action: "연료 소모율 점검", intent: "engineering", priority: "high", detail: "연료 경고" };
  }

  if (snapshot.activeTravel) {
    if (role === "함교") return { station: "브릿지", action: "항로 편차 계산", intent: "navigation", priority: "normal", detail: "항해 중" };
    if (role === "기관실") return { station: "기관실", action: "추진기 안정화", intent: "engineering", priority: "normal", detail: "항해 중" };
    if (role === "포탑") return { station: "외곽 센서", action: "항로 주변 감시", intent: "security", priority: "normal", detail: "항해 중" };
    if (role === "의무실") return { station: "생활구역", action: "피로도 순회 점검", intent: "medical", priority: "normal", detail: "항해 중" };
  }

  return null;
}

function roomJobPriority(room) {
  if (room.load > 75 || room.condition < 35) return "high";
  return "normal";
}

export function generateCrewActivities({ crew = [], queues = {}, snapshot = {}, currentMinute = 0 }) {
  const roomJobCandidates = [];
  const fixedActivities = new Map();
  const claimedCrisisIds = new Set();
  const claimedInstallationTaskIds = new Set();
  const enrichedSnapshot = { ...snapshot, currentMinute };

  crew.forEach((member, index) => {
    if (!member.alive) {
      fixedActivities.set(member.id, { memberId: member.id, station: "명예 전당", action: "작전 제외", intent: "inactive", priority: "low", detail: "전사", updatedAt: currentMinute });
      return;
    }

    const queueTask = assignedQueueTask(member, queues);
    const queuedTreatment = queueTask?.queueType === "treatment" ? queueActivity(member, queueTask, currentMinute) : null;
    if (queuedTreatment) {
      fixedActivities.set(member.id, queuedTreatment);
      return;
    }

    const queuedRecovery = queueTask?.queueType === "recovery" ? queueActivity(member, queueTask, currentMinute) : null;
    if (queuedRecovery) {
      fixedActivities.set(member.id, queuedRecovery);
      return;
    }

    if (!canWorkWithInjury(member.injury)) {
      const priority = injuryPriority(member.injury) === "critical" ? "emergency" : "high";
      fixedActivities.set(member.id, { memberId: member.id, station: "의무실 앞", action: "치료 대기", intent: "medical", priority, detail: injuryLabel(member.injury), updatedAt: currentMinute });
      return;
    }

    const crisisResponse = pickCrisisAssignment(member, snapshot, claimedCrisisIds);
    if (crisisResponse) {
      fixedActivities.set(member.id, { memberId: member.id, ...crisisResponse, updatedAt: currentMinute });
      return;
    }

    const medicalCare = pickMedicalCare(member, crew);
    if (medicalCare) {
      fixedActivities.set(member.id, { memberId: member.id, ...medicalCare, updatedAt: currentMinute });
      return;
    }

    if ((member.fatigue ?? 0) >= 85) {
      fixedActivities.set(member.id, { memberId: member.id, station: "생활구역", action: "강제 휴식", intent: "rest", priority: "high", detail: "피로 한계", roomId: "living", updatedAt: currentMinute });
      return;
    }

    const queuedActivity = queueActivity(member, queueTask, currentMinute);
    if (queuedActivity) {
      fixedActivities.set(member.id, queuedActivity);
      return;
    }

    const crisis = roleCrisisAssignment(member, snapshot);
    if (crisis) {
      fixedActivities.set(member.id, { memberId: member.id, ...crisis, updatedAt: currentMinute });
      return;
    }

    const installationWork = pickInstallationWork(member, enrichedSnapshot, claimedInstallationTaskIds);
    if (installationWork) {
      fixedActivities.set(member.id, installationWork);
      return;
    }

    roomJobCandidates.push({ member, index });
  });

  const roomAssignments = pickRoomJobsForIdleCrew({
    idleMembers: roomJobCandidates.map((candidate) => candidate.member),
    rooms: snapshot.rooms ?? {},
    currentMinute,
    context: snapshot,
  });

  return crew.map((member, index) => {
    if (fixedActivities.has(member.id)) return fixedActivities.get(member.id);

    const roomAssignment = roomAssignments.get(member.id);
    if (roomAssignment) {
      const room = (snapshot.rooms ?? {})[roomAssignment.roomId];
      const roomLabel = ROOM_LABELS[roomAssignment.roomId] ?? roomAssignment.roomId;
      return {
        memberId: member.id,
        station: roomLabel,
        action: roomAssignment.action,
        intent: "room-job",
        priority: room ? roomJobPriority(room) : "normal",
        detail: isHealthy(member.injury) ? "방 작업" : `${injuryLabel(member.injury)} · 효율 저하`,
        roomId: roomAssignment.roomId,
        jobId: roomAssignment.jobId,
        speedMultiplier: injuryWorkSpeedMultiplier(member.injury),
        updatedAt: currentMinute,
      };
    }

    const roleDefault = ROLE_DEFAULTS[member.role];
    if (roleDefault && (member.fatigue ?? 0) < 65) {
      return { memberId: member.id, ...roleDefault, priority: "normal", detail: isHealthy(member.injury) ? "역할 기본 업무" : `${injuryLabel(member.injury)} · 효율 저하`, updatedAt: currentMinute };
    }

    return idleAction(member, currentMinute, index);
  });
}

export function summarizeCrewAI(activities = []) {
  return activities.reduce(
    (acc, activity) => {
      acc.total += 1;
      acc[activity.priority] = (acc[activity.priority] ?? 0) + 1;
      acc.byIntent[activity.intent] = (acc.byIntent[activity.intent] ?? 0) + 1;
      return acc;
    },
    { total: 0, emergency: 0, high: 0, normal: 0, low: 0, byIntent: {} },
  );
}
