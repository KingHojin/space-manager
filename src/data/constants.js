export const GAME_TIME = {
  START_MINUTE: 2377 * 525600 + 2 * 43200 + 11 * 1440 + 14 * 60 + 20,
  REAL_SECOND_TO_GAME_MINUTES: 3,
  TICK_MS: 1000,
  SPEEDS: [1, 2, 4],
};

export const DEV_FLAGS = {
  LOCK_PERCENT_RESOURCES: true,
};

export const RESOURCES = {
  START_CREDITS: 1800,
  START_FUEL: 100,
  START_OXYGEN: 100,
  START_HULL: 100,
  FUEL_PER_GAME_HOUR: 0.65,
  OXYGEN_PER_GAME_HOUR: 0.45,
  LOW_RESOURCE_WARNING: 25,
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

export const JOB_TYPES = ["recovery", "hull_repair", "salvage", "module_upgrade", "training"];

export const JOB_DURATION = {
  recovery: 180,
  hull_repair: 120,
  salvage: 90,
  module_upgrade: 120,
  training: 360,
};

export const JOB_LOAD_COST = {
  recovery: 1,
  hull_repair: 2,
  salvage: 2,
  module_upgrade: 3,
  training: 1,
};

export const JOB_REQUIRED_ROLE = {
  recovery: null,
  hull_repair: "engineer",
  salvage: "engineer",
  module_upgrade: "engineer",
  training: null,
};

export const JOB_PRIORITY = {
  emergency: 1,
  high: 3,
  normal: 5,
  low: 7,
};

export const ROOM_TRAVEL_MINUTES = 10;

export const ROOM_CONFIG = {
  bridge: { label: "브릿지", slotCapacity: 2, loadThreshold: 3 },
  ops: { label: "관제실", slotCapacity: 2, loadThreshold: 3 },
  engineering: { label: "기관실", slotCapacity: 2, loadThreshold: 3 },
  cargo: { label: "창고", slotCapacity: 2, loadThreshold: 4 },
  medbay: { label: "의무실", slotCapacity: 1, loadThreshold: 2 },
  living: { label: "생활구역", slotCapacity: 1, loadThreshold: 2 },
  galley: { label: "식당/조리실", slotCapacity: 2, loadThreshold: 3 },
};

export const JOB_ECONOMY = {
  defaultPriority: JOB_PRIORITY.normal,
  cancelRefundRatio: 0.5,
  training: { credits: 180 },
  recovery: { credits: 90, fatigueRecovery: 32 },
  hullRepair: { salvageScrapCost: 6, hullDelta: 8 },
  salvageProcessing: { salvageScrapCost: 4, tritaniumReward: 2 },
};

export const DRIFT = {
  OXYGEN_LOSS_PER_HOUR: 1.3,
  HULL_LOSS_PER_HOUR: 0.35,
  CRISIS_ROLL_PER_HOUR: 0.18,
  RESCUE_CHECK_MINUTES: 180,
};

export const DUST = {
  SINGLE_DRAW_COST: 100,
  TEN_DRAW_COST: 900,
  BASE_COLLECTION_PER_HOUR: 1.8,
  DUPLICATE_SHARDS: 20,
};

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

export const MENU_ITEMS = [
  { id: "overview", label: "홈", sub: "대시보드" },
  { id: "exploration", label: "지도", sub: "성계 탐사" },
  { id: "combat", label: "전투", sub: "전술 상황" },
  { id: "hunting", label: "사냥", sub: "생물 사냥" },
  { id: "ship", label: "함선", sub: "모듈 & 업그레이드" },
  { id: "skilltree", label: "스킬트리", sub: "성장 빌드" },
  { id: "crew", label: "승무원", sub: "대원 관리" },
  { id: "recruit", label: "영입", sub: "승무원 가챠" },
  { id: "collector", label: "컬렉션", sub: "유물 & 카드" },
  { id: "market", label: "시장", sub: "거래 & 계약" },
];
