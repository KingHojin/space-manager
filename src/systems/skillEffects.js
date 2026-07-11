const MAX_SKILL_LEVEL = 3;

export function clampSkillLevel(level) {
  const numeric = Number.isFinite(Number(level)) ? Math.floor(Number(level)) : 0;
  return Math.min(MAX_SKILL_LEVEL, Math.max(0, numeric));
}

export function getSkillEffects(levels = {}) {
  const combat = clampSkillLevel(levels["combat-targeting"]);
  const navigation = clampSkillLevel(levels["engineering-efficiency"]);
  const repair = clampSkillLevel(levels["engineering-repair"]);
  const training = clampSkillLevel(levels["command-crew-drill"]);
  const contract = clampSkillLevel(levels["diplomacy-contract"]);
  return {
    combat: { level: combat, outgoingDamageMultiplier: 1 + combat * 0.06 },
    navigation: { level: navigation, fuelCostMultiplier: 1 - navigation * 0.05 },
    repair: { level: repair, hullRepairMultiplier: 1 + repair * 0.12 },
    training: { level: training, experienceFlatBonus: training, fatigueMultiplier: 1 - training * 0.05 },
    mission: { level: contract, payoutMultiplier: 1 + contract * 0.08 },
  };
}

export function applyOutgoingDamage(baseDamage, effects = {}) {
  return Math.max(0, Math.round((baseDamage ?? 0) * (effects.outgoingDamageMultiplier ?? 1)));
}

export function applyNavigationFuelCost(baseFuelCost, effects = {}) {
  return Math.max(2, (baseFuelCost ?? 0) * (effects.fuelCostMultiplier ?? 1));
}

export function applyHullRepair(baseHullDelta, effects = {}) {
  return Math.max(0, Math.round((baseHullDelta ?? 0) * (effects.hullRepairMultiplier ?? 1)));
}

export function applyTrainingOutcome({ experience = 0, fatigue = 0 } = {}, effects = {}) {
  return {
    experience: Math.max(0, Math.round(experience) + (effects.experienceFlatBonus ?? 0)),
    fatigue: Math.max(0, fatigue * (effects.fatigueMultiplier ?? 1)),
  };
}

const ELIGIBLE_MISSION_REWARDS = new Set(["credits", "dust", "scrap", "salvage-scrap", "tritanium", "ore-sample"]);

export function applyMissionPayout(reward = {}, effects = {}) {
  const multiplier = effects.payoutMultiplier ?? 1;
  return Object.fromEntries(Object.entries(reward).map(([key, value]) => [
    key,
    ELIGIBLE_MISSION_REWARDS.has(key) && typeof value === "number" ? Math.round(value * multiplier) : value,
  ]));
}
