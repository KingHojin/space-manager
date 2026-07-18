import { getMoodWorkMultiplier } from "./crewMood";
import { projectCrewWorkDuration } from "./crewWorkProjection";

/** Pure production timing rule shared by the scheduler store and read-only forecasts. */
export function getJobDurationForCrew(job, crew = []) {
  if (job.payload?.story || job.payload?.incident) return { effectiveDuration: job.duration, moodWorkMultiplier: 1 };
  // Explicit ordinary-work assignments carry an immutable projection. Never
  // recompute it from live fatigue/gear after the player has accepted the ETA.
  if (job.payload?.workerSnapshot) return { effectiveDuration: projectCrewWorkDuration(job.duration, job.payload.workerSnapshot), moodWorkMultiplier: 1, workerSnapshot: job.payload.workerSnapshot };
  const member = crew.find((entry) => entry.id === job.assignedCrewId || entry.id === job.payload?.workerCrewId || entry.id === job.payload?.targetCrewId);
  const moodWorkMultiplier = getMoodWorkMultiplier(member);
  return { effectiveDuration: Math.max(1, Math.round((job.duration ?? 1) / moodWorkMultiplier)), moodWorkMultiplier };
}
