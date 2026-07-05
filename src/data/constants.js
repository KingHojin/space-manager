export const GAME_TIME = {
  START_MINUTE: 2377 * 525600 + 2 * 43200 + 11 * 1440 + 14 * 60 + 20,
  REAL_SECOND_TO_GAME_MINUTES: 20,
  TICK_MS: 1000,
  SPEEDS: [1, 2, 4],
};

export const RESOURCES = {
  START_CREDITS: 1800,
  START_FUEL: 84,
  START_OXYGEN: 92,
  START_HULL: 88,
  FUEL_PER_GAME_HOUR: 0.65,
  OXYGEN_PER_GAME_HOUR: 0.45,
  LOW_RESOURCE_WARNING: 25,
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
  { id: "overview", label: "개요", sub: "작전 현황판" },
  { id: "exploration", label: "탐험", sub: "성계 탐사" },
  { id: "combat", label: "전투", sub: "전술 상황" },
  { id: "hunting", label: "사냥", sub: "생물 사냥" },
  { id: "ship", label: "함선", sub: "모듈 & 업그레이드" },
  { id: "crew", label: "승무원", sub: "대원 관리" },
  { id: "collector", label: "우주 집진기", sub: "자원 수집" },
  { id: "market", label: "시장", sub: "거래 & 환전" },
];
