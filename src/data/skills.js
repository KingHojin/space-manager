export const skillBranches = [
  { id: "command", label: "지휘", color: "sky", icon: "flag" },
  { id: "exploration", label: "탐사", color: "emerald", icon: "radar" },
  { id: "combat", label: "전투", color: "red", icon: "swords" },
  { id: "engineering", label: "공학", color: "amber", icon: "wrench" },
  { id: "science", label: "과학", color: "violet", icon: "flask" },
  { id: "diplomacy", label: "외교", color: "cyan", icon: "handshake" },
];

export const skills = [
  { id: "command-formation", branch: "command", name: "함대 진형", desc: "전투 개시 시 승무원 사기와 방어 태세를 높입니다.", maxLevel: 3, cost: 1, bonus: ["사기 보정 +5%", "피해 완화 +3%"] },
  { id: "command-logistics", branch: "command", name: "항해 보급 지휘", desc: "장거리 이동 시 자원 낭비를 줄입니다.", maxLevel: 3, cost: 1, requires: "command-formation", bonus: ["산소 소모 -4%", "연료 소모 -3%"] },
  { id: "command-crew-drill", branch: "command", name: "승무원 훈련 교범", desc: "훈련 효율과 경험치 획득량을 올립니다.", maxLevel: 3, cost: 1, requires: "command-logistics", bonus: ["훈련 경험치 +10%", "피로 누적 -5%"] },
  { id: "command-fleet-doctrine", branch: "command", name: "함대 교리", desc: "고위험 구역에서 지휘 보정을 얻습니다.", maxLevel: 3, cost: 2, requires: "command-crew-drill", bonus: ["고위험 보정 +8%"] },

  { id: "exploration-deep-scan", branch: "exploration", name: "심층 스캔 I", desc: "스캐너 감도와 범위를 높여 더 많은 탐사 정보를 얻습니다.", maxLevel: 3, cost: 1, bonus: ["탐사 속도 +10%", "이상 탐지 확률 +5%"] },
  { id: "exploration-probe", branch: "exploration", name: "프로브 운용", desc: "탐사 프로브 투입 효율을 높입니다.", maxLevel: 3, cost: 1, requires: "exploration-deep-scan", bonus: ["프로브 보상 +12%"] },
  { id: "exploration-cartography", branch: "exploration", name: "성도 작성", desc: "미확인 구역 발견률을 올립니다.", maxLevel: 3, cost: 1, requires: "exploration-probe", bonus: ["구역 공개 확률 +8%"] },
  { id: "exploration-anomaly", branch: "exploration", name: "이상현상 판독", desc: "성운, 관문, 블랙홀 스캔 보상을 강화합니다.", maxLevel: 3, cost: 2, requires: "exploration-cartography", bonus: ["이상현상 보상 +15%"] },

  { id: "combat-targeting", branch: "combat", name: "표적 분석", desc: "적 방어막과 선체에 주는 피해를 높입니다.", maxLevel: 3, cost: 1, bonus: ["전투력 +6%"] },
  { id: "combat-evasion", branch: "combat", name: "회피 기동 교범", desc: "회피 기동 시 선체 손상을 줄입니다.", maxLevel: 3, cost: 1, requires: "combat-targeting", bonus: ["회피 피해 -8%"] },
  { id: "combat-shield", branch: "combat", name: "방어막 과충전", desc: "방어막 강화 지시의 효율을 높입니다.", maxLevel: 3, cost: 1, requires: "combat-evasion", bonus: ["방어 태세 +10%"] },
  { id: "combat-boarding", branch: "combat", name: "강습 작전", desc: "전투 승리 보상과 회수품 획득량을 높입니다.", maxLevel: 3, cost: 2, requires: "combat-shield", bonus: ["전투 보상 +12%"] },

  { id: "engineering-efficiency", branch: "engineering", name: "동력 효율", desc: "함선 모듈의 에너지 손실을 줄입니다.", maxLevel: 3, cost: 1, bonus: ["연료 효율 +5%"] },
  { id: "engineering-repair", branch: "engineering", name: "현장 수리", desc: "선체 수리와 나노머신 겔 효과를 강화합니다.", maxLevel: 3, cost: 1, requires: "engineering-efficiency", bonus: ["수리량 +12%"] },
  { id: "engineering-cargo", branch: "engineering", name: "화물 최적화", desc: "적재 효율과 자원 보관 안정성을 높입니다.", maxLevel: 3, cost: 1, requires: "engineering-repair", bonus: ["적재 효율 +8%"] },
  { id: "engineering-overclock", branch: "engineering", name: "모듈 오버클럭", desc: "고급 모듈의 성능 한계를 끌어올립니다.", maxLevel: 3, cost: 2, requires: "engineering-cargo", bonus: ["모듈 보정 +10%"] },

  { id: "science-analysis", branch: "science", name: "시료 분석", desc: "생체 샘플과 유물 분석 보상을 높입니다.", maxLevel: 3, cost: 1, bonus: ["과학 보상 +8%"] },
  { id: "science-relic", branch: "science", name: "유물 해독", desc: "고대 신호체 계약과 유물 보상을 강화합니다.", maxLevel: 3, cost: 1, requires: "science-analysis", bonus: ["유물 보상 +10%"] },
  { id: "science-biology", branch: "science", name: "외계 생물학", desc: "사냥 성공률과 생체 아이템 획득률을 높입니다.", maxLevel: 3, cost: 1, requires: "science-relic", bonus: ["사냥 성공 +8%"] },
  { id: "science-singularity", branch: "science", name: "특이점 연구", desc: "블랙홀과 관문 구역에서 고급 보상을 얻습니다.", maxLevel: 3, cost: 2, requires: "science-biology", bonus: ["심층권 보상 +15%"] },

  { id: "diplomacy-contract", branch: "diplomacy", name: "계약 평판", desc: "계약 완료 보상과 세력 평판 획득량을 높입니다.", maxLevel: 3, cost: 1, bonus: ["계약 보상 +8%"] },
  { id: "diplomacy-market", branch: "diplomacy", name: "시장 교섭", desc: "시장 보급과 모듈 구매 비용을 낮춥니다.", maxLevel: 3, cost: 1, requires: "diplomacy-contract", bonus: ["시장 가격 -5%"] },
  { id: "diplomacy-checkpoint", branch: "diplomacy", name: "검문 대응", desc: "연방 검문과 세력 충돌 이벤트의 페널티를 줄입니다.", maxLevel: 3, cost: 1, requires: "diplomacy-market", bonus: ["검문 위험 -10%"] },
  { id: "diplomacy-shadow", branch: "diplomacy", name: "비공식 채널", desc: "위험 세력과의 거래 선택지를 넓힙니다.", maxLevel: 3, cost: 2, requires: "diplomacy-checkpoint", bonus: ["특수 계약 해금"] },
];

export const starterSkillLevels = {
  "command-formation": 1,
  "exploration-deep-scan": 2,
  "combat-targeting": 1,
  "engineering-efficiency": 1,
  "science-analysis": 1,
  "diplomacy-contract": 1,
};

export const getSkillById = (id) => skills.find((skill) => skill.id === id);
export const getSkillsByBranch = (branchId) => skills.filter((skill) => skill.branch === branchId);
