import { describe, expect, it } from "vitest";
import { applyCombatCasualtyWithJobs } from "../gameClock";
import { useCrewStore } from "../../stores/crewStore";
import { useGameStore } from "../../stores/gameStore";
import { useJobStore } from "../../stores/jobStore";

// Round 20, bug fix 2: Combat.jsx and Exploration.jsx both called
// crewStore.applyCombatCasualty() directly on a crew death, which never
// touched jobStore — a dead crew member's in-progress training/treatment/
// recovery job (and the room slot it occupies) survived until an eventual
// no-op completion (crewStore's complete*Job handlers guard on member.alive).
// applyCombatCasualtyWithJobs is the gameClock-level orchestration wrapper
// (crewStore can't import jobStore directly) both panels now call instead;
// this pins down that a "전사" (killed) casualty force-cancels the victim's
// active jobStore jobs while leaving everyone else's jobs alone.

describe("applyCombatCasualtyWithJobs", () => {
  it("전사 (killed) casualty: cancels the victim's in_progress job and frees the room slot", () => {
    const currentMinute = useGameStore.getState().currentMinute;
    const member = useCrewStore.getState().crew.find((entry) => entry.alive);
    const job = useJobStore.getState().enqueueTraining({ memberId: member.id, statKey: "piloting", duration: 60, createdAt: currentMinute });
    useJobStore.setState((state) => ({ jobs: state.jobs.map((entry) => (entry.id === job.id ? { ...entry, status: "in_progress", assignedCrewId: member.id, startedAt: currentMinute } : entry)) }));
    useJobStore.getState().recomputeRoomLoad();
    expect(useJobStore.getState().rooms.living.activeJobIds).toContain(job.id);

    const cancelled = applyCombatCasualtyWithJobs({ memberId: member.id, injury: "전사", morale: -3 });

    expect(cancelled.map((entry) => entry.id)).toEqual([job.id]);
    expect(useCrewStore.getState().crew.find((entry) => entry.id === member.id).alive).toBe(false);
    const afterJob = useJobStore.getState().jobs.find((entry) => entry.id === job.id);
    expect(afterJob.status).toBe("failed");
    expect(useJobStore.getState().rooms.living.activeJobIds).not.toContain(job.id);
  });

  it("non-fatal injury (경상): leaves the crew member's active job running untouched", () => {
    const currentMinute = useGameStore.getState().currentMinute;
    const member = useCrewStore.getState().crew.find((entry) => entry.alive && entry.id !== "captain-yun") ?? useCrewStore.getState().crew.find((entry) => entry.alive);
    const job = useJobStore.getState().enqueueTraining({ memberId: member.id, statKey: "piloting", duration: 60, createdAt: currentMinute });
    useJobStore.setState((state) => ({ jobs: state.jobs.map((entry) => (entry.id === job.id ? { ...entry, status: "in_progress", assignedCrewId: member.id, startedAt: currentMinute } : entry)) }));
    useJobStore.getState().recomputeRoomLoad();

    const cancelled = applyCombatCasualtyWithJobs({ memberId: member.id, injury: "경상", morale: -1 });

    expect(cancelled).toEqual([]);
    expect(useCrewStore.getState().crew.find((entry) => entry.id === member.id).alive).toBe(true);
    expect(useJobStore.getState().jobs.find((entry) => entry.id === job.id).status).toBe("in_progress");
  });

  it("does not touch another crew member's active job when a different member is killed", () => {
    const currentMinute = useGameStore.getState().currentMinute;
    const [victim, bystander] = useCrewStore.getState().crew.filter((entry) => entry.alive);
    expect(victim).toBeTruthy();
    expect(bystander).toBeTruthy();

    const bystanderJob = useJobStore.getState().enqueueTraining({ memberId: bystander.id, statKey: "piloting", duration: 60, createdAt: currentMinute });
    useJobStore.setState((state) => ({ jobs: state.jobs.map((entry) => (entry.id === bystanderJob.id ? { ...entry, status: "in_progress", assignedCrewId: bystander.id, startedAt: currentMinute } : entry)) }));
    useJobStore.getState().recomputeRoomLoad();

    applyCombatCasualtyWithJobs({ memberId: victim.id, injury: "전사", morale: -3 });

    expect(useJobStore.getState().jobs.find((entry) => entry.id === bystanderJob.id).status).toBe("in_progress");
    expect(useCrewStore.getState().crew.find((entry) => entry.id === bystander.id).alive).toBe(true);
  });
});
