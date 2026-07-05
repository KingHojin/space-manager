const CREW_IDLE_ACTIONS = ["식사 중", "휴식 중", "생활구역 정리", "동료와 대화", "개인 장비 점검"];
const ROLE_ACTIONS = {
  함교: ["항로 분석", "교신 감청", "성계 데이터 갱신", "위험 신호 분류"],
  기관실: ["엔진 출력 조율", "냉각계 점검", "연료 라인 검사", "예비 부품 정리"],
  포탑: ["사격 시뮬레이션", "탄약고 점검", "표적 추적 훈련", "외곽 순찰"],
  의무실: ["의무실 소독", "피로도 체크", "응급 키트 보충", "승무원 건강 기록 정리"],
};

const SIGNAL_TEMPLATES = [
  { icon: "📡", title: "미확인 심우주 신호", desc: "반복 주기가 일정하지 않습니다. 오래 방치하면 좌표가 사라질 수 있습니다.", tone: "border-cyan-400/35 bg-cyan-400/10", targetPanel: "exploration" },
  { icon: "🛰", title: "표류 위성 데이터", desc: "구형 탐사 위성이 아직 살아 있습니다. 회수하면 지도 조각을 얻을 수 있습니다.", tone: "border-sky-400/35 bg-sky-400/10", targetPanel: "exploration" },
  { icon: "💬", title: "시장 소문", desc: "정거장 상인들이 특정 광물 가격 급등을 이야기합니다. 계약을 확인할 가치가 있습니다.", tone: "border-emerald-400/35 bg-emerald-400/10", targetPanel: "market" },
  { icon: "☄️", title: "혜성 꼬리 샘플", desc: "짧은 시간만 접근 가능한 채집 기회입니다. 연료와 선체 여유가 필요합니다.", tone: "border-amber-400/35 bg-amber-400/10", targetPanel: "exploration" },
  { icon: "🛸", title: "해적 잔해 루머", desc: "전투 흔적이 남은 좌표가 공유됐습니다. 위험하지만 부품 회수 가능성이 있습니다.", tone: "border-red-400/35 bg-red-400/10", targetPanel: "combat" },
  { icon: "🌌", title: "성운 이상치", desc: "스캐너가 불가능한 밀도 변화를 감지했습니다. 장거리 탐사의 새 목적지가 될 수 있습니다.", tone: "border-violet-400/35 bg-violet-400/10", targetPanel: "exploration" },
  { icon: "🧬", title: "생체 반응 구역", desc: "행성 표면에서 낮은 확률의 생명 반응이 포착됐습니다. 상륙 탐사 후보입니다.", tone: "border-lime-400/35 bg-lime-400/10", targetPanel: "hunting" },
  { icon: "📦", title: "버려진 화물 기록", desc: "항로 주변에 등록되지 않은 화물 포드 기록이 있습니다. 회수 경쟁이 붙을 수 있습니다.", tone: "border-orange-400/35 bg-orange-400/10", targetPanel: "exploration" },
];

function stableIndex(seed, offset, length) {
  const value = Math.abs(Math.sin(seed * 12.9898 + offset * 78.233) * 43758.5453);
  return Math.floor(value) % length;
}

export function getCrewActivity(member, currentMinute, index = 0) {
  if (!member?.alive) return "작전 제외";
  if (member.injury && member.injury !== "정상") return `${member.injury} 치료 대기`;
  if ((member.fatigue ?? 0) >= 75) return "피로 누적 · 휴식 필요";
  const bucket = Math.floor(currentMinute / 18);
  const roleActions = ROLE_ACTIONS[member.role] ?? CREW_IDLE_ACTIONS;
  const actionPool = index % 3 === 0 ? [...roleActions, ...CREW_IDLE_ACTIONS] : [...roleActions, ...CREW_IDLE_ACTIONS.slice(0, 2)];
  return actionPool[stableIndex(bucket, index + member.id.length, actionPool.length)];
}

export function getFrontierSignals({ currentMinute, discoveredCount = 0, dangerCount = 0, activeContracts = 0 }) {
  const bucket = Math.floor(currentMinute / 30) + discoveredCount * 3 + dangerCount * 5 + activeContracts * 7;
  const count = 4;
  return Array.from({ length: count }).map((_, index) => {
    const template = SIGNAL_TEMPLATES[stableIndex(bucket, index, SIGNAL_TEMPLATES.length)];
    const urgency = ["낮음", "보통", "높음"][stableIndex(bucket, index + 11, 3)];
    const expiresIn = 8 + stableIndex(bucket, index + 23, 48);
    return {
      ...template,
      id: `${template.title}-${bucket}-${index}`,
      urgency,
      expiresIn,
    };
  });
}

export function getShipStatus({ resources, activeTravel, pendingTravelEvent, pendingCombatEncounter }) {
  if (pendingCombatEncounter) return { label: "긴급 교전", tone: "hud-chip-danger", desc: "전투 탭에서 즉시 대응 필요" };
  if (pendingTravelEvent) return { label: "항해 이벤트", tone: "hud-chip-warn", desc: "메뉴 또는 탐사 화면에서 선택 지시 필요" };
  if ((resources.hull ?? 100) < 25) return { label: "선체 위험", tone: "hud-chip-danger", desc: "수리와 회피 기동 우선" };
  if ((resources.fuel ?? 100) < 25 || (resources.oxygen ?? 100) < 25) return { label: "자원 경고", tone: "hud-chip-warn", desc: "보급 계획 필요" };
  if (activeTravel) return { label: "항해 중", tone: "hud-chip-accent", desc: "도착 전까지 작업과 이벤트 대응 가능" };
  return { label: "정상 운항", tone: "hud-chip-success", desc: "다음 항로 또는 계약 선택 가능" };
}
