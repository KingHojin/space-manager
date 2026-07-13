export const RECRUIT_RATES = [
  { rarity: "common", label: "일반", rate: 0.6 },
  { rarity: "rare", label: "희귀", rate: 0.3 },
  { rarity: "epic", label: "영웅", rate: 0.09 },
  { rarity: "legendary", label: "전설", rate: 0.01 },
];

export const RECRUIT_PITY = {
  threshold: 50,
  guaranteedRarity: "epic",
};

export const RECRUIT_COST = {
  single: 240,
  ten: 2160,
  tenDiscount: 240,
  candidateByRarity: {
    common: 160,
    rare: 240,
    epic: 480,
    legendary: 720,
  },
  duplicateRefund: {
    common: 35,
    rare: 85,
    epic: 220,
    legendary: 600,
  },
};

export const CREW_CAPACITY_FALLBACK = 10;

export const CREW_TEMPLATES = [
  {
    templateId: "nav-rookie-pilot",
    name: "서 리나",
    role: "함교",
    rarity: "common",
    trait: "신입 항해사",
    baseStats: { piloting: 11, gunnery: 6, engineering: 7, medicine: 5, scouting: 12 },
    portrait: "🧭",
  },
  {
    templateId: "common-deckhand",
    name: "도 진우",
    role: "기관실",
    rarity: "common",
    trait: "근면한 정비병",
    baseStats: { piloting: 6, gunnery: 6, engineering: 12, medicine: 5, scouting: 7 },
    portrait: "🔧",
  },
  {
    templateId: "common-watch",
    name: "한 미루",
    role: "포탑",
    rarity: "common",
    trait: "차분한 감시자",
    baseStats: { piloting: 6, gunnery: 12, engineering: 6, medicine: 5, scouting: 10 },
    portrait: "🎯",
  },
  {
    templateId: "common-ship-cook",
    name: "박 노아",
    role: "조리실",
    rarity: "common",
    trait: "함선 급식 담당",
    baseStats: { piloting: 5, gunnery: 4, engineering: 7, medicine: 8, scouting: 7, cooking: 12 },
    portrait: "🍳",
  },
  {
    templateId: "distress-field-medic",
    name: "백 소율",
    role: "의무실",
    rarity: "rare",
    trait: "야전 처치",
    baseStats: { piloting: 5, gunnery: 6, engineering: 8, medicine: 15, scouting: 9 },
    portrait: "✚",
  },
  {
    templateId: "rare-sensor-analyst",
    name: "문 태오",
    role: "함교",
    rarity: "rare",
    trait: "센서 분석가",
    baseStats: { piloting: 13, gunnery: 8, engineering: 8, medicine: 6, scouting: 15 },
    portrait: "📡",
  },
  {
    templateId: "greywake-last-watch-analyst",
    name: "윤 서해",
    role: "함교",
    rarity: "rare",
    trait: "GREYWAKE 마지막 당직",
    baseStats: { piloting: 12, gunnery: 7, engineering: 9, medicine: 7, scouting: 17 },
    portrait: "📻",
    storyOnly: true,
  },
  {
    templateId: "quarantine-pulse-epidemiologist",
    name: "한 이솔",
    role: "의무실",
    rarity: "rare",
    trait: "격리선 역학관",
    baseStats: { piloting: 5, gunnery: 5, engineering: 8, medicine: 17, scouting: 12 },
    portrait: "🧬",
    storyOnly: true,
  },
  {
    templateId: "rare-reactor-tech",
    name: "장 이든",
    role: "기관실",
    rarity: "rare",
    trait: "반응로 기술자",
    baseStats: { piloting: 6, gunnery: 7, engineering: 16, medicine: 7, scouting: 8 },
    portrait: "⚙️",
  },
  {
    templateId: "rare-galley-chef",
    name: "유 마리",
    role: "조리실",
    rarity: "rare",
    trait: "영양 관리사",
    baseStats: { piloting: 6, gunnery: 5, engineering: 8, medicine: 11, scouting: 8, cooking: 16 },
    portrait: "🥘",
  },
  {
    templateId: "epic-tactical-officer",
    name: "차 유건",
    role: "포탑",
    rarity: "epic",
    trait: "전술 장교",
    baseStats: { piloting: 9, gunnery: 19, engineering: 9, medicine: 6, scouting: 13 },
    portrait: "🛰️",
  },
  {
    templateId: "epic-trauma-surgeon",
    name: "이 아린",
    role: "의무실",
    rarity: "epic",
    trait: "외상 전문의",
    baseStats: { piloting: 7, gunnery: 6, engineering: 9, medicine: 20, scouting: 10 },
    portrait: "🩺",
  },
  {
    templateId: "epic-deep-space-chef",
    name: "남 하율",
    role: "조리실",
    rarity: "epic",
    trait: "심우주 셰프",
    baseStats: { piloting: 7, gunnery: 6, engineering: 10, medicine: 13, scouting: 10, cooking: 21 },
    portrait: "👨‍🍳",
  },
  {
    templateId: "legendary-void-captain",
    name: "권 세라",
    role: "함교",
    rarity: "legendary",
    trait: "공허 항로의 베테랑",
    baseStats: { piloting: 22, gunnery: 14, engineering: 13, medicine: 9, scouting: 20 },
    portrait: "🌌",
  },
  {
    templateId: "legendary-chief-engineer",
    name: "오 카이",
    role: "기관실",
    rarity: "legendary",
    trait: "전설의 기관장",
    baseStats: { piloting: 10, gunnery: 11, engineering: 24, medicine: 9, scouting: 13 },
    portrait: "🚀",
  },
];

export function getCrewTemplate(templateId) {
  return CREW_TEMPLATES.find((template) => template.templateId === templateId) ?? null;
}

export function getTemplatesByRarity(rarity) {
  return CREW_TEMPLATES.filter((template) => template.rarity === rarity && !template.storyOnly);
}

export function getCandidateRecruitCost(rarity) {
  return RECRUIT_COST.candidateByRarity[rarity] ?? RECRUIT_COST.candidateByRarity.common;
}

export function validateRecruitRates(rates = RECRUIT_RATES) {
  const sum = rates.reduce((total, entry) => total + (entry.rate ?? 0), 0);
  return Math.abs(sum - 1) < 0.0001;
}
