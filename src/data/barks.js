export const BARK_TRIGGERS = Object.freeze({
  onIdle: "onIdle",
  onChat: "onChat",
  onWork: "onWork",
  onRest: "onRest",
  onTreat: "onTreat",
  onCrisis: "onCrisis",
  onDown: "onDown",
  onLowFuel: "onLowFuel",
  onDrift: "onDrift",
});

export const BARKS_BY_TRIGGER = Object.freeze({
  [BARK_TRIGGERS.onIdle]: [
    { text: "이상 없음.", archetype: null },
    { text: "잠깐 확인 중.", archetype: null },
    { text: "함내 조용함.", archetype: null },
    { text: "대기 위치 유지.", archetype: null },
  ],
  [BARK_TRIGGERS.onChat]: [
    { text: "방금 봤어?", archetype: null },
    { text: "잠깐 얘기 좀.", archetype: null },
    { text: "교대 시간 확인.", archetype: null },
    { text: "소문은 나중에.", archetype: null },
  ],
  [BARK_TRIGGERS.onWork]: [
    { text: "작업 들어간다.", archetype: null },
    { text: "출력 안정화 중.", archetype: null },
    { text: "체크리스트 확인.", archetype: null },
    { text: "여기 손봐야 해.", archetype: null },
  ],
  [BARK_TRIGGERS.onRest]: [
    { text: "잠깐 숨 돌림.", archetype: null },
    { text: "휴식 필요.", archetype: null },
    { text: "눈 좀 붙일게.", archetype: null },
  ],
  [BARK_TRIGGERS.onTreat]: [
    { text: "의무실로.", archetype: null, rooms: ["medbay"] },
    { text: "상태 확인 중.", archetype: null },
    { text: "처치 준비.", archetype: null, rooms: ["medbay"] },
    { text: "움직이지 마.", archetype: null },
  ],
  [BARK_TRIGGERS.onCrisis]: [
    { text: "비상 대응!", archetype: null },
    { text: "서둘러!", archetype: null },
    { text: "위치 잡았다!", archetype: null },
    { text: "화면 확인!", archetype: null },
  ],
  [BARK_TRIGGERS.onDown]: [
    { text: "으윽...", archetype: null },
    { text: "지원 필요...", archetype: null },
    { text: "움직이기 힘들어.", archetype: null },
  ],
  [BARK_TRIGGERS.onLowFuel]: [
    { text: "연료 경고.", archetype: null, rooms: ["engineering", "bridge"] },
    { text: "소모율 확인.", archetype: null, rooms: ["engineering"] },
    { text: "항로 재계산.", archetype: null, rooms: ["bridge"] },
  ],
  [BARK_TRIGGERS.onDrift]: [
    { text: "표류 상태야.", archetype: null },
    { text: "추진력 없음.", archetype: null, rooms: ["engineering"] },
    { text: "구조 신호 준비.", archetype: null, rooms: ["bridge", "ops"] },
  ],
});

function matchesContext(entry, context = {}) {
  if (entry.rooms && !entry.rooms.includes(context.roomId)) return false;
  if (entry.idleActions && !entry.idleActions.includes(context.idleAction)) return false;
  return true;
}

export function getBarksForTrigger(trigger, context = {}) {
  return (BARKS_BY_TRIGGER[trigger] ?? []).filter((entry) => matchesContext(entry, context));
}

export function pickBark(trigger, context = {}) {
  const pool = getBarksForTrigger(trigger, context);
  if (pool.length === 0) return null;
  const entry = pool[Math.floor(Math.random() * pool.length)];
  return entry?.text ?? null;
}
