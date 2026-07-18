import { describe, expect, it, vi } from "vitest";
import { ENEMY_FLEETS, autoAssignTacticalCrew, buildTacticalStationSnapshot, calculateTacticalCrewBonus, createCombatState, resolveCombatRound } from "../combatEngine";
import { getJobDurationForCrew } from "../jobDuration";
import { explainBacklogReason, scheduleJobs } from "../jobScheduler";
import { getCrewWorkContext, prepareCrewWorkSnapshot, projectCrewWorkDuration } from "../crewWorkProjection";
import { useJobStore } from "../../stores/jobStore";
import { useCrewStore } from "../../stores/crewStore";
import { useGameStore } from "../../stores/gameStore";
import { useSkillStore } from "../../stores/skillStore";
import { STARTER_EQUIPMENT } from "../../data/crewEquipment";
import { processTimedJobs } from "../gameClock";

const crew = [
  { id: "eng", name: "민", role: "기관실", alive: true, fatigue: 0, injury: "healthy", specialtyId: "bypass-wiring", specialtyState: {}, stats: { engineering: 18, gunnery: 2, piloting: 2, medicine: 2, scouting: 2 } },
  { id: "gun", name: "강", role: "포탑", alive: true, fatigue: 0, injury: "healthy", stats: { engineering: 2, gunnery: 18, piloting: 2, medicine: 2, scouting: 2 } },
  { id: "med", name: "로", role: "의무실", alive: true, fatigue: 0, injury: "healthy", stats: { engineering: 2, gunnery: 2, piloting: 2, medicine: 18, scouting: 2 } },
  { id: "bridge", name: "윤", role: "함교", alive: true, fatigue: 0, injury: "healthy", stats: { engineering: 2, gunnery: 2, piloting: 18, medicine: 2, scouting: 2 } },
];

describe("Phase 27-B crew station and ordinary-job snapshots", () => {
  it("uses an immutable effective station snapshot, including an equipped engineering tool", () => {
    const equipment = STARTER_EQUIPMENT.map((entry) => ({ ...entry, ownerCrewId: entry.instanceId === "eq-starter-torque" ? "eng" : null }));
    const assignments = autoAssignTacticalCrew(crew, equipment);
    const snapshot = buildTacticalStationSnapshot({ crew, equipmentInstances: equipment, assignments, mode: "auto" });
    const first = calculateTacticalCrewBonus({ stationSnapshot: snapshot });
    expect(snapshot.stations.engineering.profile.effective).toBe(18);
    expect(snapshot.stations.engineering.gear.takenReduction).toBe(0.01);
    expect(first.takenMul).toBeLessThan(1);
    const exhaustedLiveCrew = crew.map((member) => ({ ...member, fatigue: 99 }));
    expect(calculateTacticalCrewBonus({ stationSnapshot: snapshot })).toMatchObject({ damageMul: first.damageMul, takenMul: first.takenMul });
    expect(exhaustedLiveCrew[0].fatigue).toBe(99);
  });

  it("gives below, assist, standard, and expert stations distinct deterministic round modifiers", () => {
    const makeGunner = (gunnery) => [{ ...crew[1], stats: { ...crew[1].stats, gunnery } }];
    const below = calculateTacticalCrewBonus({ stationSnapshot: buildTacticalStationSnapshot({ crew: makeGunner(9), assignments: { gunnery: "gun" } }) });
    const assist = calculateTacticalCrewBonus({ stationSnapshot: buildTacticalStationSnapshot({ crew: makeGunner(12), assignments: { gunnery: "gun" } }) });
    const standard = calculateTacticalCrewBonus({ stationSnapshot: buildTacticalStationSnapshot({ crew: makeGunner(14), assignments: { gunnery: "gun" } }) });
    const expert = calculateTacticalCrewBonus({ stationSnapshot: buildTacticalStationSnapshot({ crew: makeGunner(18), assignments: { gunnery: "gun" } }) });
    expect(below.damageMul).toBeLessThan(standard.damageMul);
    expect(assist.damageMul).toBeGreaterThan(below.damageMul);
    expect(assist.damageMul).toBeLessThan(standard.damageMul);
    expect(expert.damageMul).toBeGreaterThan(standard.damageMul);
    expect(expert.stationSnapshot.stations.gunnery.tier).toBe("expert");
  });

  it("auto assignment follows the canonical effective profile when injury changes the best candidate", () => {
    const candidates = [
      { ...crew[1], id: "hurt", stats: { ...crew[1].stats, gunnery: 18 }, injury: "경상" },
      { ...crew[1], id: "steady", stats: { ...crew[1].stats, gunnery: 17 }, injury: "healthy" },
    ];
    expect(autoAssignTacticalCrew(candidates).gunnery).toBe("steady");
  });

  it("rejects duplicate manual placements in the saved station snapshot", () => {
    const snapshot = buildTacticalStationSnapshot({ crew, assignments: { bridge: "gun", gunnery: "gun" }, mode: "manual" });
    expect(snapshot.stations.bridge.crewId).toBe("gun");
    expect(snapshot.stations.gunnery.crewId).toBeNull();
    expect(calculateTacticalCrewBonus({ stationSnapshot: snapshot }).labels).toHaveLength(1);
  });

  it("keeps every round modifier fixed when live crew, gear, or assignments mutate after combat starts", () => {
    const snapshot = buildTacticalStationSnapshot({ crew, assignments: autoAssignTacticalCrew(crew), mode: "auto" });
    const frozenBonus = calculateTacticalCrewBonus({ stationSnapshot: snapshot });
    const combat = createCombatState({ ...ENEMY_FLEETS[3], hull: 999, shield: 999 }, { stationSnapshot: snapshot });
    vi.spyOn(Math, "random").mockReturnValue(0.999);
    const first = resolveCombatRound({ directive: "attack", combat, power: 80, tacticalCrewBonus: frozenBonus });
    const mutatedCrew = crew.map((member) => ({ ...member, fatigue: 99, injury: "중상" }));
    const liveMutatedBonus = calculateTacticalCrewBonus({ crew: mutatedCrew, assignments: {} });
    const replay = resolveCombatRound({ directive: "attack", combat, power: 80, tacticalCrewBonus: calculateTacticalCrewBonus({ stationSnapshot: snapshot }) });
    expect(liveMutatedBonus).not.toMatchObject({ damageMul: frozenBonus.damageMul, takenMul: frozenBonus.takenMul });
    expect(replay).toMatchObject({ resourceChanges: first.resourceChanges, combat: { lastDamage: first.combat.lastDamage, lastTaken: first.combat.lastTaken } });
    vi.restoreAllMocks();
  });

  it("binds a normal hull job to its selected worker and snapshots specialty ETA/outcome", () => {
    const snapshot = prepareCrewWorkSnapshot({ jobType: "hull_repair", member: crew[0], equipmentInstances: STARTER_EQUIPMENT.map((entry) => ({ ...entry, ownerCrewId: entry.instanceId === "eq-starter-torque" ? "eng" : null })), sectorId: "sector:3", useSpecialty: true });
    expect(snapshot).toMatchObject({ ok: true, workerCrewId: "eng", specialty: { id: "bypass-wiring", durationMinutes: -30 }, outcome: { hullDelta: 2 } });
    expect(projectCrewWorkDuration(180, snapshot)).toBe(90); // torque -30, expert -30, specialty -30
    expect(getJobDurationForCrew({ duration: 180, payload: { workerSnapshot: snapshot } }, [])).toMatchObject({ effectiveDuration: 90 });
  });

  it("uses the shared 14 standard / 18 expert contract for every ordinary job", () => {
    ["hull_repair", "module_upgrade", "salvage", "decode"].forEach((jobType) => expect(getCrewWorkContext(jobType).threshold).toBe(14));
  });

  it("projects the 10–13 assist band as a distinct, modest ordinary-work ETA", () => {
    const assistant = { ...crew[0], stats: { ...crew[0].stats, engineering: 12 }, specialtyId: null };
    const snapshot = prepareCrewWorkSnapshot({ jobType: "hull_repair", member: assistant, sectorId: "sector:assist" });
    expect(snapshot.lead.tier).toBe("assist");
    expect(projectCrewWorkDuration(180, snapshot)).toBe(195);
  });

  it("never silently substitutes an unavailable explicit worker", () => {
    const job = { id: "repair", type: "hull_repair", roomId: "engineering", status: "backlog", priority: 1, createdAt: 0, payload: { workerCrewId: "eng" } };
    const rooms = { engineering: { slotCapacity: 1 } };
    const unavailable = crew.map((member) => member.id === "eng" ? { ...member, alive: false } : member);
    expect(scheduleJobs([job], rooms, unavailable, 0).results).toEqual([]);
    expect(explainBacklogReason(job, [job], rooms, unavailable)).toBe("지정 승무원 대기");
  });

  it("settles a snapped job once even when completion is checked again after reload-like state", () => {
    const previous = useJobStore.getState().jobs;
    useJobStore.setState({ jobs: [{ id: "once", type: "hull_repair", roomId: "engineering", status: "in_progress", assignedCrewId: "eng", duration: 1, effectiveDuration: 1, startedAt: 0, createdAt: 0, progress: 0, payload: { workerCrewId: "eng", workerSnapshot: { modifiers: { durationMinutes: 0 }, outcome: { hullDelta: 2 } } } }] });
    expect(useJobStore.getState().completeReadyJobs(2).map((job) => job.id)).toEqual(["once"]);
    expect(useJobStore.getState().completeReadyJobs(3)).toEqual([]);
    useJobStore.setState({ jobs: previous });
  });

  it("runs a selected ordinary worker through queue, reload-like state, ETA, and one snapped completion outcome", () => {
    const jobsBefore = useJobStore.getState();
    const crewBefore = useCrewStore.getState();
    const gameBefore = useGameStore.getState();
    const skillsBefore = useSkillStore.getState();
    try {
      const snapshot = prepareCrewWorkSnapshot({ jobType: "hull_repair", member: crew[0], equipmentInstances: STARTER_EQUIPMENT.map((entry) => ({ ...entry, ownerCrewId: entry.instanceId === "eq-starter-torque" ? "eng" : null })), sectorId: "sector:e2e", useSpecialty: true });
      const now = gameBefore.currentMinute;
      useJobStore.setState({ jobs: [], legacyMigrationVersion: 3 });
      useCrewStore.setState({ crew });
      useGameStore.setState((state) => ({ resources: { ...state.resources, hull: 40 } }));
      useSkillStore.setState((state) => ({ levels: { ...Object.fromEntries(Object.keys(state.levels).map((id) => [id, 0])), "engineering-repair": 3 } }));
      useJobStore.getState().enqueueShipWork({ type: "hullRepair", roomId: "engineering", duration: 180, createdAt: now, workerCrewId: "eng", workerSnapshot: snapshot, payload: { hullDelta: 8 } });
      processTimedJobs(0);
      useGameStore.getState().advanceMinutes(20); processTimedJobs(20);
      const started = useJobStore.getState().jobs[0];
      expect(started).toMatchObject({ status: "in_progress", assignedCrewId: "eng", effectiveDuration: 90, payload: { workerCrewId: "eng", workerSnapshot: { outcome: { hullDelta: 2 } } } });
      // Copying persisted job state must not recalculate the original ETA or outcome.
      useJobStore.setState({ jobs: structuredClone(useJobStore.getState().jobs) });
      useGameStore.getState().advanceMinutes(90); processTimedJobs(90);
      // Completion applies the live repair doctrine to the snapped 8+2 hull
      // result, matching the UI preview composition (10 * 1.4 = 14).
      expect(useGameStore.getState().resources.hull).toBe(54);
      processTimedJobs(1);
      expect(useGameStore.getState().resources.hull).toBe(54);
    } finally {
      useJobStore.setState(jobsBefore, true);
      useCrewStore.setState(crewBefore, true);
      useGameStore.setState(gameBefore, true);
      useSkillStore.setState(skillsBefore, true);
    }
  });
});
