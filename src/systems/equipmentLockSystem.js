import { canWorkWithInjury } from "./injurySystem";

export function getCrewChangeLockReason({ crew = [], jobs = [], combatByVesselId = {}, crewId } = {}) {
  const member = crew.find((entry) => entry.id === crewId);
  if (!member?.alive) return "dead";
  if (!canWorkWithInjury(member.injury)) return "injured";
  if (jobs.some((job) => ["assigned", "in_progress"].includes(job.status) && job.assignedCrewId === crewId)) return "busy";
  if (Object.values(combatByVesselId ?? {}).some((combat) => combat?.status === "engaged")) return "combat";
  return null;
}
