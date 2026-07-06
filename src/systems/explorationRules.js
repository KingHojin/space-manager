import { EXPLORATION_FUEL, EXPLORATION_REWARD, EXPLORATION_YIELD, ZONE_DEPLETION } from "../data/constants";

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function getExplorationProfile(zone) {
  return EXPLORATION_YIELD[zone?.type] ?? EXPLORATION_YIELD.unknown;
}

export function zoneHasYield(zone) {
  return (getExplorationProfile(zone)?.baseRolls ?? 0) > 0;
}

export function getZoneMaxYield(zone) {
  if (!zoneHasYield(zone)) return 0;
  const richness = Math.max(0, numeric(zone?.richness, 1));
  const raw = ZONE_DEPLETION.defaultYield + Math.floor(richness * ZONE_DEPLETION.richnessYieldBonus);
  return clamp(raw, 1, ZONE_DEPLETION.maxYield);
}

export function normalizeZoneRuntime(zone, runtime = {}) {
  const maxYield = getZoneMaxYield(zone);
  const remaining = runtime.remainingYield ?? maxYield;
  return {
    explored: Boolean(runtime.explored),
    remainingYield: clamp(numeric(remaining, maxYield), 0, maxYield),
    lastExploredAt: runtime.lastExploredAt ?? null,
  };
}

export function refreshZoneRuntimeIfNeeded(zone, runtime = {}, currentMinute = 0) {
  const normalized = normalizeZoneRuntime(zone, runtime);
  const maxYield = getZoneMaxYield(zone);
  if (maxYield <= 0) return normalized;
  if (normalized.remainingYield > 0) return normalized;
  if (!ZONE_DEPLETION.regenCooldownMin) return normalized;
  if (normalized.lastExploredAt === null || normalized.lastExploredAt === undefined) return normalized;
  const elapsed = currentMinute - normalized.lastExploredAt;
  if (elapsed < ZONE_DEPLETION.regenCooldownMin) return normalized;
  return { ...normalized, remainingYield: maxYield };
}

export function canExploreZone(zone, runtime = {}, currentMinute = 0) {
  if (!zone?.id) return { ok: false, reason: "missingZone" };
  const refreshed = refreshZoneRuntimeIfNeeded(zone, runtime, currentMinute);
  if (!zoneHasYield(zone)) return { ok: true, reason: null, runtime: refreshed, noYield: true };
  if (refreshed.remainingYield <= 0) return { ok: false, reason: "depleted", runtime: refreshed };
  return { ok: true, reason: null, runtime: refreshed, noYield: false };
}

export function consumeZoneYield(zone, runtime = {}, currentMinute = 0, amount = 1) {
  const refreshed = refreshZoneRuntimeIfNeeded(zone, runtime, currentMinute);
  if (!zoneHasYield(zone)) return { ...refreshed, explored: true, lastExploredAt: currentMinute };
  return {
    ...refreshed,
    explored: true,
    remainingYield: clamp(refreshed.remainingYield - amount, 0, getZoneMaxYield(zone)),
    lastExploredAt: currentMinute,
  };
}

export function explorationFuelCost(zone) {
  if (!zoneHasYield(zone)) return 0;
  const danger = Math.max(0, numeric(zone?.danger, 1));
  return Math.round((EXPLORATION_FUEL.exploreCost + danger * EXPLORATION_REWARD.fuelPenaltyPerDanger) * 10) / 10;
}

export function explorationCooldownRemaining(runtime = {}, currentMinute = 0) {
  if (!ZONE_DEPLETION.regenCooldownMin || runtime.lastExploredAt === null || runtime.lastExploredAt === undefined) return 0;
  return Math.max(0, Math.ceil(ZONE_DEPLETION.regenCooldownMin - (currentMinute - runtime.lastExploredAt)));
}

export function explorationBlockLabel(reason) {
  if (reason === "depleted") return "이미 훑은 구역입니다";
  if (reason === "missingZone") return "탐험할 구역이 없습니다";
  return "탐험 불가";
}
