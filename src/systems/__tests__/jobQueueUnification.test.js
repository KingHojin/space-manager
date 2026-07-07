import { describe, expect, it } from "vitest";
import { processTimedJobs } from "../gameClock";
import { activeLegacyJobs, jobToLegacyTreatment } from "../jobMigration";
import { getNextPriority } from "../priorities";
import { useCrewStore } from "../../stores/crewStore";
import { useGameStore } from "../../stores/gameStore";
import { useJobStore } from "../../stores/jobStore";
import { useShipStore } from "../../stores/shipStore";

// Phase 18-B: jobStore is now the single source of truth for training,
// treatment, recovery, module-upgrade and ship-work jobs. These tests pin
// down the two guarantees that mattered for the unification:
//   1. Enqueueing through jobStore and ticking the game clock still produces
//      the same crew/ship effects the old dual-queue system produced.
//   2. The legacy crewStore/shipStore completion methods are gone, and any
//      leftover legacy queue data sitting in persisted state (e.g. from an
//      old save that predates migration) is never read or mutated by the
//      tick path anymore — so it can no longer be double-completed.

function tick(minutes, times = 1) {
  for (let i = 0; i < times; i += 1) {
    useGameStore.getState().advanceMinutes(minutes);
    processTimedJobs(minutes);
  }
}

describe("job queue unification (Phase 18-B)", () => {
  it("removes the legacy dual-completion API surface from crewStore/shipStore", () => {
    expect(useCrewStore.getState().completeReadyTraining).toBeUndefined();
    expect(useCrewStore.getState().completeReadyTreatment).toBeUndefined();
    expect(useCrewStore.getState().completeReadyRecovery).toBeUndefined();
    expect(useCrewStore.getState().startTraining).toBeUndefined();
    expect(useCrewStore.getState().startTreatment).toBeUndefined();
    expect(useCrewStore.getState().startRecovery).toBeUndefined();
    expect(useShipStore.getState().completeReadyInstallations).toBeUndefined();
    expect(useShipStore.getState().completeReadyShipWork).toBeUndefined();
    expect(useShipStore.getState().startInstallation).toBeUndefined();
    expect(useShipStore.getState().startUpgrade).toBeUndefined();
    expect(useShipStore.getState().startShipWork).toBeUndefined();
  });

  it("completes a jobStore-enqueued training job end-to-end and applies the same effect the legacy path used to", () => {
    const member = useCrewStore.getState().crew.find((entry) => entry.role === "함교" && entry.alive);
    const statKey = "piloting";
    const beforeStat = member.stats[statKey] ?? 0;
    const beforeFatigue = member.fatigue ?? 0;
    const currentMinute = useGameStore.getState().currentMinute;

    useJobStore.getState().enqueueTraining({ memberId: member.id, statKey, cost: 0, duration: 60, priority: "normal", createdAt: currentMinute });

    // Enough ticks for: backlog -> assigned (room-travel delay) -> in_progress -> done.
    tick(10, 10);

    const after = useCrewStore.getState().crew.find((entry) => entry.id === member.id);
    expect(after.stats[statKey]).toBe(beforeStat + 1);
    expect(after.fatigue).toBeGreaterThan(beforeFatigue);

    // The legacy queue was never written to by this flow.
    expect(useCrewStore.getState().trainingQueue).toEqual([]);
  });

  it("completes a jobStore-enqueued module upgrade job end-to-end and applies the same effect the legacy path used to", () => {
    const beforeModule = useShipStore.getState().modules.find((entry) => entry.id === "pulse-drive");
    const beforeLevel = beforeModule.level;
    const currentMinute = useGameStore.getState().currentMinute;

    useJobStore.getState().enqueueModuleWork({ action: "upgrade", slot: "engine", moduleId: "pulse-drive", cost: 0, duration: 60, priority: "normal", createdAt: currentMinute });

    tick(10, 10);

    const afterModule = useShipStore.getState().modules.find((entry) => entry.id === "pulse-drive");
    expect(afterModule.level).toBe(beforeLevel + 1);

    // The legacy queue was never written to by this flow.
    expect(useShipStore.getState().installationQueue).toEqual([]);
  });

  it("never double-completes a stale/leftover legacy queue entry via the tick path", () => {
    // Simulate an old save where legacyMigrationVersion is already current
    // (migration already ran once) but somehow a legacy entry is still
    // sitting in crewStore.trainingQueue. Before this refactor, gameClock
    // called crewStore.completeReadyTraining() on every tick and would have
    // completed this entry (a second, legacy-path completion). Now nothing
    // in the tick path reads or writes crewStore.trainingQueue at all.
    useJobStore.setState({ legacyMigrationVersion: 3 });
    const member = useCrewStore.getState().crew.find((entry) => entry.alive);
    const beforeStats = { ...member.stats };
    const currentMinute = useGameStore.getState().currentMinute;
    const staleEntry = { id: "stale-legacy-entry", memberId: member.id, statKey: "piloting", completeAt: currentMinute - 1, cost: 0, duration: 10, priority: "normal", startedAt: currentMinute - 11 };

    useCrewStore.setState({ trainingQueue: [staleEntry] });

    tick(10, 1);

    const after = useCrewStore.getState().crew.find((entry) => entry.id === member.id);
    expect(after.stats.piloting ?? 0).toBe(beforeStats.piloting ?? 0);
    // Untouched — proves the tick path no longer filters/consumes this array.
    expect(useCrewStore.getState().trainingQueue).toEqual([staleEntry]);
  });

  it("round-trips a job's priority through the legacy string view, TaskQueuePanel's cycling helper, and back", () => {
    // Regression test for the Phase 18-B legacy-view bug: jobToLegacy* used to
    // export jobStore's numeric JOB_PRIORITY value directly, which downstream
    // consumers (TaskQueuePanel/priorities.js) don't understand and silently
    // demote to "normal". This pins down that the full cycle — enqueue with a
    // string priority, read it back as a string from the legacy view, advance
    // it with getNextPriority, write it back via setJobPriority, and read the
    // legacy view again — stays in the string vocabulary end to end.
    const member = useCrewStore.getState().crew.find((entry) => entry.alive);
    const currentMinute = useGameStore.getState().currentMinute;

    const jobId = useJobStore.getState().enqueueTreatment({ memberId: member.id, injury: "경상", cost: 0, duration: 60, priority: "high", createdAt: currentMinute }).id;

    const legacyBefore = activeLegacyJobs(useJobStore.getState().jobs, jobToLegacyTreatment).find((task) => task.id === jobId);
    expect(legacyBefore.priority).toBe("high");

    const nextPriority = getNextPriority(legacyBefore.priority);
    expect(nextPriority).toBe("normal");

    useJobStore.getState().setJobPriority(jobId, nextPriority);

    const legacyAfter = activeLegacyJobs(useJobStore.getState().jobs, jobToLegacyTreatment).find((task) => task.id === jobId);
    expect(legacyAfter.priority).toBe("normal");
  });
});
