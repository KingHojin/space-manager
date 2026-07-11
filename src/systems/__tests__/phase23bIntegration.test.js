import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCombatState, resolveCombatRound } from "../combatEngine";
import { getSkillEffects } from "../skillEffects";
import { useCrewStore } from "../../stores/crewStore";
import { useNavStore } from "../../stores/navStore";
import { useGameStore } from "../../stores/gameStore";
import { useJobStore } from "../../stores/jobStore";
import { useSkillStore } from "../../stores/skillStore";
import { processTimedJobs } from "../gameClock";
import { starterSkillLevels } from "../../data/skills";

describe("Phase 23-B caller integration", () => {
  let crewSnapshot;
  let navSnapshot;

  beforeEach(() => {
    crewSnapshot = useCrewStore.getState().crew;
    navSnapshot = useNavStore.getState();
  });

  afterEach(() => {
    useCrewStore.setState({ crew: crewSnapshot });
    useNavStore.setState(navSnapshot, true);
    vi.restoreAllMocks();
  });

  it("combat changes actual outgoing damage but not the supplied combat power", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const enemy = { id: "test", name: "표적", hull: 999, shield: 999, power: 1, reward: 0, risk: 1 };
    const base = resolveCombatRound({ directive: "attack", combat: createCombatState(enemy), power: 80, skillEffects: getSkillEffects({ "combat-targeting": 0 }) });
    const boosted = resolveCombatRound({ directive: "attack", combat: createCombatState(enemy), power: 80, skillEffects: getSkillEffects({ "combat-targeting": 3 }) });
    expect(boosted.combat.lastDamage).toBeGreaterThan(base.combat.lastDamage);
  });

  it("route preview equals persisted travel fuel and tick burns that persisted total only once", () => {
    const state = useNavStore.getState();
    const target = state.sector.nodes.find((node) => state.sector.nodes.find((current) => current.id === state.currentNodeId)?.connections?.includes(node.id));
    const effects = getSkillEffects({ "engineering-efficiency": 3 });
    const preview = state.previewRoute(target.id, 0, effects);
    expect(preview.ok).toBe(true);
    const planned = state.planRoute(target.id, 0, {}, effects);
    expect(planned.travel.fuelCost).toBeCloseTo(preview.fuelCost);
    const tick = useNavStore.getState().tickTravel(planned.travel.duration + 500, planned.travel.completeAt + 500);
    const burned = -(tick.effects.find((effect) => effect.kind === "fuel")?.delta ?? 0);
    expect(burned).toBeCloseTo(planned.travel.fuelCost);
  });

  it("keeps the discounted leg cost after a save-style state reload and an overshooting tick", () => {
    const state = useNavStore.getState();
    const target = state.sector.nodes.find((node) => state.sector.nodes.find((current) => current.id === state.currentNodeId)?.connections?.includes(node.id));
    const effects = getSkillEffects({ "engineering-efficiency": 3 });
    const planned = state.planRoute(target.id, 10, {}, effects);
    const persistedTravel = structuredClone(planned.travel);
    useNavStore.setState({ travel: null });
    useNavStore.setState({ travel: persistedTravel });
    const tick = useNavStore.getState().tickTravel(planned.travel.duration + 999, planned.travel.completeAt + 999);
    const burned = -(tick.effects.find((effect) => effect.kind === "fuel")?.delta ?? 0);
    expect(burned).toBeCloseTo(planned.travel.fuelCost);
  });

  it("training composes skill outcome with permanent fatigue trait exactly once and keeps stat +1", () => {
    const member = useCrewStore.getState().crew.find((entry) => entry.alive && entry.role !== "engineer");
    const statKey = Object.keys(member.stats)[0];
    useCrewStore.setState((state) => ({ crew: state.crew.map((entry) => entry.id === member.id ? { ...entry, fatigue: 0, experience: 0, injury: { state: "healthy", permanentTraits: ["chronic_fatigue"] } } : entry) }));
    useCrewStore.getState().completeTrainingJob({ memberId: member.id, statKey, skillEffects: getSkillEffects({ "command-crew-drill": 3 }).training });
    const after = useCrewStore.getState().crew.find((entry) => entry.id === member.id);
    expect(after.stats[statKey]).toBe(member.stats[statKey] + 1);
    expect(after.experience).toBe(11);
    expect(after.fatigue).toBeCloseTo(10.2 * 1.3);
  });
});

describe("Phase 23-B real clock completion paths", () => {
  let gameSnapshot;
  let jobSnapshot;
  let crewSnapshot;
  let skillSnapshot;

  beforeEach(() => {
    gameSnapshot = useGameStore.getState();
    jobSnapshot = useJobStore.getState();
    crewSnapshot = useCrewStore.getState();
    skillSnapshot = useSkillStore.getState();
    useJobStore.setState({ jobs: [], legacyMigrationVersion: 3 });
  });

  afterEach(() => {
    useGameStore.setState(gameSnapshot, true);
    useJobStore.setState(jobSnapshot, true);
    useCrewStore.setState(crewSnapshot, true);
    useSkillStore.setState(skillSnapshot, true);
  });

  it("applies repair and training effects through processTimedJobs exactly once", () => {
    const now = useGameStore.getState().currentMinute;
    const member = useCrewStore.getState().crew.find((entry) => entry.alive && entry.role !== "engineer");
    const statKey = Object.keys(member.stats)[0];
    useGameStore.setState((state) => ({ resources: { ...state.resources, hull: 40 } }));
    useCrewStore.setState((state) => ({ crew: state.crew.map((entry) => entry.id === member.id ? { ...entry, fatigue: 0, experience: 0 } : entry) }));
    useSkillStore.setState((state) => ({ levels: { ...state.levels, "engineering-repair": 3, "command-crew-drill": 3 } }));
    useJobStore.getState().enqueueShipWork({ type: "hullRepair", roomId: "engineering", duration: 1, createdAt: now, payload: { hullDelta: 8 } });
    useJobStore.getState().enqueueTraining({ memberId: member.id, statKey, duration: 1, createdAt: now });
    processTimedJobs(0);
    useGameStore.getState().advanceMinutes(10);
    processTimedJobs(10);
    useGameStore.getState().advanceMinutes(1);
    processTimedJobs(1);
    processTimedJobs(0);
    const after = useCrewStore.getState().crew.find((entry) => entry.id === member.id);
    expect(useGameStore.getState().resources.hull).toBe(51);
    expect(after.stats[statKey]).toBe(member.stats[statKey] + 1);
    expect(after.experience).toBe(11);
    processTimedJobs(1);
    expect(useGameStore.getState().resources.hull).toBe(51);
    expect(useCrewStore.getState().crew.find((entry) => entry.id === member.id).experience).toBe(11);
  });

  it("keeps starter doctrines free while reset refunds initial and earned points", () => {
    useSkillStore.setState({ availablePoints: 3, earnedPoints: 0, levels: { ...starterSkillLevels } });
    useSkillStore.getState().grantPoint(2);
    expect(useSkillStore.getState().upgradeSkill("combat-targeting")).toBe(true);
    expect(useSkillStore.getState()).toMatchObject({ availablePoints: 4, earnedPoints: 2 });
    useSkillStore.getState().applyValidatedReset(0);
    expect(useSkillStore.getState()).toMatchObject({ availablePoints: 5, earnedPoints: 2, levels: starterSkillLevels });
  });
});
