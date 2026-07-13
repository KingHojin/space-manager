import { getMoodWorkMultiplier } from "./crewMood";

/** Pure production timing rule shared by the scheduler store and read-only forecasts. */
export function getJobDurationForCrew(job, crew = []) {
  if (job.payload?.story || job.payload?.incident) return { effectiveDuration: job.duration, moodWorkMultiplier: 1 };
  const member = crew.find((entry) => entry.id === job.assignedCrewId || entry.id === job.payload?.targetCrewId);
  const moodWorkMultiplier = getMoodWorkMultiplier(member);
  return { effectiveDuration: Math.max(1, Math.round((job.duration ?? 1) / moodWorkMultiplier)), moodWorkMultiplier };
}
