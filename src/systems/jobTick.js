function clampProgress(value) {
  return Math.min(1, Math.max(0, value));
}

export function tickJobs(jobs = [], deltaMinutes = 0) {
  const results = [];
  if (deltaMinutes <= 0) return { results };

  jobs.forEach((job) => {
    if (job.status !== "in_progress") return;
    const progress = clampProgress((job.progress ?? 0) + deltaMinutes / Math.max(1, job.effectiveDuration ?? job.duration ?? 1));
    results.push({ kind: "progress", jobId: job.id, progress });
    if (progress >= 1) results.push({ kind: "complete", jobId: job.id, effects: job.effects ?? [] });
  });

  return { results };
}
