import { describe, expect, it } from "vitest";
import { explainBacklogReason, scheduleJobs } from "../jobScheduler";
import { normalizeJob } from "../jobMigration";
import { ROOM_TRAVEL_MINUTES } from "../../data/constants";

function room(overrides = {}) {
  return { slotCapacity: 1, ...overrides };
}

function crewMember(overrides = {}) {
  return { id: "m1", alive: true, role: "기관실", fatigue: 10, injury: "healthy", ...overrides };
}

describe("scheduleJobs - backlog assignment", () => {
  it("assigns a backlog job to an eligible crew member and reserves an arrival slot", () => {
    const job = normalizeJob({ id: "job-1", type: "hull_repair", roomId: "engineering", status: "backlog", requiredRole: "engineer" });
    const rooms = { engineering: room() };
    const crew = [crewMember({ id: "eng-1", role: "기관실" })];
    const { results, warnings } = scheduleJobs([job], rooms, crew, 100);
    expect(warnings).toEqual([]);
    const assign = results.find((entry) => entry.jobId === "job-1");
    expect(assign).toMatchObject({ kind: "assign", crewId: "eng-1", arrivalAt: 100 + ROOM_TRAVEL_MINUTES });
  });

  it("does not assign when no crew member matches the required role", () => {
    const job = normalizeJob({ id: "job-1", type: "hull_repair", roomId: "engineering", status: "backlog", requiredRole: "engineer" });
    const rooms = { engineering: room() };
    const crew = [crewMember({ id: "pilot-1", role: "함교" })];
    const { results } = scheduleJobs([job], rooms, crew, 0);
    expect(results.find((entry) => entry.jobId === "job-1")).toBeUndefined();
  });

  it("emits a missing_room warning when the job's room does not exist", () => {
    const job = normalizeJob({ id: "job-1", type: "hull_repair", roomId: "engineering", status: "backlog" });
    const { warnings } = scheduleJobs([job], {}, [crewMember()], 0);
    expect(warnings).toEqual([{ jobId: "job-1", roomId: "engineering", reason: "missing_room" }]);
  });

  it("respects room slot capacity: a full room blocks further backlog assignment", () => {
    const runningJob = normalizeJob({ id: "running", type: "hull_repair", roomId: "engineering", status: "in_progress", assignedCrewId: "eng-1" });
    const backlogJob = normalizeJob({ id: "backlog-1", type: "hull_repair", roomId: "engineering", status: "backlog" });
    const rooms = { engineering: room({ slotCapacity: 1 }) };
    const crew = [crewMember({ id: "eng-1" }), crewMember({ id: "eng-2" })];
    const { results } = scheduleJobs([runningJob, backlogJob], rooms, crew, 0);
    expect(results.find((entry) => entry.jobId === "backlog-1")).toBeUndefined();
  });

  it("excludes crew members with fatigue >= 85 from candidacy", () => {
    const job = normalizeJob({ id: "job-1", type: "hull_repair", roomId: "engineering", status: "backlog" });
    const rooms = { engineering: room() };
    const crew = [crewMember({ id: "tired", fatigue: 85 })];
    const { results } = scheduleJobs([job], rooms, crew, 0);
    expect(results.find((entry) => entry.jobId === "job-1")).toBeUndefined();
  });

  it("processes higher-priority (lower numeric priority) backlog jobs first for a scarce room slot", () => {
    const rooms = { engineering: room({ slotCapacity: 1 }) };
    const crew = [crewMember({ id: "eng-1" })];
    const lowPriority = normalizeJob({ id: "low", type: "hull_repair", roomId: "engineering", status: "backlog", priority: "low", createdAt: 0 });
    const highPriority = normalizeJob({ id: "high", type: "hull_repair", roomId: "engineering", status: "backlog", priority: "emergency", createdAt: 10 });
    const { results } = scheduleJobs([lowPriority, highPriority], rooms, crew, 0);
    const assigned = results.filter((entry) => entry.kind === "assign");
    expect(assigned).toHaveLength(1);
    expect(assigned[0].jobId).toBe("high");
  });
});

describe("scheduleJobs - assigned job start/rollback", () => {
  it("starts an assigned job once arrivalAt has passed", () => {
    const job = normalizeJob({ id: "job-1", type: "hull_repair", roomId: "engineering", status: "assigned", assignedCrewId: "eng-1", arrivalAt: 50 });
    const crew = [crewMember({ id: "eng-1" })];
    const { results } = scheduleJobs([job], { engineering: room() }, crew, 60);
    expect(results).toContainEqual({ kind: "start", jobId: "job-1", crewId: "eng-1" });
  });

  it("does not start an assigned job before arrivalAt", () => {
    const job = normalizeJob({ id: "job-1", type: "hull_repair", roomId: "engineering", status: "assigned", assignedCrewId: "eng-1", arrivalAt: 50 });
    const crew = [crewMember({ id: "eng-1" })];
    const { results } = scheduleJobs([job], { engineering: room() }, crew, 10);
    expect(results.find((entry) => entry.jobId === "job-1")).toBeUndefined();
  });

  it("rolls back an assigned job when its reserved crew member becomes unavailable (e.g. dies)", () => {
    const job = normalizeJob({ id: "job-1", type: "hull_repair", roomId: "engineering", status: "assigned", assignedCrewId: "eng-1", arrivalAt: 5 });
    const crew = [crewMember({ id: "eng-1", alive: false })];
    const { results } = scheduleJobs([job], { engineering: room() }, crew, 100);
    expect(results).toContainEqual({ kind: "rollback", jobId: "job-1", reason: "crew_unavailable" });
  });
});

describe("scheduleJobs - targeted crew jobs (recovery/training/treatment)", () => {
  it("uses payload.targetCrewId rather than the pool for treatment jobs, allowing an unusable-but-alive target", () => {
    const job = normalizeJob({ id: "job-1", type: "treatment", roomId: "medbay", status: "backlog", payload: { targetCrewId: "hurt-1" } });
    const rooms = { medbay: room() };
    const crew = [crewMember({ id: "hurt-1", role: "함교", injury: "중상" })]; // canWorkWithInjury=false but treatment allows it
    const { results } = scheduleJobs([job], rooms, crew, 0);
    const assign = results.find((entry) => entry.jobId === "job-1");
    expect(assign).toMatchObject({ kind: "assign", crewId: "hurt-1" });
  });

  it("does not assign a recovery job whose target crew member is unusable", () => {
    const job = normalizeJob({ id: "job-1", type: "recovery", roomId: "medbay", status: "backlog", payload: { targetCrewId: "hurt-1" } });
    const rooms = { medbay: room() };
    const crew = [crewMember({ id: "hurt-1", injury: "중상" })];
    const { results } = scheduleJobs([job], rooms, crew, 0);
    expect(results.find((entry) => entry.jobId === "job-1")).toBeUndefined();
  });
});

describe("explainBacklogReason", () => {
  it("returns null for a non-backlog (or missing) job", () => {
    expect(explainBacklogReason(null)).toBeNull();
    expect(explainBacklogReason(normalizeJob({ status: "in_progress" }))).toBeNull();
  });

  it("returns '방 없음' when the job's room does not exist", () => {
    const job = normalizeJob({ type: "hull_repair", roomId: "engineering", status: "backlog" });
    expect(explainBacklogReason(job, [job], {}, [])).toBe("방 없음");
  });

  it("returns '슬롯 대기' when the room is full", () => {
    const runningJob = normalizeJob({ id: "running", type: "hull_repair", roomId: "engineering", status: "in_progress" });
    const backlogJob = normalizeJob({ id: "backlog-1", type: "hull_repair", roomId: "engineering", status: "backlog" });
    const rooms = { engineering: room({ slotCapacity: 1 }) };
    expect(explainBacklogReason(backlogJob, [runningJob, backlogJob], rooms, [])).toBe("슬롯 대기");
  });

  it("returns '크루 대기' when there's room but no eligible crew", () => {
    const job = normalizeJob({ type: "hull_repair", roomId: "engineering", status: "backlog", requiredRole: "engineer" });
    const rooms = { engineering: room() };
    expect(explainBacklogReason(job, [job], rooms, [crewMember({ role: "함교" })])).toBe("크루 대기");
  });

  it("returns '배정 대기' when a slot and eligible crew both exist", () => {
    const job = normalizeJob({ type: "hull_repair", roomId: "engineering", status: "backlog" });
    const rooms = { engineering: room() };
    expect(explainBacklogReason(job, [job], rooms, [crewMember()])).toBe("배정 대기");
  });
});
