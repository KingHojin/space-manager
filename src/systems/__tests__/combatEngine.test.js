import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ENEMY_FLEETS,
  autoAssignTacticalCrew,
  calculateCombatPower,
  calculateTacticalCrewBonus,
  createCombatState,
  pickEnemyFleet,
  resolveCombatRound,
} from "../combatEngine";

afterEach(() => {
  vi.restoreAllMocks();
});

function crewMember(overrides = {}) {
  return {
    id: "m1",
    alive: true,
    role: "포탑",
    fatigue: 10,
    morale: "보통",
    injury: "healthy",
    stats: { gunnery: 10, engineering: 5, piloting: 5, scouting: 5, medicine: 5 },
    ...overrides,
  };
}

describe("calculateCombatPower", () => {
  it("sums module attack/defense/control and crew stat contributions", () => {
    const modules = [{ stats: { attack: 10, defense: 5, control: 4 } }];
    const crew = [crewMember()];
    const power = calculateCombatPower({ modules, crew, activeCards: [] });
    expect(power).toBeGreaterThan(0);
    expect(Number.isInteger(power)).toBe(true);
  });

  it("excludes dead crew members from the crew power sum", () => {
    const modules = [{ stats: { attack: 0, defense: 0, control: 0 } }];
    const aliveOnly = calculateCombatPower({ modules, crew: [crewMember({ id: "a" })], activeCards: [] });
    const withDead = calculateCombatPower({ modules, crew: [crewMember({ id: "a" }), crewMember({ id: "b", alive: false, stats: { gunnery: 999, engineering: 0, piloting: 0, scouting: 0 } })], activeCards: [] });
    expect(withDead).toBe(aliveOnly);
  });

  it("never returns below 1 even with all-zero inputs", () => {
    const power = calculateCombatPower({ modules: [], crew: [], activeCards: [] });
    expect(power).toBe(1);
  });

  it("penalizes an injured (non-healthy) crew member's contribution", () => {
    const modules = [{ stats: { attack: 0, defense: 0, control: 0 } }];
    const healthy = calculateCombatPower({ modules, crew: [crewMember({ injury: "healthy" })], activeCards: [] });
    const injured = calculateCombatPower({ modules, crew: [crewMember({ injury: "경상" })], activeCards: [] });
    expect(injured).toBeLessThan(healthy);
  });
});

describe("pickEnemyFleet", () => {
  it("only returns fleets whose risk is <= max(2, danger + 1)", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const danger = 1;
    const fleet = pickEnemyFleet(danger);
    expect(fleet.risk).toBeLessThanOrEqual(Math.max(2, danger + 1));
  });

  it("expands the eligible pool as danger increases", () => {
    const lowPool = ENEMY_FLEETS.filter((fleet) => fleet.risk <= Math.max(2, 1 + 1));
    const highPool = ENEMY_FLEETS.filter((fleet) => fleet.risk <= Math.max(2, 6 + 1));
    expect(highPool.length).toBeGreaterThanOrEqual(lowPool.length);
  });

  it("falls back to the first fleet definition if the pool would somehow be empty", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    // danger so low the filtered pool is still non-empty in practice (min risk fleets have risk 1),
    // this just asserts a real fleet object is always returned.
    const fleet = pickEnemyFleet(0);
    expect(fleet).toBeTruthy();
    expect(fleet.id).toBeTruthy();
  });
});

describe("createCombatState", () => {
  it("initializes round 1, engaged status, and copies enemy hull/shield into hullNow/shieldNow", () => {
    const enemy = ENEMY_FLEETS[0];
    const state = createCombatState(enemy);
    expect(state.round).toBe(1);
    expect(state.status).toBe("engaged");
    expect(state.enemy.hullNow).toBe(enemy.hull);
    expect(state.enemy.shieldNow).toBe(enemy.shield);
    expect(state.enemy.subsystems).toEqual({ weaponsDisrupted: 0, engineDisrupted: 0, shieldCracked: 0 });
  });
});

describe("autoAssignTacticalCrew", () => {
  it("assigns each station a distinct crew member when roles match", () => {
    const crew = [
      crewMember({ id: "bridge-1", role: "함교", stats: { piloting: 20, gunnery: 1, engineering: 1, medicine: 1, scouting: 1 } }),
      crewMember({ id: "gun-1", role: "포탑", stats: { gunnery: 20, piloting: 1, engineering: 1, medicine: 1, scouting: 1 } }),
      crewMember({ id: "eng-1", role: "기관실", stats: { engineering: 20, gunnery: 1, piloting: 1, medicine: 1, scouting: 1 } }),
      crewMember({ id: "med-1", role: "의무실", stats: { medicine: 20, gunnery: 1, piloting: 1, engineering: 1, scouting: 1 } }),
    ];
    const assignments = autoAssignTacticalCrew(crew);
    expect(assignments).toEqual({ bridge: "bridge-1", gunnery: "gun-1", engineering: "eng-1", medbay: "med-1" });
  });

  it("never assigns the same crew member to two stations, falling back when roles are scarce", () => {
    const crew = [crewMember({ id: "only-one", role: "포탑" })];
    const assignments = autoAssignTacticalCrew(crew);
    const assignedIds = Object.values(assignments).filter(Boolean);
    expect(new Set(assignedIds).size).toBe(assignedIds.length);
  });

  it("excludes dead crew members", () => {
    const crew = [crewMember({ id: "dead-1", alive: false })];
    const assignments = autoAssignTacticalCrew(crew);
    expect(Object.values(assignments).every((id) => id !== "dead-1")).toBe(true);
  });
});

describe("calculateTacticalCrewBonus", () => {
  it("returns neutral multipliers (damageMul=1, takenMul=1) with no crew assigned", () => {
    const bonus = calculateTacticalCrewBonus({ crew: [], assignments: {} });
    expect(bonus.damageMul).toBe(1);
    expect(bonus.takenMul).toBe(1);
    expect(bonus.labels).toEqual([]);
  });

  it("increases damageMul when a gunner is assigned to gunnery", () => {
    const gunner = crewMember({ id: "g1", role: "포탑", stats: { gunnery: 200, piloting: 0, engineering: 0, medicine: 0, scouting: 0 } });
    const bonus = calculateTacticalCrewBonus({ crew: [gunner], assignments: { gunnery: "g1" } });
    expect(bonus.damageMul).toBeGreaterThan(1);
    expect(bonus.labels.length).toBeGreaterThan(0);
  });
});

describe("resolveCombatRound", () => {
  it("returns an error-ish state immediately when combat is not engaged", () => {
    const result = resolveCombatRound({ directive: "attack", combat: { status: "won" }, power: 50 });
    expect(result.logs).toEqual(["교전 대상이 없습니다."]);
    expect(result.resourceChanges).toEqual({});
    expect(result.loot).toBeNull();
  });

  it("applies damage deterministically and reports status won with reward/loot when hull drops to 0", () => {
    vi.spyOn(Math, "random").mockReturnValue(0); // roll(min,max) collapses to min every call
    const enemy = { ...ENEMY_FLEETS[0], hull: 1, shield: 0 }; // guarantee a one-shot kill
    const combat = createCombatState(enemy);
    const result = resolveCombatRound({ directive: "attack", combat, power: 500, targetId: "hull" });
    expect(result.combat.status).toBe("won");
    expect(result.combat.enemy.hullNow).toBe(0);
    expect(result.resourceChanges.credits).toBe(enemy.reward);
    expect(result.loot).toEqual({ itemId: enemy.lootItemId, qty: enemy.lootItemQty ?? 1 });
  });

  it("decays existing enemy subsystem timers by 1 turn and reflects them in the next state", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.999); // avoid killing the enemy or triggering retreat luck
    const enemy = { ...ENEMY_FLEETS[3], hull: 999, shield: 999 };
    const combat = { ...createCombatState(enemy), enemy: { ...createCombatState(enemy).enemy, subsystems: { weaponsDisrupted: 2, engineDisrupted: 0, shieldCracked: 0 } } };
    const result = resolveCombatRound({ directive: "attack", combat, power: 10, targetId: "hull" });
    // weaponsDisrupted decays from 2 -> 1, then target=hull doesn't re-apply weaponsDisrupted, so it stays at 1.
    expect(result.combat.enemy.subsystems.weaponsDisrupted).toBe(1);
  });

  it("applying a subsystem-targeted attack sets that subsystem's duration on the enemy", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.999);
    const enemy = { ...ENEMY_FLEETS[3], hull: 999, shield: 999 };
    const combat = createCombatState(enemy);
    const result = resolveCombatRound({ directive: "attack", combat, power: 10, targetId: "weapons" });
    expect(result.combat.enemy.subsystems.weaponsDisrupted).toBeGreaterThan(0);
  });

  it("increments the round counter when the fight continues (no win, no retreat)", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.999);
    const enemy = { ...ENEMY_FLEETS[3], hull: 999, shield: 999 };
    const combat = createCombatState(enemy);
    const result = resolveCombatRound({ directive: "attack", combat, power: 10, targetId: "hull" });
    expect(result.combat.status).toBe("engaged");
    expect(result.combat.round).toBe(combat.round + 1);
  });
});
