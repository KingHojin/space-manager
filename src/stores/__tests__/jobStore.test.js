import { describe, expect, it } from "vitest";
import { useJobStore } from "../jobStore";

// Round 20, bug fix 2: crewStore.applyCombatCasualty stopped clearing the
// dead crew member's active jobStore jobs after the Phase 18-B unification
// (it only ever filtered the now-permanently-empty legacy crewStore queues).
// cancelJobsForCrew(memberId) is the new jobStore-side primitive that fills
// that gap: force-fail every ACTIVE (backlog/assigned/in_progress) job whose
// payload.targetCrewId matches, freeing the room slot immediately instead of
// leaving a ghost job running until its (no-op, since !alive) completion.

function inProgressJob(overrides = {}) {
  return {
    id: overrides.id ?? "job-1",
    type: "training",
    roomId: "living",
    status: "in_progress",
    assignedCrewId: overrides.memberId ?? "crew-a",
    startedAt: 0,
    duration: 60,
    payload: { targetCrewId: overrides.memberId ?? "crew-a" },
    ...overrides,
  };
}

describe("jobStore.cancelJobsForCrew", () => {
  it("fails an in_progress job targeting the given crew member and frees its room slot", () => {
    const job = inProgressJob({ id: "job-inprogress", memberId: "crew-a" });
    useJobStore.setState({ jobs: [job] });
    useJobStore.getState().recomputeRoomLoad();
    expect(useJobStore.getState().rooms.living.activeJobIds).toContain("job-inprogress");

    const cancelled = useJobStore.getState().cancelJobsForCrew("crew-a");

    expect(cancelled.map((entry) => entry.id)).toEqual(["job-inprogress"]);
    const after = useJobStore.getState().jobs.find((entry) => entry.id === "job-inprogress");
    expect(after.status).toBe("failed");
    expect(after.assignedCrewId).toBeNull();
    expect(useJobStore.getState().rooms.living.activeJobIds).not.toContain("job-inprogress");
    expect(useJobStore.getState().rooms.living.currentLoad).toBe(0);
  });

  it("sets a mood-adjusted effective duration when a job starts", () => {
    const job = inProgressJob({ id: "job-mood", status: "assigned", assignedCrewId: "crew-inspired", arrivalAt: 0, duration: 112, startedAt: null, payload: { targetCrewId: "crew-inspired" } });
    useJobStore.setState({ jobs: [job] });

    useJobStore.getState().runScheduler({
      currentMinute: 10,
      crew: [{ id: "crew-inspired", alive: true, role: "함교", fatigue: 0, injury: "healthy", needs: { mood: 95, hunger: 0, stress: 0, sleepDebt: 0, hygiene: 100 } }],
    });

    const started = useJobStore.getState().jobs.find((entry) => entry.id === "job-mood");
    expect(started.status).toBe("in_progress");
    expect(started.moodWorkMultiplier).toBe(1.12);
    expect(started.effectiveDuration).toBe(100);
  });

  it("also cancels backlog and assigned jobs for the crew member (unlike cancelJob, which refuses in_progress)", () => {
    const jobs = [
      inProgressJob({ id: "job-backlog", memberId: "crew-b", status: "backlog", assignedCrewId: null, startedAt: null }),
      inProgressJob({ id: "job-assigned", memberId: "crew-b", status: "assigned", startedAt: null, arrivalAt: 30 }),
    ];
    useJobStore.setState({ jobs });
    useJobStore.getState().recomputeRoomLoad();

    const cancelled = useJobStore.getState().cancelJobsForCrew("crew-b");

    expect(cancelled.map((entry) => entry.id).sort()).toEqual(["job-assigned", "job-backlog"]);
    const statuses = useJobStore.getState().jobs.map((entry) => entry.status);
    expect(statuses).toEqual(["failed", "failed"]);
  });

  it("leaves jobs belonging to other crew members untouched", () => {
    const jobs = [inProgressJob({ id: "job-mine", memberId: "crew-c" }), inProgressJob({ id: "job-other", memberId: "crew-d" })];
    useJobStore.setState({ jobs });
    useJobStore.getState().recomputeRoomLoad();

    const cancelled = useJobStore.getState().cancelJobsForCrew("crew-c");

    expect(cancelled.map((entry) => entry.id)).toEqual(["job-mine"]);
    const other = useJobStore.getState().jobs.find((entry) => entry.id === "job-other");
    expect(other.status).toBe("in_progress");
  });

  it("returns an empty array and changes nothing when the crew member has no active jobs", () => {
    const jobs = [inProgressJob({ id: "job-done", memberId: "crew-e", status: "done", startedAt: 0, progress: 1 })];
    useJobStore.setState({ jobs });
    useJobStore.getState().recomputeRoomLoad();

    const cancelled = useJobStore.getState().cancelJobsForCrew("crew-e");

    expect(cancelled).toEqual([]);
    expect(useJobStore.getState().jobs.find((entry) => entry.id === "job-done").status).toBe("done");
  });
});
