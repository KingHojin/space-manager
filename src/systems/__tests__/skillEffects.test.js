import { describe, expect, it } from "vitest";
import {
  applyHullRepair,
  applyMissionPayout,
  applyNavigationFuelCost,
  applyOutgoingDamage,
  applyTrainingOutcome,
  clampSkillLevel,
  getSkillEffects,
} from "../skillEffects";

describe("Phase 23-B skill effects", () => {
  it.each([
    [0, 1, 1, 1, 0, 1],
    [1, 1.06, 0.95, 1.12, 1, 1.08],
    [2, 1.12, 0.9, 1.24, 2, 1.16],
    [3, 1.18, 0.85, 1.36, 3, 1.24],
  ])("derives level %i effects", (level, combat, fuel, repair, xp, payout) => {
    const effects = getSkillEffects({
      "combat-targeting": level,
      "engineering-efficiency": level,
      "engineering-repair": level,
      "command-crew-drill": level,
      "diplomacy-contract": level,
    });
    expect(effects.combat.outgoingDamageMultiplier).toBeCloseTo(combat);
    expect(effects.navigation.fuelCostMultiplier).toBeCloseTo(fuel);
    expect(effects.repair.hullRepairMultiplier).toBeCloseTo(repair);
    expect(effects.training.experienceFlatBonus).toBe(xp);
    expect(effects.training.fatigueMultiplier).toBeCloseTo(1 - level * 0.05);
    expect(effects.mission.payoutMultiplier).toBeCloseTo(payout);
  });

  it("clamps invalid levels", () => {
    expect([-2, null, undefined, "bad"].map(clampSkillLevel)).toEqual([0, 0, 0, 0]);
    expect(clampSkillLevel(99)).toBe(3);
    expect(clampSkillLevel(2.9)).toBe(2);
  });

  it("applies actual damage once and leaves combat power outside this transform", () => {
    expect(applyOutgoingDamage(100, getSkillEffects({ "combat-targeting": 2 }).combat)).toBe(112);
  });

  it("reduces route cost before enforcing minimum fuel 2", () => {
    const effects = getSkillEffects({ "engineering-efficiency": 3 }).navigation;
    expect(applyNavigationFuelCost(10, effects)).toBeCloseTo(8.5);
    expect(applyNavigationFuelCost(2.1, effects)).toBe(2);
  });

  it("rounds base repair 8 to 9/10/11 at levels 1/2/3", () => {
    expect([1, 2, 3].map((level) => applyHullRepair(8, getSkillEffects({ "engineering-repair": level }).repair))).toEqual([9, 10, 11]);
  });

  it("boosts training XP and reduces fatigue while stat gain remains a caller concern", () => {
    expect([0, 1, 2, 3].map((level) => applyTrainingOutcome({ experience: 8, fatigue: 12 }, getSkillEffects({ "command-crew-drill": level }).training).experience)).toEqual([8, 9, 10, 11]);
  });

  it("boosts only deterministic stackable common mission payouts without mutating base", () => {
    const reward = { credits: 101, dust: 50, scrap: 9, "salvage-scrap": 2, tritanium: 3, "ore-sample": 1, oreSample: 1, chartData: 2, researchData: 3, tradeVoucher: 4, reputation: 5, blueprintChance: 0.3, artifactChance: 0.2, recruitChance: 0.1, uniqueToken: 7, unknownNumeric: 99 };
    const result = applyMissionPayout(reward, getSkillEffects({ "diplomacy-contract": 2 }).mission);
    expect(result).toEqual({ ...reward, credits: 117, dust: 58, scrap: 10, "salvage-scrap": 2, tritanium: 3, "ore-sample": 1 });
    expect(reward.credits).toBe(101);
    expect(result).not.toBe(reward);
  });
});
