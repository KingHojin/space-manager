import { POWER } from "../data/constants";

export function reactorCapacity(shipGrade, engineeringTier = 1) {
  const base = POWER.reactorBaseByGrade[shipGrade] ?? POWER.reactorBaseByGrade.shuttle;
  return base + (engineeringTier - 1) * POWER.reactorPerEngineeringTier;
}

export function modulePowerCost(module) {
  return POWER.moduleCostByRarity[module?.rarity] ?? 1;
}

export function totalPowerDraw(installedModules = []) {
  return installedModules.reduce((sum, module) => sum + modulePowerCost(module), 0);
}

export function canFitPower(installedModules, incomingModule, replacingModule, capacity) {
  const currentDraw = totalPowerDraw(installedModules) - (replacingModule ? modulePowerCost(replacingModule) : 0);
  return currentDraw + modulePowerCost(incomingModule) <= capacity;
}
