import { ROOMS } from "../data/shipRooms";
import { getCrisisConfig } from "./crisisSystem";
import { getRoleCoverage, injuryLabel, isInjured } from "./injurySystem";

const CREW_IDLE_ACTIONS = ["식사 중", "휴식 중", "생활구역 정리", "동료와 대화", "개인 장비 점검"];
const ROOM_LABELS = Object.fromEntries(ROOMS.map((room) => [room.id, room.label]));
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
  { icon: "🧬", title: "생체 반응 구역", desc: "행성 표면에서 낮은 확률의 생명 반응이 포착됐습니다. 상륙 탐사 후보입니다.", tone: "border-lime-400/35 bg-lime-400/10", targetPanel: "combat" },
  { icon: "📦", title: "버려진 화물 기록", desc: "항로 주변에 등록되지 않은 화물 포드 기록이 있습니다. 회수 경쟁이 붙을 수 있습니다.", tone: "border-orange-400/35 bg-orange-400/10", targetPanel: "exploration" },
];

// Phase 18-E: priority-vocabulary boundary note.
//
// This module owns the "card priority" vocabulary — critical/high/medium/
// low/info — used ONLY for situation-card severity/sort order in
// getSituationCards/summarizeSituations below. It is deliberately separate
// from systems/priorities.js's "activity priority" vocabulary (emergency/
// high/normal/low): they classify different things (a UI card's urgency vs.
// a crew member's current task/order) and happen to share the word "high"
// only by coincidence, not by shared meaning — do not assume a card's
// priority and an activity's priority with the same label mean the same
// severity.
//
// This module's card-priority values are also reused directly by
// systems/injurySystem.js (INJURY_CATALOG.priority: info/high/critical) for
// injury severity; systems/injurySystem.js#injuryActivityPriority is the one
// sanctioned place that crosses from there into the activity vocabulary.
// See systems/priorities.js's header comment for the full map.
//
// Rooms below are handled via shipInteriorStore's own status vocabulary
// (안정/점검 필요/위험/위기/작업 중, from systems/roomJobs.js#deriveRoomStatus)
// — a fourth, independent vocabulary describing physical room condition, not
// priority. `criticalRooms`/`maintenanceRooms` just gate which card gets
// created; each card's own `priority` literal ("critical/medium") is chosen
// directly at the call site below, not derived through a shared conversion
// table, since this is the only place room-status feeds a situation card.
const PRIORITY_SCORE = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
const PRIORITY_LABEL = { critical: "긴급", high: "높음", medium: "보통", low: "낮음", info: "정보" };
const PRIORITY_TONE = {
  critical: "border-red-400/45 bg-red-400/10 text-red-100",
  high: "border-amber-300/45 bg-amber-300/10 text-amber-100",
  medium: "border-cyan-300/35 bg-cyan-300/10 text-cyan-100",
  low: "border-slate-500/40 bg-slate-500/10 text-slate-100",
  info: "border-emerald-300/35 bg-emerald-300/10 text-emerald-100",
};

function stableIndex(seed, offset, length) {
  const value = Math.abs(Math.sin(seed * 12.9898 + offset * 78.233) * 43758.5453);
  return Math.floor(value) % length;
}

function situation({ id, priority = "info", icon = "•", title, desc, action, targetPanel, meta = null }) {
  return { id, priority, priorityLabel: PRIORITY_LABEL[priority] ?? priority, tone: PRIORITY_TONE[priority] ?? PRIORITY_TONE.info, icon, title, desc, action, targetPanel, meta };
}

export function getCrewActivity(member, currentMinute, index = 0) {
  if (!member?.alive) return "작전 제외";
  if (isInjured(member.injury)) return `${injuryLabel(member.injury)} 치료 대기`;
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
    return { ...template, id: `${template.title}-${bucket}-${index}`, urgency, expiresIn };
  });
}

export function getShipStatus({ resources, activeTravel, pendingTravelEvent, pendingCombatEncounter, activeCrises = [] }) {
  if (activeCrises.length > 0) return { label: "함내 위기", tone: "hud-chip-danger", desc: `${activeCrises.length}개 구역에서 급성 위기 대응 중` };
  if (pendingCombatEncounter) return { label: "긴급 교전", tone: "hud-chip-danger", desc: "전투 탭에서 즉시 대응 필요" };
  if (pendingTravelEvent) return { label: "항해 이벤트", tone: "hud-chip-warn", desc: "메뉴 또는 탐사 화면에서 선택 지시 필요" };
  if ((resources.hull ?? 100) < 25) return { label: "선체 위험", tone: "hud-chip-danger", desc: "수리와 회피 기동 우선" };
  if ((resources.fuel ?? 100) < 25 || (resources.oxygen ?? 100) < 25) return { label: "자원 경고", tone: "hud-chip-warn", desc: "보급 계획 필요" };
  if (activeTravel) return { label: "항해 중", tone: "hud-chip-accent", desc: "도착 전까지 작업과 이벤트 대응 가능" };
  return { label: "정상 운항", tone: "hud-chip-success", desc: "다음 항로 또는 계약 선택 가능" };
}

export function getSituationCards({
  resources,
  activeTravel,
  pendingTravelEvent,
  pendingCombatEncounter,
  crew = [],
  trainingQueue = [],
  treatmentQueue = [],
  installationQueue = [],
  skillPoints = 0,
  activeContracts = [],
  nextContracts = [],
  travelProgress = 0,
  currentMinute = 0,
  rooms = [],
  activeCrises = [],
}) {
  const cards = [];
  const aliveCrew = crew.filter((member) => member.alive);
  const injuredCrew = aliveCrew.filter((member) => isInjured(member.injury));
  const criticalInjuredCrew = injuredCrew.filter((member) => ["위독", "전투불능"].includes(injuryLabel(member.injury)));
  const exhaustedCrew = aliveCrew.filter((member) => (member.fatigue ?? 0) >= 80);
  const tiredCrew = aliveCrew.filter((member) => (member.fatigue ?? 0) >= 65);
  const queuedWorkCount = trainingQueue.length + treatmentQueue.length + installationQueue.length;
  const criticalRooms = rooms.filter((room) => room.status === "위험" || room.status === "위기");
  const maintenanceRooms = rooms.filter((room) => room.status === "점검 필요");
  const roleCoverage = getRoleCoverage(aliveCrew);

  activeCrises.forEach((crisis) => {
    const config = getCrisisConfig(crisis.type);
    const roomLabel = ROOM_LABELS[crisis.roomId] ?? crisis.roomId;
    const responding = Boolean(crisis.assignedCrewId);
    cards.push(situation({
      id: `crisis-${crisis.id}`,
      priority: !responding || crisis.severity >= 2 ? "critical" : "high",
      icon: config.icon,
      title: `${roomLabel} ${config.label}`,
      desc: `${responding ? "대응 중" : "미대응"} · severity ${crisis.severity} · 진행 ${Math.round(crisis.progress ?? 0)}%`,
      action: config.actionLabel,
      targetPanel: "crew",
      meta: responding ? `${Math.round(crisis.progress ?? 0)}%` : "미대응",
    }));
  });

  roleCoverage.missingRoles.forEach((role) => {
    const label = role === "기관실" ? "엔지니어 부재" : role === "의무실" ? "메딕 부재" : "함교 역할 공백";
    const desc = role === "기관실" ? "기관실 상태 감소와 수리 대응이 불안정합니다." : role === "의무실" ? "부상 회복이 느려지고 악화 위험이 커집니다." : "항해 판단과 조우 대응 안정성이 낮아집니다.";
    cards.push(situation({ id: `role-gap-${role}`, priority: "high", icon: "⚠️", title: label, desc, action: "승무원 확인", targetPanel: "crew", meta: "공백" }));
  });

  if (pendingCombatEncounter) cards.push(situation({ id: "pending-combat", priority: "critical", icon: "☠️", title: "긴급 교전 발생", desc: pendingCombatEncounter.title ?? "미확인 적성 함선 접근", action: "전술 지시", targetPanel: "combat", meta: "즉시" }));
  if (pendingTravelEvent) cards.push(situation({ id: "pending-travel-event", priority: "critical", icon: "⚠️", title: "항해 이벤트 결재 대기", desc: `${pendingTravelEvent.title}: 선택하지 않아도 항해 시간은 계속 흐릅니다.`, action: "선택지 확인", targetPanel: "exploration", meta: "항해 중" }));

  if ((resources.hull ?? 100) <= 20) cards.push(situation({ id: "hull-critical", priority: "critical", icon: "🛑", title: "선체 무결성 위험", desc: `현재 선체 ${Math.round(resources.hull)}%. 장거리 항해와 교전을 피해야 합니다.`, action: "정비", targetPanel: "ship", meta: "위험" }));
  else if ((resources.hull ?? 100) < 40) cards.push(situation({ id: "hull-warning", priority: "high", icon: "🧯", title: "선체 수리 권장", desc: `현재 선체 ${Math.round(resources.hull)}%. 다음 위험 구역 진입 전 정비가 필요합니다.`, action: "정비", targetPanel: "ship", meta: "주의" }));

  if ((resources.oxygen ?? 100) <= 20) cards.push(situation({ id: "oxygen-critical", priority: "critical", icon: "🫁", title: "산소 부족", desc: `산소 ${Math.round(resources.oxygen)}%. 항해 지속 시 승무원 위험이 커집니다.`, action: "보급", targetPanel: "market", meta: "치명" }));
  else if ((resources.oxygen ?? 100) < 35) cards.push(situation({ id: "oxygen-warning", priority: "high", icon: "🫁", title: "산소 보급 필요", desc: `산소 ${Math.round(resources.oxygen)}%. 장거리 항해 전 보급을 추천합니다.`, action: "보급", targetPanel: "market", meta: "주의" }));

  if ((resources.fuel ?? 100) <= 20) cards.push(situation({ id: "fuel-critical", priority: "critical", icon: "⛽", title: "연료 고갈 임박", desc: `연료 ${Math.round(resources.fuel)}%. 표류 위험이 급격히 상승합니다.`, action: "보급", targetPanel: "market", meta: "치명" }));
  else if ((resources.fuel ?? 100) < 35) cards.push(situation({ id: "fuel-warning", priority: "high", icon: "⛽", title: "연료 보급 권장", desc: `연료 ${Math.round(resources.fuel)}%. 항해 이벤트 대응 여력이 낮습니다.`, action: "보급", targetPanel: "market", meta: "주의" }));

  if (criticalRooms.length > 0 && activeCrises.length === 0) {
    const names = criticalRooms.map((room) => ROOM_LABELS[room.id] ?? room.id).join(", ");
    cards.push(situation({ id: "rooms-critical", priority: "critical", icon: "🚨", title: "함선 구역 위험", desc: `${names} 구역이 위험 상태입니다. 승무원을 배정해 상태를 안정시키세요.`, action: "구역 확인", targetPanel: "crew", meta: `${criticalRooms.length}곳` }));
  } else if (maintenanceRooms.length > 0) {
    const names = maintenanceRooms.map((room) => ROOM_LABELS[room.id] ?? room.id).join(", ");
    cards.push(situation({ id: "rooms-maintenance", priority: "medium", icon: "🔧", title: "점검 필요 구역", desc: `${names} 구역 상태가 저하되고 있습니다. 여유 있을 때 정비를 배정하세요.`, action: "구역 확인", targetPanel: "crew", meta: `${maintenanceRooms.length}곳` }));
  }

  if (criticalInjuredCrew.length > 0) cards.push(situation({ id: "critical-injured-crew", priority: "critical", icon: "🚑", title: "위독 승무원 발생", desc: `${criticalInjuredCrew.length}명이 집중 치료가 필요합니다. 메딕과 의무실 공백을 확인하세요.`, action: "의무실", targetPanel: "crew", meta: `${criticalInjuredCrew.length}명` }));
  else if (injuredCrew.length > 0) cards.push(situation({ id: "injured-crew", priority: injuredCrew.length >= 2 ? "critical" : "high", icon: "✚", title: "부상자 치료 대기", desc: `${injuredCrew.length}명이 치료가 필요합니다. 치료 큐를 배정하세요.`, action: "의무실", targetPanel: "crew", meta: `${injuredCrew.length}명` }));

  if (exhaustedCrew.length > 0) cards.push(situation({ id: "crew-exhausted", priority: "high", icon: "😵", title: "승무원 피로 누적", desc: `${exhaustedCrew.length}명이 한계 피로 상태입니다. 휴식 또는 교대가 필요합니다.`, action: "휴식 배정", targetPanel: "crew", meta: `${exhaustedCrew.length}명` }));
  else if (tiredCrew.length > 0) cards.push(situation({ id: "crew-tired", priority: "medium", icon: "☕", title: "승무원 피로 관리", desc: `${tiredCrew.length}명의 피로가 높습니다. 장거리 항해 전에 휴식시키면 안정적입니다.`, action: "확인", targetPanel: "crew", meta: `${tiredCrew.length}명` }));

  if (activeTravel) {
    const remaining = Math.max(0, Math.ceil((activeTravel.completeAt ?? currentMinute) - currentMinute));
    cards.push(situation({ id: "active-travel", priority: pendingTravelEvent ? "high" : "medium", icon: "🚀", title: "항해 진행 중", desc: `진행률 ${Math.round(travelProgress)}%. 남은 ${remaining}분 동안 훈련·치료·정비 작업을 병행할 수 있습니다.`, action: "항해판", targetPanel: "exploration", meta: `${Math.round(travelProgress)}%` }));
  } else cards.push(situation({ id: "no-route", priority: "medium", icon: "🧭", title: "항로 미지정", desc: "함선이 대기 중입니다. 프론티어 신호나 계약을 보고 다음 목적지를 지정하세요.", action: "항로 설정", targetPanel: "exploration", meta: "대기" }));

  if (queuedWorkCount === 0) cards.push(situation({ id: "empty-queue", priority: "medium", icon: "🗂", title: "작업 큐 비어 있음", desc: "훈련, 치료, 모듈 장착/개선을 예약하면 항해 시간이 낭비되지 않습니다.", action: "작업 배정", targetPanel: "crew", meta: "0건" }));
  else cards.push(situation({ id: "active-queue", priority: "info", icon: "⏳", title: "작업 큐 진행 중", desc: `${queuedWorkCount}건의 훈련/치료/정비가 진행 중입니다. 완료 시 자동 보고됩니다.`, action: "큐 확인", targetPanel: "crew", meta: `${queuedWorkCount}건` }));

  if (skillPoints > 0) cards.push(situation({ id: "skill-points", priority: "medium", icon: "🌟", title: "스킬 포인트 사용 가능", desc: `${skillPoints}포인트를 사용해 탐사/전투/공학 방향성을 강화할 수 있습니다.`, action: "스킬트리", targetPanel: "skilltree", meta: `${skillPoints}P` }));
  if (activeContracts.length > 0) cards.push(situation({ id: "active-contracts", priority: "info", icon: "📑", title: "진행 중 의뢰", desc: `${activeContracts.length}개의 계약이 진행 중입니다. 목적지와 보상 조건을 확인하세요.`, action: "계약 확인", targetPanel: "market", meta: `${activeContracts.length}건` }));
  else if (nextContracts.length > 0) cards.push(situation({ id: "available-contracts", priority: "low", icon: "💼", title: "새 의뢰 후보", desc: `${nextContracts.length}개의 계약 후보가 있습니다. 탐험 루프를 만들기 좋습니다.`, action: "시장", targetPanel: "market", meta: `${nextContracts.length}건` }));

  return cards.sort((a, b) => (PRIORITY_SCORE[a.priority] ?? 9) - (PRIORITY_SCORE[b.priority] ?? 9));
}

export function summarizeSituations(cards = []) {
  return cards.reduce(
    (acc, card) => {
      acc.total += 1;
      if (card.priority === "critical") acc.critical += 1;
      if (card.priority === "high") acc.high += 1;
      if (["medium", "low"].includes(card.priority)) acc.normal += 1;
      if (card.priority === "info") acc.info += 1;
      return acc;
    },
    { total: 0, critical: 0, high: 0, normal: 0, info: 0 },
  );
}
