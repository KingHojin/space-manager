export const modules = [
  { id: "pulse-drive", slot: "engine", name: "펄스 드라이브", rarity: "common", level: 1, defaultInstalled: true, stats: { engine: 8, fuelEfficiency: 1 } },
  { id: "ion-sail", slot: "engine", name: "이온 세일", rarity: "uncommon", level: 1, stats: { engine: 6, fuelEfficiency: 4, scanner: 1 } },
  { id: "nova-burner", slot: "engine", name: "노바 버너", rarity: "rare", level: 1, stats: { engine: 14, fuelEfficiency: -2, evasion: 2 } },

  { id: "rail-lance", slot: "weapon-a", name: "레일 랜스", rarity: "uncommon", level: 1, defaultInstalled: true, stats: { attack: 12 } },
  { id: "plasma-needle", slot: "weapon-a", name: "플라즈마 니들", rarity: "rare", level: 1, stats: { attack: 16, precision: 3 } },
  { id: "ion-disruptor", slot: "weapon-a", name: "이온 교란기", rarity: "epic", level: 1, stats: { attack: 10, control: 8 } },

  { id: "scatter-turret", slot: "weapon-b", name: "산탄 포탑", rarity: "common", level: 1, defaultInstalled: true, stats: { attack: 8 } },
  { id: "drone-bay", slot: "weapon-b", name: "드론 베이", rarity: "rare", level: 1, stats: { attack: 9, scanner: 4 } },
  { id: "point-defense", slot: "weapon-b", name: "근접 방어망", rarity: "uncommon", level: 1, stats: { attack: 5, defense: 6 } },

  { id: "aegis-field", slot: "shield", name: "이지스 필드", rarity: "uncommon", level: 1, defaultInstalled: true, stats: { defense: 10 } },
  { id: "mirror-barrier", slot: "shield", name: "미러 배리어", rarity: "rare", level: 1, stats: { defense: 14, control: 2 } },
  { id: "heavy-plates", slot: "shield", name: "중장갑 플레이트", rarity: "common", level: 1, stats: { defense: 8, cargo: -4 } },

  { id: "modular-hold", slot: "cargo", name: "모듈형 화물칸", rarity: "common", level: 1, defaultInstalled: true, stats: { cargo: 20 } },
  { id: "sealed-vault", slot: "cargo", name: "밀폐 보관실", rarity: "uncommon", level: 1, stats: { cargo: 14, science: 4 } },
  { id: "deep-cargo", slot: "cargo", name: "심층 화물창", rarity: "rare", level: 1, stats: { cargo: 32, evasion: -2 } },

  { id: "dust-collector", slot: "special", name: "MK-I 우주 집진기", rarity: "rare", level: 1, defaultInstalled: true, stats: { dustCollection: 1 } },
  { id: "relic-analyzer", slot: "special", name: "유물 분석기", rarity: "rare", level: 1, stats: { science: 8, scanner: 3 } },
  { id: "phase-scanner", slot: "special", name: "위상 스캐너", rarity: "epic", level: 1, stats: { scanner: 10, fuelEfficiency: -1 } },
];
