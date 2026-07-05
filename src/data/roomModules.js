export const ROOM_TIER_CONFIG = {
  1: { jobSpeedMul: 1, conditionDecayMul: 1, loadCapacityMul: 1, crisisResist: 0, slots: 1, upgradeCost: 0 },
  2: { jobSpeedMul: 1.12, conditionDecayMul: 0.88, loadCapacityMul: 1.15, crisisResist: 0.08, slots: 1, upgradeCost: 420 },
  3: { jobSpeedMul: 1.28, conditionDecayMul: 0.72, loadCapacityMul: 1.35, crisisResist: 0.16, slots: 2, upgradeCost: 900 },
};

export const ROOM_MODULE_CATALOG = [
  {
    id: "aux-bay",
    name: "보조 베이",
    applicableRooms: ["bridge", "ops", "medbay", "engineering", "cargo", "living"],
    tierRequired: 1,
    cost: { credits: 260 },
    effect: { slots: 1, loadCapacityMul: 1.06 },
    desc: "방 작업 슬롯을 1개 늘려 동시 작업자를 받을 수 있습니다.",
  },
  {
    id: "coolant-loop",
    name: "냉각 루프",
    applicableRooms: ["engineering"],
    tierRequired: 1,
    cost: { credits: 320 },
    effect: { conditionDecayMul: 0.82, crisisResist: 0.18, loadCapacityMul: 1.12 },
    desc: "기관실 과열과 화재 위험을 낮춥니다.",
  },
  {
    id: "med-scanner",
    name: "의료 스캐너",
    applicableRooms: ["medbay"],
    tierRequired: 1,
    cost: { credits: 300 },
    effect: { jobSpeedMul: 1.2, conditionDecayMul: 0.9 },
    desc: "의무실 보조 작업과 회복 지원 속도를 높입니다.",
  },
  {
    id: "reinforced-bulkhead",
    name: "강화 격벽",
    applicableRooms: ["bridge", "ops", "medbay", "engineering", "cargo", "living"],
    tierRequired: 2,
    cost: { credits: 480 },
    effect: { conditionDecayMul: 0.78, crisisResist: 0.14 },
    desc: "선체 파손과 위기 피해를 줄이는 방어형 모듈입니다.",
  },
  {
    id: "sensor-array",
    name: "센서 어레이",
    applicableRooms: ["bridge", "ops"],
    tierRequired: 2,
    cost: { credits: 520 },
    effect: { jobSpeedMul: 1.18, crisisResist: 0.08 },
    desc: "항로 분석과 위협 스캔 효율을 높입니다.",
  },
  {
    id: "cargo-rig",
    name: "화물 리그",
    applicableRooms: ["cargo"],
    tierRequired: 1,
    cost: { credits: 240 },
    effect: { jobSpeedMul: 1.15, loadCapacityMul: 1.16 },
    desc: "화물 정리와 적재 안정성을 높입니다.",
  },
  {
    id: "hab-comfort",
    name: "생활구역 안정화 팩",
    applicableRooms: ["living"],
    tierRequired: 1,
    cost: { credits: 220 },
    effect: { conditionDecayMul: 0.9, jobSpeedMul: 1.12 },
    desc: "생활구역 정비와 피로 회복 보조에 유리합니다.",
  },
];

export function getRoomModule(moduleId) {
  return ROOM_MODULE_CATALOG.find((module) => module.id === moduleId) ?? null;
}

export function canInstallRoomModule(room, module) {
  if (!room || !module) return false;
  return module.applicableRooms.includes(room.id) && (room.tier ?? 1) >= module.tierRequired && !(room.modules ?? []).includes(module.id);
}

export function mergeRoomModifier(base, effect = {}) {
  return {
    jobSpeedMul: base.jobSpeedMul * (effect.jobSpeedMul ?? 1),
    conditionDecayMul: base.conditionDecayMul * (effect.conditionDecayMul ?? 1),
    loadCapacityMul: base.loadCapacityMul * (effect.loadCapacityMul ?? 1),
    crisisResist: Math.min(0.75, base.crisisResist + (effect.crisisResist ?? 0)),
    slots: base.slots + (effect.slots ?? 0),
  };
}

export function calculateRoomModifiers(room) {
  const tier = Math.max(1, Math.min(3, room?.tier ?? 1));
  const base = ROOM_TIER_CONFIG[tier] ?? ROOM_TIER_CONFIG[1];
  return (room?.modules ?? []).reduce((modifier, moduleId) => {
    const module = getRoomModule(moduleId);
    return module ? mergeRoomModifier(modifier, module.effect) : modifier;
  }, { jobSpeedMul: base.jobSpeedMul, conditionDecayMul: base.conditionDecayMul, loadCapacityMul: base.loadCapacityMul, crisisResist: base.crisisResist, slots: base.slots });
}

export function formatRoomEffect(effect = {}) {
  const parts = [];
  if (effect.jobSpeedMul) parts.push(`작업속도 x${effect.jobSpeedMul}`);
  if (effect.conditionDecayMul) parts.push(`감소율 x${effect.conditionDecayMul}`);
  if (effect.loadCapacityMul) parts.push(`부하처리 x${effect.loadCapacityMul}`);
  if (effect.crisisResist) parts.push(`위기저항 +${Math.round(effect.crisisResist * 100)}%`);
  if (effect.slots) parts.push(`슬롯 +${effect.slots}`);
  return parts.join(" · ");
}
