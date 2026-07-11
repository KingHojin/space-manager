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
  { id: "command-logistics", branch: "command", name: "항해 보급 지휘", desc: "장거리 이동 시 생활 보급 낭비를 줄입니다.", maxLevel: 3, cost: 1, requires: "command-formation", bonus: ["산소 소모 -4%"] },
  { id: "command-crew-drill", branch: "command", name: "승무원 훈련 교범", desc: "훈련 경험치를 고정 증가시키고 피로 누적을 줄입니다.", maxLevel: 3, cost: 1, implemented: true, bonus: ["훈련 경험치 +1/Lv", "피로 누적 -5%/Lv"] },
  { id: "command-fleet-doctrine", branch: "command", name: "함대 교리", desc: "고위험 구역에서 지휘 보정을 얻습니다.", maxLevel: 3, cost: 2, requires: "command-crew-drill", bonus: ["고위험 보정 +8%"] },
  { id: "command-crisis-protocol", branch: "command", name: "위기 지휘 프로토콜", desc: "연료, 산소, 선체가 낮을 때 함교가 자동으로 보수적인 운용을 지시합니다.", maxLevel: 3, cost: 2, requires: "command-fleet-doctrine", bonus: ["자원 경고 상태 피해 감소", "치명 손실 완화"] },
  { id: "command-emergency-order", branch: "command", name: "함교 긴급 명령", desc: "교전 중 방어와 도주 지시의 효율을 높입니다.", maxLevel: 3, cost: 2, requires: "command-crisis-protocol", bonus: ["도주 성공률 +", "방어 지시 효율 +"] },
  { id: "command-expedition-doctrine", branch: "command", name: "장거리 원정 교리", desc: "후반 섹터 장거리 탐사에서 보급과 지휘 안정성을 제공합니다.", maxLevel: 3, cost: 3, requires: "command-emergency-order", bonus: ["장거리 이동 페널티 감소", "스캔 후속 선택지 강화"] },

  { id: "exploration-deep-scan", branch: "exploration", name: "심층 스캔 I", desc: "스캐너 감도와 범위를 높여 더 많은 탐사 정보를 얻습니다.", maxLevel: 3, cost: 1, bonus: ["탐사 속도 +10%", "이상 탐지 확률 +5%"] },
  { id: "exploration-probe", branch: "exploration", name: "프로브 운용", desc: "탐사 프로브 투입 효율을 높입니다.", maxLevel: 3, cost: 1, requires: "exploration-deep-scan", bonus: ["프로브 보상 +12%"] },
  { id: "exploration-cartography", branch: "exploration", name: "성도 작성", desc: "미확인 구역 발견률을 올립니다.", maxLevel: 3, cost: 1, requires: "exploration-probe", bonus: ["구역 공개 확률 +8%"] },
  { id: "exploration-anomaly", branch: "exploration", name: "이상현상 판독", desc: "성운, 관문, 블랙홀 스캔 보상을 강화합니다.", maxLevel: 3, cost: 2, requires: "exploration-cartography", bonus: ["이상현상 보상 +15%"] },
  { id: "exploration-signal-decoder", branch: "exploration", name: "미지 신호 해석", desc: "짧은 신호 노이즈에서 숨겨진 항로와 구역 단서를 추출합니다.", maxLevel: 3, cost: 2, requires: "exploration-anomaly", bonus: ["숨겨진 구역 발견률 +", "신호 이벤트 보상 +"] },
  { id: "exploration-hazard-reading", branch: "exploration", name: "위험 구역 판독", desc: "위험도 높은 구역에서 손실을 예측하고 보상을 최대화합니다.", maxLevel: 3, cost: 2, requires: "exploration-signal-decoder", bonus: ["위험 4+ 구역 보상 +", "스캔 실패 페널티 감소"] },
  { id: "exploration-deep-frontier", branch: "exploration", name: "심우주 항로 개척", desc: "후반 섹터와 잠금 구역 진입을 위한 장거리 항로 개척 능력입니다.", maxLevel: 3, cost: 3, requires: "exploration-hazard-reading", bonus: ["후반 섹터 발견률 +", "항로 설정 효율 +"] },

  { id: "combat-targeting", branch: "combat", name: "표적 분석", desc: "적 방어막과 선체에 주는 실제 피해를 높입니다.", maxLevel: 3, cost: 1, implemented: true, bonus: ["라운드 피해 +6%/Lv"] },
  { id: "combat-evasion", branch: "combat", name: "회피 기동 교범", desc: "회피 기동 시 선체 손상을 줄입니다.", maxLevel: 3, cost: 1, requires: "combat-targeting", bonus: ["회피 피해 -8%"] },
  { id: "combat-shield", branch: "combat", name: "방어막 과충전", desc: "방어막 강화 지시의 효율을 높입니다.", maxLevel: 3, cost: 1, requires: "combat-evasion", bonus: ["방어 태세 +10%"] },
  { id: "combat-boarding", branch: "combat", name: "강습 작전", desc: "전투 승리 보상과 회수품 획득량을 높입니다.", maxLevel: 3, cost: 2, requires: "combat-shield", bonus: ["전투 보상 +12%"] },
  { id: "combat-shield-cutter", branch: "combat", name: "방어막 절단 사격", desc: "적 방어막을 먼저 무너뜨리는 집중 사격 교리를 해금합니다.", maxLevel: 3, cost: 2, requires: "combat-boarding", bonus: ["방어막 피해 +", "공격 집중 효율 +"] },
  { id: "combat-weakpoint-mark", branch: "combat", name: "약점 표식", desc: "사냥과 전투 양쪽에서 목표의 취약 부위를 빠르게 식별합니다.", maxLevel: 3, cost: 2, requires: "combat-shield-cutter", bonus: ["사냥 성공률 +", "치명 보정 +"] },
  { id: "combat-fleet-pressure", branch: "combat", name: "함대전 압박 교리", desc: "고위험 적 함대와 장기 교전에서 보상과 생존성을 높입니다.", maxLevel: 3, cost: 3, requires: "combat-weakpoint-mark", bonus: ["고위험 적 보상 +", "장기전 피해 감소"] },

  { id: "engineering-efficiency", branch: "engineering", name: "동력 효율", desc: "항법 이동 시 항로 연료 소모를 줄입니다.", maxLevel: 3, cost: 1, implemented: true, bonus: ["항법 이동 연료 -5%/Lv"] },
  { id: "engineering-repair", branch: "engineering", name: "현장 수리", desc: "작업 대기열로 수행하는 선체 수리량을 강화합니다.", maxLevel: 3, cost: 1, requires: "engineering-efficiency", implemented: true, bonus: ["대기열 선체 수리량 +12%/Lv"] },
  { id: "engineering-cargo", branch: "engineering", name: "화물 최적화", desc: "적재 효율과 자원 보관 안정성을 높입니다.", maxLevel: 3, cost: 1, requires: "engineering-repair", bonus: ["적재 효율 +8%"] },
  { id: "engineering-overclock", branch: "engineering", name: "모듈 오버클럭", desc: "고급 모듈의 성능 한계를 끌어올립니다.", maxLevel: 3, cost: 2, requires: "engineering-cargo", bonus: ["모듈 보정 +10%"] },
  { id: "engineering-lightweight", branch: "engineering", name: "모듈 경량화", desc: "중장갑, 대형 무기, 심층 화물창의 페널티를 완화합니다.", maxLevel: 3, cost: 2, requires: "engineering-overclock", bonus: ["장비 페널티 완화", "회피 손실 감소"] },
  { id: "engineering-power-reroute", branch: "engineering", name: "긴급 전력 우회", desc: "연료나 산소가 부족할 때 필수 계통에 전력을 우선 배분합니다.", maxLevel: 3, cost: 2, requires: "engineering-lightweight", bonus: ["연료 부족 생존 보정", "산소 부족 페널티 완화"] },
  { id: "engineering-nanite-mesh", branch: "engineering", name: "자가수복 나노망", desc: "교전과 사냥 후 선체 손상을 일부 자동 복구합니다.", maxLevel: 3, cost: 3, requires: "engineering-power-reroute", bonus: ["선체 회복 +", "수리 효율 +"] },

  { id: "science-analysis", branch: "science", name: "시료 분석", desc: "생체 샘플과 유물 분석 보상을 높입니다.", maxLevel: 3, cost: 1, bonus: ["과학 보상 +8%"] },
  { id: "science-relic", branch: "science", name: "유물 해독", desc: "고대 신호체 계약과 유물 보상을 강화합니다.", maxLevel: 3, cost: 1, requires: "science-analysis", bonus: ["유물 보상 +10%"] },
  { id: "science-biology", branch: "science", name: "외계 생물학", desc: "사냥 성공률과 생체 아이템 획득률을 높입니다.", maxLevel: 3, cost: 1, requires: "science-relic", bonus: ["사냥 성공 +8%"] },
  { id: "science-singularity", branch: "science", name: "특이점 연구", desc: "블랙홀과 관문 구역에서 고급 보상을 얻습니다.", maxLevel: 3, cost: 2, requires: "science-biology", bonus: ["심층권 보상 +15%"] },
  { id: "science-xeno-anatomy", branch: "science", name: "생체 해부학", desc: "외계 생명체의 장기 구조를 분석해 사냥 보상을 늘립니다.", maxLevel: 3, cost: 2, requires: "science-singularity", bonus: ["사냥 보상 +", "생체 재료 획득률 +"] },
  { id: "science-singularity-physics", branch: "science", name: "특이점 물리학", desc: "블랙홀, 관문, 시간왜곡 생명체의 이벤트를 안정적으로 해석합니다.", maxLevel: 3, cost: 2, requires: "science-xeno-anatomy", bonus: ["블랙홀 보상 +", "시간왜곡 위험 감소"] },
  { id: "science-ancient-ai", branch: "science", name: "고대 AI 역분석", desc: "고대 감시자와 세라핌 계열 전리품의 분석 효율을 높입니다.", maxLevel: 3, cost: 3, requires: "science-singularity-physics", bonus: ["고대 AI 보상 +", "세라핌 계열 해금 보정"] },

  { id: "diplomacy-contract", branch: "diplomacy", name: "계약 보상", desc: "일반 임무의 확정 자원 보상만 높입니다. 평판에는 적용되지 않습니다.", maxLevel: 3, cost: 1, implemented: true, bonus: ["일반 임무 확정 보상 +8%/Lv"] },
  { id: "diplomacy-market", branch: "diplomacy", name: "시장 교섭", desc: "시장 보급과 모듈 구매 비용을 낮춥니다.", maxLevel: 3, cost: 1, requires: "diplomacy-contract", bonus: ["시장 가격 -5%"] },
  { id: "diplomacy-checkpoint", branch: "diplomacy", name: "검문 대응", desc: "연방 검문과 세력 충돌 이벤트의 페널티를 줄입니다.", maxLevel: 3, cost: 1, requires: "diplomacy-market", bonus: ["검문 위험 -10%"] },
  { id: "diplomacy-shadow", branch: "diplomacy", name: "비공식 채널", desc: "위험 세력과의 거래 선택지를 넓힙니다.", maxLevel: 3, cost: 2, requires: "diplomacy-checkpoint", bonus: ["특수 계약 해금"] },
  { id: "diplomacy-negotiation", branch: "diplomacy", name: "검문 협상술", desc: "순찰함, 연방 검문, 기업 경비대와의 충돌 피해를 줄입니다.", maxLevel: 3, cost: 2, requires: "diplomacy-shadow", bonus: ["검문 페널티 감소", "평판 손실 완화"] },
  { id: "diplomacy-corporate-broker", branch: "diplomacy", name: "기업 계약 브로커", desc: "기업·정거장 의뢰에서 더 좋은 보상 조건을 끌어냅니다.", maxLevel: 3, cost: 2, requires: "diplomacy-negotiation", bonus: ["계약 보상 +", "신규 의뢰 품질 +"] },
  { id: "diplomacy-black-market", branch: "diplomacy", name: "암시장 접선", desc: "희귀 모듈과 불법 비컨 기반 특수 거래를 해금합니다.", maxLevel: 3, cost: 3, requires: "diplomacy-corporate-broker", bonus: ["희귀 모듈 후보 +", "암시장 이벤트 해금"] },
];

export const starterSkillLevels = {
  "combat-targeting": 1,
  "engineering-efficiency": 1,
  "diplomacy-contract": 1,
};

export const IMPLEMENTED_SKILL_IDS = new Set(skills.filter((skill) => skill.implemented).map((skill) => skill.id));
export const isImplementedSkill = (id) => IMPLEMENTED_SKILL_IDS.has(id);

export const getSkillById = (id) => skills.find((skill) => skill.id === id);
export const getSkillsByBranch = (branchId) => skills.filter((skill) => skill.branch === branchId);
