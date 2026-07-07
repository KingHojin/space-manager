import { describe, expect, it } from "vitest";
import { tickJobs } from "../jobTick";

describe("tickJobs", () => {
  it("returns no results and does nothing for deltaMinutes <= 0", () => {
    expect(tickJobs([{ id: "a", status: "in_progress", progress: 0, duration: 10 }], 0)).toEqual({ results: [] });
    expect(tickJobs([{ id: "a", status: "in_progress", progress: 0, duration: 10 }], -5)).toEqual({ results: [] });
  });

  it("ignores jobs that are not in_progress", () => {
    const jobs = [
      { id: "backlog-1", status: "backlog", progress: 0, duration: 10 },
      { id: "done-1", status: "done", progress: 1, duration: 10 },
    ];
    expect(tickJobs(jobs, 5).results).toEqual([]);
  });

  it("advances progress proportionally to deltaMinutes/duration", () => {
    const jobs = [{ id: "a", status: "in_progress", progress: 0.2, duration: 100 }];
    const { results } = tickJobs(jobs, 10);
    expect(results).toHaveLength(1);
    expect(results[0].kind).toBe("progress");
    expect(results[0].jobId).toBe("a");
    expect(results[0].progress).toBeCloseTo(0.3);
  });

  it("emits a complete result (in addition to progress) once progress reaches 1", () => {
    const jobs = [{ id: "a", status: "in_progress", progress: 0.95, duration: 100, effects: ["reward"] }];
    const { results } = tickJobs(jobs, 10);
    expect(results).toContainEqual({ kind: "progress", jobId: "a", progress: 1 });
    expect(results).toContainEqual({ kind: "complete", jobId: "a", effects: ["reward"] });
  });

  it("clamps progress to a maximum of 1 even with a huge delta", () => {
    const jobs = [{ id: "a", status: "in_progress", progress: 0, duration: 10 }];
    const { results } = tickJobs(jobs, 1000);
    expect(results.find((entry) => entry.kind === "progress").progress).toBe(1);
  });

  it("treats a missing/zero duration as 1 to avoid division by zero", () => {
    const jobs = [{ id: "a", status: "in_progress", progress: 0, duration: 0 }];
    const { results } = tickJobs(jobs, 1);
    expect(results.find((entry) => entry.kind === "progress").progress).toBe(1);
  });
});
