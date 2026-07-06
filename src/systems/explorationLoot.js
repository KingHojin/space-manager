import { EXPLORATION_REWARD, EXPLORATION_YIELD, SALVAGE_LOOT_TABLE } from "../data/constants";
import { explorationFuelCost, getExplorationProfile, zoneHasYield } from "./explorationRules";

const RARITY_RANK = { common: 1, uncommon: 2, rare: 3, epic: 4, legendary: 5 };

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function rngValue(rng) {
  return typeof rng === "function" ? rng() : Math.random();
}

function randomInt(min, max, rng) {
  const low = Math.ceil(min);
  const high = Math.floor(max);
  if (high <= low) return low;
  return low + Math.floor(rngValue(rng) * (high - low + 1));
}

function rarityDangerMultiplier(rarity, danger) {
  const rank = RARITY_RANK[rarity] ?? 1;
  if (rank < RARITY_RANK.rare) return 1;
  return 1 + Math.max(0, danger) * EXPLORATION_REWARD.rareBonusPerDanger * (rank - 1);
}

function tagMultiplier(entry, profile) {
  const zoneTags = new Set(profile.tags ?? []);
  const matched = (entry.tags ?? []).filter((tag) => zoneTags.has(tag)).length;
  if (matched <= 0) return Math.max(0.15, profile.itemWeight || profile.salvageWeight || 0.25);
  const salvageBoost = zoneTags.has("salvage") || zoneTags.has("wreck") || zoneTags.has("debris") ? profile.salvageWeight : 0;
  const itemBoost = profile.itemWeight ?? 0;
  return 1 + matched * 0.45 + salvageBoost * 0.25 + itemBoost * 0.2;
}

function weightedPick(entries, profile, danger, rng) {
  const weighted = entries.map((entry) => ({ entry, weight: Math.max(0, entry.weight * tagMultiplier(entry, profile) * rarityDangerMultiplier(entry.rarity, danger)) }));
  const total = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  if (total <= 0) return entries[0];
  let roll = rngValue(rng) * total;
  for (const candidate of weighted) {
    roll -= candidate.weight;
    if (roll <= 0) return candidate.entry;
  }
  return weighted.at(-1)?.entry ?? entries[0];
}

function rollQty(range, richness, rng) {
  const [min, max] = Array.isArray(range) ? range : [range ?? 1, range ?? 1];
  const base = randomInt(min, max, rng);
  const multiplier = 1 + Math.max(0, richness - 1) * EXPLORATION_REWARD.quantityBonusPerRichness;
  return Math.max(1, Math.round(base * multiplier));
}

function mergeItems(items) {
  const merged = new Map();
  items.forEach((item) => {
    if (!item?.id || !item.qty) return;
    merged.set(item.id, (merged.get(item.id) ?? 0) + item.qty);
  });
  return [...merged.entries()].map(([id, qty]) => ({ id, qty }));
}

function creditGainForZone(profile, richness, rng) {
  if (!profile.creditWeight) return 0;
  const chance = Math.min(0.65, profile.creditWeight);
  if (rngValue(rng) > chance) return 0;
  return Math.round((EXPLORATION_REWARD.creditBase + richness * EXPLORATION_REWARD.creditPerRichness) * (0.75 + rngValue(rng) * 0.75));
}

function hullDamageForZone(zone, rng) {
  const danger = Math.max(0, numeric(zone?.danger, 1));
  const chance = Math.min(0.75, danger * EXPLORATION_REWARD.hullRiskPerDanger);
  if (rngValue(rng) >= chance) return 0;
  const [min, max] = EXPLORATION_REWARD.hullDamageRange;
  return randomInt(min, max, rng);
}

export function rollExplorationReward(zone, runtime = {}, rng = Math.random) {
  const profile = getExplorationProfile(zone) ?? EXPLORATION_YIELD.unknown;
  const danger = Math.max(0, numeric(zone?.danger, 1));
  const richness = Math.max(0, numeric(zone?.richness, 1));
  const hasYield = zoneHasYield(zone);

  if (!hasYield) {
    return {
      ok: true,
      zoneId: zone?.id ?? null,
      zoneType: zone?.type ?? "unknown",
      items: [],
      creditGain: 0,
      fuelCost: 0,
      hullDamage: 0,
      yieldConsumed: 0,
      summary: "수거할 잔해 없음",
    };
  }

  const extraRolls = richness >= 6 ? 2 : richness >= 4 ? 1 : 0;
  const rolls = Math.max(1, Math.round(profile.baseRolls + extraRolls));
  const items = [];

  for (let index = 0; index < rolls; index += 1) {
    const entry = weightedPick(SALVAGE_LOOT_TABLE, profile, danger, rng);
    (entry.items ?? []).forEach((item) => items.push({ id: item.id, qty: rollQty(item.qty, richness, rng) }));
  }

  const mergedItems = mergeItems(items);
  const creditGain = creditGainForZone(profile, richness, rng);
  const hullDamage = hullDamageForZone(zone, rng);
  const fuelCost = explorationFuelCost(zone);

  return {
    ok: true,
    zoneId: zone?.id ?? null,
    zoneType: zone?.type ?? "unknown",
    items: mergedItems,
    creditGain,
    fuelCost,
    hullDamage,
    yieldConsumed: 1,
    summary: mergedItems.length > 0 ? mergedItems.map((item) => `${item.id} x${item.qty}`).join(", ") : "회수 자원 없음",
  };
}
