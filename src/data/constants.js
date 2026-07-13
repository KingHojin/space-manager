import { getRoomDef } from "./shipRooms";

export const GAME_TIME = {
  START_MINUTE: 2377 * 525600 + 2 * 43200 + 11 * 1440 + 14 * 60 + 20,
  REAL_SECOND_TO_GAME_MINUTES: 2.4,
  TICK_MS: 1000,
  SPEEDS: [1, 2, 4],
};

export const DEV_FLAGS = {
  LOCK_PERCENT_RESOURCES: false,
  LOCK_FUEL: false,
  LOCK_OXYGEN: false,
  LOCK_HULL: false,
};

export const RESOURCES = {
  START_CREDITS: 600,
  START_FUEL: 100,
  START_OXYGEN: 100,
  START_HULL: 100,
  FUEL_PER_GAME_HOUR: 0.65,
  OXYGEN_PER_GAME_HOUR: 0.45,
  LOW_RESOURCE_WARNING: 25,
};

export const NAVIGATION_TRAVEL = {
  minutesPerDistance: 11,
  fuelPerDistance: 1.15,
  discoveryRadiusSteps: 1,
};

// Phase 22-B's first expedition is a campaign milestone, not the eventual
// ceiling for fleet progression. Later fleet campaigns can add new expedition
// definitions without changing the live navigation/save shape introduced here.
export const CAMPAIGN = {
  EXPEDITION_ID: "first-frontier",
  EXPEDITION_LABEL: "1차 개척 원정",
  EXPEDITION_SECTORS: 5,
  BASE_REQUIRED_FIELD_VISITS: 3,
  MAX_REQUIRED_FIELD_VISITS: 5,
  BASE_DANGER_THRESHOLD: 3,
  MAX_DANGER_THRESHOLD: 5,
  MAX_NODE_DANGER: 7,
  MAX_NODE_RICHNESS: 7,
  BASE_GATE_REWARD_CREDITS: 120,
  REWARD_MULTIPLIER_PER_SECTOR: 0.2,
  GATE_REQUISITION_PACKAGES: {
    maintenance: { label: "정비 물자", summary: "폐자재 +6", items: [{ itemId: "salvage-scrap", qty: 6 }] },
    refit: { label: "개장 자재", summary: "트리타늄 +2 · ₢140", credits: 140, items: [{ itemId: "tritanium", qty: 2 }] },
    personnel: { label: "인사 예산", summary: "₢240", credits: 240 },
  },
  READY_FUEL: 35,
  READY_HULL: 50,
  READY_CREW: 3,
};

export const CREW_NEEDS = {
  HUNGER_PER_HOUR: 1.6,
  MOOD_DECAY_PER_HOUR: 0.35,
  STRESS_DECAY_PER_HOUR: 0.25,
  DRIFT_HUNGER_PER_HOUR: 2.4,
  DRIFT_FATIGUE_PER_HOUR: 2.2,
  DRIFT_MOOD_LOSS_PER_HOUR: 1.8,
  DRIFT_STRESS_PER_HOUR: 3.4,
};

export const JOB_STATUS = ["backlog", "assigned", "in_progress", "done", "failed"];

export const JOB_TYPES = ["recovery", "treatment", "hull_repair", "salvage", "module_upgrade", "training", "decode"];

export const JOB_DURATION = {
  recovery: 180,
  treatment: 360,
  hull_repair: 120,
  salvage: 90,
  module_upgrade: 120,
  training: 360,
  decode: 240,
};

export const JOB_LOAD_COST = {
  recovery: 1,
  treatment: 1,
  hull_repair: 2,
  salvage: 2,
  module_upgrade: 3,
  training: 1,
  decode: 2,
};

export const JOB_REQUIRED_ROLE = {
  recovery: null,
  treatment: null,
  hull_repair: "engineer",
  salvage: "engineer",
  module_upgrade: "engineer",
  training: null,
  decode: null,
};

export const DECODE_RULES = {
  blackbox: { reveals: 1, dustReward: 30, label: "함선 블랙박스" },
  "ancient-coordinate": { reveals: 1, dustReward: 20, label: "고대 좌표 조각" },
  "void-map": { reveals: 3, dustReward: 60, label: "공허 성도" },
};

// First authored story chain. Keeping every gameplay number and identifier
// here makes the card copy, settlement code and tests read the same contract.
export const GREYWAKE = Object.freeze({
  chainId: "greywake-last-watch",
  recorderItemId: "greywake-recorder",
  jobMinutes: 240,
  jobRoomId: "ops",
  recruitTemplateId: "greywake-last-watch-analyst",
  recruitCost: 240,
  rescueOxygenCost: 8,
  battleEnemyId: "greywake-claims-cutter",
  battleCredits: 760,
  battleItemId: "tactical-ai-chip",
  saleCredits: 420,
  markerLabel: "GREYWAKE // 마지막 당직",
  startedFlagId: "greywakeStarted",
});

export const QUARANTINE_PULSE = Object.freeze({
  chainId: "quarantine-pulse",
  startedFlagId: "quarantinePulseStarted",
  markerLabel: "QUARANTINE // 이송 창구",
  observationMinutes: 240,
  standardTreatmentMinutes: 360,
  gelTreatmentMinutes: 180,
  standardOxygenCost: 7,
  gelOxygenCost: 3,
  boardingOxygenCost: 5,
  standardMedicFatigue: 18,
  gelMedicFatigue: 8,
  gelItemId: "nanite-gel",
  recruitTemplateId: "quarantine-pulse-epidemiologist",
  recruitCost: 240,
  transferCredits: 360,
});

// Numeric priority storage for jobStore.jobs[].priority (lower sorts first).
// Keys deliberately match systems/priorities.js's activity-priority strings —
// see the boundary comment above normalizeJobPriority/priorityToActivityPriority
// in systems/jobMigration.js for how the numeric<->string conversion is
// centralized (Phase 18-E).
export const JOB_PRIORITY = {
  emergency: 1,
  high: 3,
  normal: 5,
  low: 7,
};

export const ROOM_TRAVEL_MINUTES = 10;

// Job-scheduling-only metadata per room (slot capacity + display load threshold
// for jobStore's derived job-slot index — see stores/jobStore.js). Room
// identity/order/label is NOT owned here: data/shipRooms.js (ROOM_IDS /
// getRoomDef) is the single source of truth for which rooms exist and what
// they're called. Values below are unchanged from before Phase 18-D; only the
// key set + label now come from that single source so the two can't drift.
const ROOM_JOB_SLOTS = {
  bridge: { slotCapacity: 2, loadThreshold: 3 },
  ops: { slotCapacity: 2, loadThreshold: 3 },
  engineering: { slotCapacity: 2, loadThreshold: 3 },
  cargo: { slotCapacity: 2, loadThreshold: 4 },
  medbay: { slotCapacity: 1, loadThreshold: 2 },
  living: { slotCapacity: 1, loadThreshold: 2 },
  galley: { slotCapacity: 2, loadThreshold: 3 },
};

export const ROOM_CONFIG = Object.fromEntries(
  Object.keys(ROOM_JOB_SLOTS).map((id) => [id, { label: getRoomDef(id)?.label ?? id, ...ROOM_JOB_SLOTS[id] }]),
);

export const WEAR = {
  conditionDecayPerHour: 0.5,
  loadGrowthPerHour: 0.8,
  usageWearPerJobHour: 1.2,
  warnCondition: 70,
  dangerCondition: 40,
  crisisChancePerHourAtDanger: 0.1,
  crisisChancePerHourAtZero: 0.3,
};

export const JOB_ECONOMY = {
  defaultPriority: JOB_PRIORITY.normal,
  cancelRefundRatio: 0.5,
  training: { credits: 120 },
  recovery: { credits: 90, fatigueRecovery: 32 },
  hullRepair: { salvageScrapCost: 6, hullDelta: 8 },
  salvageProcessing: { salvageScrapCost: 4, tritaniumReward: 2 },
};

export const EXPLORATION_YIELD = {
  station: { baseRolls: 0, salvageWeight: 0, itemWeight: 0, creditWeight: 0.25, tags: ["station"] },
  market: { baseRolls: 0, salvageWeight: 0, itemWeight: 0, creditWeight: 0.35, tags: ["station", "trade"] },
  colony: { baseRolls: 1, salvageWeight: 0.25, itemWeight: 0.35, creditWeight: 0.45, tags: ["station", "trade", "supply"] },
  gate: { baseRolls: 0, salvageWeight: 0, itemWeight: 0, creditWeight: 0, tags: ["gate"] },
  exit: { baseRolls: 0, salvageWeight: 0, itemWeight: 0, creditWeight: 0, tags: ["gate"] },
  nebula: { baseRolls: 1, salvageWeight: 0.45, itemWeight: 0.45, creditWeight: 0.1, tags: ["nebula", "science"] },
  debris: { baseRolls: 2, salvageWeight: 1.15, itemWeight: 0.2, creditWeight: 0.05, tags: ["salvage", "wreck", "debris"] },
  distress: { baseRolls: 1, salvageWeight: 0.55, itemWeight: 0.55, creditWeight: 0.1, tags: ["salvage", "distress", "crew"] },
  unknown: { baseRolls: 1, salvageWeight: 0.45, itemWeight: 0.65, creditWeight: 0.05, tags: ["anomaly", "science"] },
  wreck: { baseRolls: 2, salvageWeight: 1.2, itemWeight: 0.35, creditWeight: 0.05, tags: ["salvage", "wreck", "debris"] },
  ruin: { baseRolls: 2, salvageWeight: 0.65, itemWeight: 0.75, creditWeight: 0.05, tags: ["ruin", "artifact", "science"] },
  mining: { baseRolls: 3, salvageWeight: 1.3, itemWeight: 0.15, creditWeight: 0.05, tags: ["mining", "material"] },
  ice: { baseRolls: 2, salvageWeight: 0.75, itemWeight: 0.35, creditWeight: 0.05, tags: ["ice", "material", "science"] },
  anomaly: { baseRolls: 1, salvageWeight: 0.35, itemWeight: 0.9, creditWeight: 0.05, tags: ["anomaly", "science", "artifact"] },
  creature: { baseRolls: 1, salvageWeight: 0.35, itemWeight: 0.75, creditWeight: 0.05, tags: ["creature", "biology", "science"] },
  pirate: { baseRolls: 2, salvageWeight: 0.9, itemWeight: 0.55, creditWeight: 0.2, tags: ["pirate", "salvage", "tactical"] },
  defense: { baseRolls: 2, salvageWeight: 0.75, itemWeight: 0.85, creditWeight: 0.05, tags: ["defense", "tactical", "artifact"] },
  blackhole: { baseRolls: 2, salvageWeight: 0.35, itemWeight: 1.15, creditWeight: 0.05, tags: ["blackhole", "artifact", "science"] },
  research: { baseRolls: 2, salvageWeight: 0.35, itemWeight: 1, creditWeight: 0.05, tags: ["research", "science", "artifact"] },
};

export const EXPLORATION_REWARD = {
  rareBonusPerDanger: 0.06,
  quantityBonusPerRichness: 0.08,
  creditBase: 35,
  creditPerRichness: 12,
  fuelPenaltyPerDanger: 0.75,
  hullRiskPerDanger: 0.025,
  hullDamageRange: [1, 5],
};

export const SALVAGE_LOOT_TABLE = [
  { weight: 58, rarity: "common", tags: ["salvage", "wreck", "debris", "mining", "material"], items: [{ id: "salvage-scrap", qty: [2, 4] }] },
  { weight: 26, rarity: "common", tags: ["material", "mining", "ice", "debris"], items: [{ id: "alloy-plate", qty: [1, 2] }] },
  { weight: 14, rarity: "uncommon", tags: ["science", "research", "anomaly", "ruin"], items: [{ id: "quantum-circuit", qty: [1, 1] }] },
  { weight: 10, rarity: "uncommon", tags: ["biology", "creature", "science"], items: [{ id: "bio-fiber", qty: [1, 2] }] },
  { weight: 8, rarity: "rare", tags: ["salvage", "wreck", "distress"], items: [{ id: "blackbox", qty: [1, 1] }] },
  { weight: 6, rarity: "rare", tags: ["tactical", "pirate", "defense"], items: [{ id: "tactical-ai-chip", qty: [1, 1] }] },
  { weight: 5, rarity: "rare", tags: ["artifact", "ruin", "research", "blackhole"], items: [{ id: "ancient-relay", qty: [1, 1] }] },
  { weight: 3, rarity: "epic", tags: ["artifact", "blackhole", "anomaly"], items: [{ id: "phase-crystal", qty: [1, 1] }] },
];

export const ZONE_DEPLETION = {
  defaultYield: 2,
  richnessYieldBonus: 0.5,
  maxYield: 6,
  regenCooldownMin: 1440,
};

export const EXPLORATION_FUEL = {
  exploreCost: 4,
};

export const DRIFT = {
  OXYGEN_LOSS_PER_HOUR: 1.3,
  HULL_LOSS_PER_HOUR: 0.35,
  CRISIS_ROLL_PER_HOUR: 0.18,
  RESCUE_CHECK_MINUTES: 180,
  RESCUE_CREDIT_COST: 360,
  RESCUE_FUEL: 25,
  RESCUE_LIMIT_PER_SECTOR: 1,
};

export const DUST = {
  SINGLE_DRAW_COST: 100,
  TEN_DRAW_COST: 900,
  BASE_COLLECTION_PER_HOUR: 1.8,
  DUPLICATE_SHARDS: 20,
  EXPLORE_PER_DANGER: 6,
  CRISIS_REWARD: 12,
  COMBAT_REWARD_PER_RISK: 5,
  PITY_THRESHOLD: 50,
};

export const SHARD_CRAFT_COST = { common: 40, uncommon: 90, rare: 200, epic: 480, legendary: 1200 };

export const GACHA_RATES = [
  { rarity: "common", label: "일반", rate: 0.55 },
  { rarity: "uncommon", label: "고급", rate: 0.27 },
  { rarity: "rare", label: "희귀", rate: 0.12 },
  { rarity: "epic", label: "영웅", rate: 0.05 },
  { rarity: "legendary", label: "전설", rate: 0.01 },
];

export const RARITY_COLORS = {
  common: "slate",
  uncommon: "emerald",
  rare: "sky",
  epic: "violet",
  legendary: "amber",
};

export const SHIP_GRADES = {
  shuttle: { label: "셔틀", icon: "I", modifier: 1 },
  corvette: { label: "코르벳", icon: "II", modifier: 1.2 },
  frigate: { label: "프리깃", icon: "III", modifier: 1.45 },
  cruiser: { label: "순양함", icon: "IV", modifier: 1.8 },
};

export const MODULE_SLOTS = ["engine", "weapon-a", "weapon-b", "shield", "cargo", "special"];

export const SLOT_ROOM = {
  engine: "engineering",
  shield: "engineering",
  cargo: "cargo",
  special: "ops",
  "weapon-a": "ops",
  "weapon-b": "ops",
};

export const ROOM_SLOTS = {
  engineering: ["engine", "shield"],
  ops: ["weapon-a", "weapon-b", "special"],
  cargo: ["cargo"],
};

export const POWER = {
  reactorBaseByGrade: { shuttle: 7, corvette: 9, frigate: 11, cruiser: 14 },
  reactorPerEngineeringTier: 2,
  moduleCostByRarity: { common: 1, uncommon: 1, rare: 2, epic: 3, legendary: 4 },
};

export const MENU_ITEMS = [
  { id: "overview", label: "홈", sub: "대시보드" },
  { id: "exploration", label: "지도", sub: "성계 탐사" },
  { id: "combat", label: "전투", sub: "전술 상황" },
  { id: "ship", label: "함선", sub: "모듈 & 업그레이드" },
  { id: "skilltree", label: "스킬트리", sub: "성장 빌드" },
  { id: "crew", label: "승무원", sub: "대원 관리" },
  { id: "collector", label: "컬렉션", sub: "유물 & 카드" },
  { id: "market", label: "시장", sub: "거래 & 계약" },
];
