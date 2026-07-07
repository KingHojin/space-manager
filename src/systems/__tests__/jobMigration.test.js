import { describe, expect, it } from "vitest";
import {
  jobToLegacyModuleWork,
  jobToLegacyRecovery,
  jobToLegacyShipWork,
  jobToLegacyTraining,
  jobToLegacyTreatment,
  migrateLegacyQueues,
  normalizeJob,
  normalizeJobPriority,
  normalizeRoomId,
  priorityToActivityPriority,
} from "../jobMigration";
import { JOB_PRIORITY } from "../../data/constants";

describe("normalizeJobPriority", () => {
  it("passes through a finite number, rounded and floored at 0", () => {
    expect(normalizeJobPriority(4.6)).toBe(5);
    expect(normalizeJobPriority(-5)).toBe(0);
  });

  it("maps a known named priority to its numeric JOB_PRIORITY value", () => {
    expect(normalizeJobPriority("emergency")).toBe(JOB_PRIORITY.emergency);
    expect(normalizeJobPriority("high")).toBe(JOB_PRIORITY.high);
  });

  it("falls back to JOB_ECONOMY.defaultPriority for unknown/missing values", () => {
    expect(normalizeJobPriority("bogus")).toBe(JOB_PRIORITY.normal);
    expect(normalizeJobPriority(undefined)).toBe(JOB_PRIORITY.normal);
  });
});

describe("priorityToActivityPriority", () => {
  it("buckets numeric priority into emergency/high/normal/low by JOB_PRIORITY thresholds", () => {
    expect(priorityToActivityPriority(JOB_PRIORITY.emergency)).toBe("emergency");
    expect(priorityToActivityPriority(JOB_PRIORITY.high)).toBe("high");
    expect(priorityToActivityPriority(JOB_PRIORITY.normal)).toBe("normal");
    expect(priorityToActivityPriority(JOB_PRIORITY.low)).toBe("low");
    expect(priorityToActivityPriority(999)).toBe("low");
  });
});

describe("normalizeRoomId", () => {
  it("maps a known alias to its canonical room id", () => {
    expect(normalizeRoomId("engine_room")).toBe("engineering");
    expect(normalizeRoomId("cargo_bay")).toBe("cargo");
  });

  it("passes through a valid room id unchanged", () => {
    expect(normalizeRoomId("medbay")).toBe("medbay");
  });

  it("falls back to the type's default room for an invalid room id", () => {
    expect(normalizeRoomId("not-a-room", "hull_repair")).toBe("engineering");
    expect(normalizeRoomId(undefined, "salvage")).toBe("cargo");
  });

  it("falls back to living when there is no type-specific default", () => {
    expect(normalizeRoomId("not-a-room")).toBe("living");
  });
});

describe("normalizeJob", () => {
  it("fills in defaults: id, type, status=backlog, duration, priority", () => {
    const job = normalizeJob({});
    expect(job.id).toBeTruthy();
    expect(job.type).toBe("training");
    expect(job.status).toBe("backlog");
    expect(job.duration).toBeGreaterThan(0);
    expect(job.priority).toBe(JOB_PRIORITY.normal);
  });

  it("forces startedAt to null while status is backlog, even if one was supplied", () => {
    const job = normalizeJob({ status: "backlog", startedAt: 500 });
    expect(job.startedAt).toBeNull();
  });

  it("preserves a supplied startedAt for a non-backlog status", () => {
    const job = normalizeJob({ status: "in_progress", startedAt: 500, createdAt: 400 });
    expect(job.startedAt).toBe(500);
  });

  it("clears requiredRole for recovery/treatment/training regardless of input", () => {
    expect(normalizeJob({ type: "recovery", requiredRole: "engineer" }).requiredRole).toBeNull();
    expect(normalizeJob({ type: "treatment", requiredRole: "engineer" }).requiredRole).toBeNull();
    expect(normalizeJob({ type: "training", requiredRole: "engineer" }).requiredRole).toBeNull();
  });

  it("keeps an explicit requiredRole for other job types", () => {
    expect(normalizeJob({ type: "hull_repair", requiredRole: "engineer" }).requiredRole).toBe("engineer");
  });

  it("computes progress from elapsed time when no explicit progress is given", () => {
    const job = normalizeJob({ type: "salvage", startedAt: 0, duration: 100, status: "in_progress" }, 50);
    expect(job.progress).toBeCloseTo(0.5);
  });

  it("clamps progress to [0,1]", () => {
    const overshoot = normalizeJob({ type: "salvage", startedAt: 0, duration: 100, status: "in_progress" }, 500);
    expect(overshoot.progress).toBe(1);
  });
});

describe("legacy round trips (job -> legacy -> job)", () => {
  it("hull_repair job survives a round trip through jobToLegacyShipWork", () => {
    const job = normalizeJob({ type: "hull_repair", roomId: "engineering", priority: "high", duration: 120, startedAt: 10, createdAt: 10, cost: 50, payload: { hullDelta: 8 } });
    const legacy = jobToLegacyShipWork(job);
    expect(legacy).toMatchObject({ id: job.id, type: "hullRepair", roomId: "engineering", cost: 50, duration: 120 });
    const roundTripped = normalizeJob({ id: legacy.id, type: "hull_repair", roomId: legacy.roomId, priority: legacy.priority, duration: legacy.duration, startedAt: legacy.startedAt, cost: legacy.cost, payload: legacy.payload, status: legacy.status });
    expect(roundTripped.id).toBe(job.id);
    expect(roundTripped.roomId).toBe(job.roomId);
    expect(roundTripped.duration).toBe(job.duration);
    expect(roundTripped.priority).toBe(job.priority);
  });

  // Phase 18-B fix: legacy views must export the string priority vocabulary
  // ("emergency"/"high"/"normal"/"low") that every legacy-view consumer
  // (TaskQueuePanel, crewAI.assignedQueueTask, Overview) expects via
  // systems/priorities.js. jobStore itself keeps numeric JOB_PRIORITY
  // internally, so each jobToLegacy* converter must bucket that numeric
  // value back into a string with priorityToActivityPriority before handing
  // the view to a consumer.
  it("exports string priority vocabulary (not the numeric jobStore priority) from every jobToLegacy* converter", () => {
    const shipWork = jobToLegacyShipWork(normalizeJob({ type: "hull_repair", priority: JOB_PRIORITY.high }));
    expect(shipWork.priority).toBe("high");

    const moduleWork = jobToLegacyModuleWork(normalizeJob({ type: "module_upgrade", priority: JOB_PRIORITY.emergency, payload: { action: "upgrade", slot: "engine", moduleId: "mod-1" } }));
    expect(moduleWork.priority).toBe("emergency");

    const recovery = jobToLegacyRecovery(normalizeJob({ type: "recovery", priority: JOB_PRIORITY.normal, payload: { targetCrewId: "crew-1" } }));
    expect(recovery.priority).toBe("normal");

    const training = jobToLegacyTraining(normalizeJob({ type: "training", priority: JOB_PRIORITY.low, payload: { targetCrewId: "crew-2", statKey: "gunnery" } }));
    expect(training.priority).toBe("low");

    const treatment = jobToLegacyTreatment(normalizeJob({ type: "treatment", priority: JOB_PRIORITY.emergency, payload: { targetCrewId: "crew-3" } }));
    expect(treatment.priority).toBe("emergency");
  });

  it("jobToLegacyShipWork returns null for a non ship-work job type", () => {
    const job = normalizeJob({ type: "training" });
    expect(jobToLegacyShipWork(job)).toBeNull();
  });

  it("module_upgrade job survives a round trip through jobToLegacyModuleWork", () => {
    const job = normalizeJob({ type: "module_upgrade", roomId: "engineering", payload: { action: "upgrade", slot: "engine", moduleId: "mod-1" }, duration: 90, startedAt: 5, createdAt: 5 });
    const legacy = jobToLegacyModuleWork(job);
    expect(legacy).toMatchObject({ id: job.id, type: "upgrade", slot: "engine", moduleId: "mod-1", roomId: "engineering" });
  });

  it("jobToLegacyModuleWork returns null for a non module_upgrade job", () => {
    expect(jobToLegacyModuleWork(normalizeJob({ type: "decode" }))).toBeNull();
  });

  it("recovery job survives a round trip through jobToLegacyRecovery", () => {
    const job = normalizeJob({ type: "recovery", assignedCrewId: "crew-1", payload: { targetCrewId: "crew-1", fatigueRecovery: 20 }, duration: 60, startedAt: 0, createdAt: 0 });
    const legacy = jobToLegacyRecovery(job);
    expect(legacy).toMatchObject({ id: job.id, memberId: "crew-1", assignedCrewId: "crew-1", fatigueRecovery: 20, roomId: "medbay" });
  });

  it("jobToLegacyRecovery returns null for a non recovery job", () => {
    expect(jobToLegacyRecovery(normalizeJob({ type: "hull_repair" }))).toBeNull();
  });

  it("training job survives a round trip through jobToLegacyTraining", () => {
    const job = normalizeJob({ type: "training", payload: { targetCrewId: "crew-2", statKey: "gunnery" }, duration: 60, startedAt: 0, createdAt: 0 });
    const legacy = jobToLegacyTraining(job);
    expect(legacy).toMatchObject({ id: job.id, memberId: "crew-2", statKey: "gunnery", roomId: "living" });
  });

  it("jobToLegacyTraining returns null for a non training job", () => {
    expect(jobToLegacyTraining(normalizeJob({ type: "recovery" }))).toBeNull();
  });

  it("treatment job survives a round trip through jobToLegacyTreatment", () => {
    const job = normalizeJob({ type: "treatment", payload: { targetCrewId: "crew-3", injury: "중상", fatiguePenalty: 12 }, duration: 60, startedAt: 0, createdAt: 0 });
    const legacy = jobToLegacyTreatment(job);
    expect(legacy).toMatchObject({ id: job.id, memberId: "crew-3", injury: "중상", fatiguePenalty: 12, roomId: "medbay" });
  });

  it("jobToLegacyTreatment returns null for a non treatment job", () => {
    expect(jobToLegacyTreatment(normalizeJob({ type: "training" }))).toBeNull();
  });
});

describe("migrateLegacyQueues", () => {
  it("converts each legacy queue entry into a normalized unified job", () => {
    const shipWorkQueue = [{ id: "sw-1", type: "hullRepair", roomId: "engineering", completeAt: 100, duration: 50, priority: "high" }];
    const recoveryQueue = [{ id: "rec-1", memberId: "crew-1", completeAt: 200, duration: 60 }];
    const trainingQueue = [{ id: "tr-1", memberId: "crew-2", statKey: "gunnery", completeAt: 150, duration: 90 }];
    const treatmentQueue = [{ id: "tx-1", memberId: "crew-3", injury: "경상", completeAt: 300, duration: 100 }];

    const { jobs, errors } = migrateLegacyQueues(shipWorkQueue, recoveryQueue, trainingQueue, treatmentQueue, 400);
    expect(errors).toEqual([]);
    expect(jobs).toHaveLength(4);
    expect(jobs.map((job) => job.type).sort()).toEqual(["hull_repair", "recovery", "training", "treatment"]);
  });

  it("reports an error and skips entries missing required fields (e.g. recovery without memberId)", () => {
    const { jobs, errors } = migrateLegacyQueues([], [{ id: "rec-broken" }], [], [], 0);
    expect(jobs).toHaveLength(0);
    expect(errors).toEqual([{ source: "recoveryQueue", id: "rec-broken", reason: "invalid_task" }]);
  });

  it("reports an unsupported_task error for a shipWorkQueue entry with an unknown type", () => {
    const { jobs, errors } = migrateLegacyQueues([{ id: "sw-bad", type: "not-a-real-type" }], [], [], [], 0);
    expect(jobs).toHaveLength(0);
    expect(errors).toEqual([{ source: "shipWorkQueue", id: "sw-bad", reason: "unsupported_task" }]);
  });

  it("supports the legacy 3-arg call signature (no treatmentQueue param)", () => {
    const { jobs } = migrateLegacyQueues([], [{ id: "rec-1", memberId: "crew-1", completeAt: 100, duration: 50 }], 999);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].type).toBe("recovery");
  });
});
