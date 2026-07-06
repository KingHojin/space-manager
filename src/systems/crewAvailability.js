import { canWorkWithInjury } from "./injurySystem";

const BUSY_JOB_STATUSES = new Set(["assigned", "in_progress"]);
const TARGETED_CREW_JOB_TYPES = new Set(["training", "treatment", "recovery"]);

function isBusyJob(job) {
  return BUSY_JOB_STATUSES.has(job?.status);
}

export function getBusyCrewIdsFromJobs(jobs = []) {
  const ids = new Set();

  jobs.forEach((job) => {
    if (!isBusyJob(job)) return;
    if (job.assignedCrewId) ids.add(job.assignedCrewId);
    if (TARGETED_CREW_JOB_TYPES.has(job.type) && job.payload?.targetCrewId) ids.add(job.payload.targetCrewId);
  });

  return ids;
}

export function getBusyCrewIdsFromQueues({ trainingQueue = [], treatmentQueue = [], recoveryQueue = [] } = {}) {
  const ids = new Set();

  trainingQueue.forEach((task) => {
    if (task?.memberId) ids.add(task.memberId);
  });
  treatmentQueue.forEach((task) => {
    if (task?.memberId) ids.add(task.memberId);
  });
  recoveryQueue.forEach((task) => {
    if (task?.memberId) ids.add(task.memberId);
  });

  return ids;
}

export function isCrewOperational(member, busyCrewIds = new Set()) {
  if (!member?.alive) return false;
  if (busyCrewIds.has(member.id)) return false;
  if (!canWorkWithInjury(member.injury)) return false;
  if ((member.fatigue ?? 0) >= 90) return false;
  return true;
}

export function getAvailableCrewForTravel({ crew = [], jobs = [], trainingQueue = [], treatmentQueue = [], recoveryQueue = [] } = {}) {
  const busyIds = getBusyCrewIdsFromJobs(jobs);
  getBusyCrewIdsFromQueues({ trainingQueue, treatmentQueue, recoveryQueue }).forEach((id) => busyIds.add(id));
  return crew.filter((member) => isCrewOperational(member, busyIds));
}

export function evaluateTravelCrewReadiness(input = {}) {
  const availableCrew = getAvailableCrewForTravel(input);
  const bridgeCrew = availableCrew.filter((member) => member.role === "함교");

  if (availableCrew.length <= 0) {
    return { ok: false, reason: "no_available_crew", availableCrew, bridgeCrew };
  }

  if (bridgeCrew.length <= 0) {
    return { ok: false, reason: "no_bridge_crew", availableCrew, bridgeCrew };
  }

  return { ok: true, reason: "ready", availableCrew, bridgeCrew };
}

export function travelReadinessMessage(result) {
  if (result?.reason === "no_bridge_crew") return "항해 불가: 조종/항로 결재가 가능한 함교 승무원이 없습니다.";
  if (result?.reason === "no_available_crew") return "항해 불가: 가용 승무원이 없습니다. 회복/치료/훈련/작업 중인 승무원이 복귀해야 합니다.";
  return "항해 준비 완료";
}
