import { useCombatStore } from "../stores/combatStore";
import { useJobStore } from "../stores/jobStore";
import { useExplorationStore } from "../stores/explorationStore";
import { useMissionStore } from "../stores/missionStore";
import { useNavStore } from "../stores/navStore";
import { useSkillStore } from "../stores/skillStore";

const ACTIVE_JOB_STATUSES = new Set(["backlog", "assigned", "in_progress"]);
const BLOCKING_JOB_TYPES = new Set(["hull_repair", "training"]);

export const SKILL_RESET_REASONS = {
  notStation: "스킬 초기화는 정거장에 정박한 상태에서만 가능합니다.",
  traveling: "항해 중에는 스킬을 초기화할 수 없습니다.",
  drifting: "표류 중에는 스킬을 초기화할 수 없습니다.",
  alreadyResetThisSector: "이 섹터에서는 이미 스킬을 초기화했습니다.",
  activeCombat: "교전 중에는 스킬을 초기화할 수 없습니다.",
  activeMission: "진행 중인 임무가 있어 스킬을 초기화할 수 없습니다.",
  pendingMissionEncounter: "처리 대기 중인 임무 조우가 있습니다.",
  pendingCombat: "처리 대기 중인 전투 조우가 있습니다.",
  activeJob: "진행 중인 수리 또는 훈련 작업이 있습니다.",
};

export function validateSkillReset({ nav, skills, combat, missions, jobs, exploration } = {}) {
  const sectorIndex = Math.max(0, nav?.sectorIndex ?? 0);
  if (nav?.travel) return { ok: false, reason: "traveling" };
  if (nav?.driftState) return { ok: false, reason: "drifting" };
  const node = nav?.sector?.nodes?.find((entry) => entry.id === nav?.currentNodeId);
  if (node?.type !== "station") return { ok: false, reason: "notStation" };
  if ((skills?.lastResetSectorIndex ?? -1) === sectorIndex) return { ok: false, reason: "alreadyResetThisSector" };
  if (Object.values(combat?.combatByVesselId ?? {}).some(Boolean)) return { ok: false, reason: "activeCombat" };
  if (Object.values(missions?.activeByVesselId ?? {}).some(Boolean)) return { ok: false, reason: "activeMission" };
  if (Object.values(missions?.pendingMissionEncountersByVesselId ?? {}).some(Boolean)) return { ok: false, reason: "pendingMissionEncounter" };
  if (exploration?.pendingCombatEncounter) return { ok: false, reason: "pendingCombat" };
  if ((jobs?.jobs ?? []).some((job) => ACTIVE_JOB_STATUSES.has(job.status) && BLOCKING_JOB_TYPES.has(job.type))) return { ok: false, reason: "activeJob" };
  return { ok: true, sectorIndex };
}

export function requestSkillReset() {
  const result = validateSkillReset({
    nav: useNavStore.getState(), skills: useSkillStore.getState(), combat: useCombatStore.getState(),
    missions: useMissionStore.getState(), jobs: useJobStore.getState(), exploration: useExplorationStore.getState(),
  });
  if (!result.ok) return { ...result, message: SKILL_RESET_REASONS[result.reason] };
  useSkillStore.getState().applyValidatedReset(result.sectorIndex);
  return { ok: true, sectorIndex: result.sectorIndex, message: `섹터 ${result.sectorIndex + 1} 스킬 초기화를 완료했습니다.` };
}
