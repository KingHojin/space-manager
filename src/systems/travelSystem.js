import { getZoneById } from "../data/sectors";

const LY_PER_MAP_UNIT = 1 / 5;
const BASE_FUEL_PER_LY = 1.35;
const ENCOUNTER_ROLL_INTERVAL = 6;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function pickByRoll(table) {
  const roll = Math.random();
  return table.find((entry) => roll <= entry.threshold) ?? table[table.length - 1];
}

function scalePenalty(base, danger, mitigation = 0) {
  return -Math.max(1, Math.round(base + danger * 0.9 - mitigation));
}

export function getShipStats(modules = []) {
  return modules.reduce(
    (acc, module) => {
      Object.entries(module?.stats ?? {}).forEach(([key, value]) => {
        acc[key] = (acc[key] ?? 0) + value;
      });
      return acc;
    },
    { engine: 0, fuelEfficiency: 0, scanner: 0, control: 0, evasion: 0, defense: 0, attack: 0 },
  );
}

export function calculateRouteDistance(fromZone, toZone) {
  if (!fromZone || !toZone) return 0;
  const dx = (toZone.pos?.x ?? 50) - (fromZone.pos?.x ?? 50);
  const dy = (toZone.pos?.y ?? 50) - (fromZone.pos?.y ?? 50);
  const mapLy = Math.hypot(dx, dy) * LY_PER_MAP_UNIT;
  const radialLy = Math.abs((toZone.distance ?? 0) - (fromZone.distance ?? 0));
  return Math.max(1, Math.round(mapLy * 0.65 + radialLy * 0.75));
}

export function calculateTravelDuration(distanceLy, danger = 1, stats = {}) {
  const engineBonus = clamp((stats.engine ?? 0) * 0.018, 0, 0.28);
  const dangerTax = clamp((danger - 1) * 0.035, 0, 0.22);
  const efficiency = 1 - engineBonus + dangerTax;

  if (distanceLy <= 4) return Math.round(clamp(2 + distanceLy * 1.8, 2, 10) * efficiency);
  if (distanceLy <= 12) return Math.round(clamp(10 + (distanceLy - 4) * 2.5, 10, 30) * efficiency);
  return Math.round(clamp(30 + (distanceLy - 12) * 4.5, 30, 120) * efficiency);
}

export function calculateTravelPlan({ fromZone, toZone, modules = [], currentMinute }) {
  const stats = getShipStats(modules);
  const distanceLy = calculateRouteDistance(fromZone, toZone);
  const duration = Math.max(2, calculateTravelDuration(distanceLy, toZone?.danger ?? 1, stats));
  const speedLyPerHour = Number(((distanceLy / duration) * 60).toFixed(2));
  const fuelMultiplier = clamp(1 - (stats.fuelEfficiency ?? 0) * 0.035, 0.62, 1.45);
  const dangerTax = 1 + Math.max(0, (toZone?.danger ?? 1) - 2) * 0.04;
  const fuelCost = Math.max(1, Math.round(distanceLy * BASE_FUEL_PER_LY * fuelMultiplier * dangerTax));

  return {
    fromZoneId: fromZone.id,
    toZoneId: toZone.id,
    startedAt: currentMinute,
    completeAt: currentMinute + duration,
    lastEncounterAt: currentMinute,
    encounterRollInterval: ENCOUNTER_ROLL_INTERVAL,
    encounterCount: 0,
    duration,
    fuelCost,
    distanceLy,
    speedLyPerHour,
    stats,
  };
}

export function getTravelProgress(activeTravel, currentMinute) {
  if (!activeTravel) return 0;
  return clamp(((currentMinute - activeTravel.startedAt) / Math.max(1, activeTravel.duration)) * 100, 0, 100);
}

export function getTravelEncounterChance(activeTravel) {
  const target = getZoneById(activeTravel?.toZoneId);
  const stats = activeTravel?.stats ?? {};
  const danger = target?.danger ?? 1;
  const longTripPressure = Math.min(0.12, Math.max(0, (activeTravel?.duration ?? 0) - 30) * 0.002);
  return clamp(0.18 + danger * 0.04 + longTripPressure - (stats.scanner ?? 0) * 0.008 - (stats.control ?? 0) * 0.004, 0.08, 0.42);
}

export function shouldRollTravelEncounter(activeTravel, currentMinute) {
  if (!activeTravel) return false;
  const interval = activeTravel.encounterRollInterval ?? ENCOUNTER_ROLL_INTERVAL;
  return currentMinute - (activeTravel.lastEncounterAt ?? activeTravel.startedAt) >= interval;
}

export function createTravelEventCard(activeTravel, currentMinute) {
  const target = getZoneById(activeTravel?.toZoneId);
  const stats = activeTravel?.stats ?? {};
  const danger = target?.danger ?? 1;
  const mitigation = Math.max(0, (stats.defense ?? 0) * 0.08 + (stats.evasion ?? 0) * 0.06 + (stats.control ?? 0) * 0.04);
  const control = stats.control ?? 0;
  const evasion = stats.evasion ?? 0;
  const defense = stats.defense ?? 0;
  const attack = stats.attack ?? 0;

  const table = [
    {
      threshold: 0.16,
      id: "asteroid-approach",
      severity: "danger",
      title: "운석 접근",
      message: "고속 운석군이 항로 전방에 나타났습니다. 항해는 계속되지만 즉시 지시하지 않으면 선체 손상이 커질 수 있습니다.",
      choices: [
        { id: "evade", label: "회피기동", hint: "시간 증가 / 선체 피해 최소화", effects: { resources: { fuel: -1, hull: scalePenalty(1, danger, evasion * 0.18) }, delay: 2, message: "회피기동으로 항로가 늘어났지만 선체 피해를 줄였습니다." } },
        { id: "shield", label: "방어막 전개", hint: "연료 소모 / 안정 대응", effects: { resources: { fuel: -2, hull: scalePenalty(2, danger, defense * 0.2) }, message: "방어막이 파편 대부분을 흡수했습니다." } },
        { id: "breakthrough", label: "돌파", hint: "시간 절약 / 피해 큼", effects: { resources: { hull: scalePenalty(6, danger, mitigation) }, delay: -1, crewRisk: danger >= 4 ? "minor" : null, message: "정면 돌파로 시간을 아꼈지만 장갑에 충격이 누적됐습니다." } },
      ],
    },
    {
      threshold: 0.32,
      id: "pirate-contact",
      severity: "combat",
      title: "해적 출현",
      message: "식별 신호를 끈 소형 함선이 측면에서 접근합니다. 교전, 협상, 도주 중 하나를 지시해야 합니다.",
      choices: [
        { id: "engage", label: "교전", hint: "긴급 전투 전환", effects: { resources: { hull: scalePenalty(2, danger, attack * 0.16) }, combatHint: true, message: "무장 교전을 지시했습니다. 전투 탭에서 긴급 교전 대응이 필요합니다." } },
        { id: "negotiate", label: "협상", hint: "크레딧 지출 / 전투 회피", effects: { resources: { credits: -(80 + danger * 30) }, message: "보급품 일부를 넘기고 충돌을 피했습니다." } },
        { id: "run", label: "도주", hint: "연료·시간 소모", effects: { resources: { fuel: -3, hull: scalePenalty(1, danger, evasion * 0.12) }, delay: 4, message: "엔진 출력을 높여 추격권을 벗어났습니다." } },
        { id: "stealth", label: "은폐", hint: "산소 소모 / 성공 시 피해 없음", effects: { resources: { oxygen: -(2 + Math.max(0, danger - Math.round(control / 6))) }, delay: 2, message: "함내 동력을 낮추고 은폐 항해로 위협을 넘겼습니다." } },
      ],
    },
    {
      threshold: 0.48,
      id: "sos-signal",
      severity: "choice",
      title: "SOS 신호",
      message: "목적지 방향과 약간 벗어난 곳에서 조난 신호가 반복 송출됩니다. 함장은 시간을 쓸지 결정해야 합니다.",
      choices: [
        { id: "rescue", label: "구조", hint: "시간·산소 소모 / 보상 가능", effects: { resources: { oxygen: -3, credits: 120 + danger * 25 }, delay: 6, item: { id: "alloy-plate", qty: 1 }, message: "구조 작전 성공. 생존자가 보상과 부품을 넘겼습니다." } },
        { id: "ignore", label: "무시", hint: "일정 유지 / 사기 저하", effects: { message: "항로를 유지했습니다. 일부 승무원이 불편한 침묵을 보입니다." } },
        { id: "investigate", label: "조사", hint: "짧은 지연 / 정보 획득", effects: { resources: { oxygen: -1 }, delay: 3, reveal: true, dust: 5 + danger, message: "신호원을 추적해 주변 성계 데이터를 확보했습니다." } },
      ],
    },
    {
      threshold: 0.62,
      id: "stowaway",
      severity: "warning",
      title: "밀항자 발견",
      message: "화물칸 열 신호가 비정상입니다. 정비 드론이 신원 미상의 생체 반응을 발견했습니다.",
      choices: [
        { id: "arrest", label: "체포", hint: "부상 위험 / 질서 회복", effects: { resources: { hull: scalePenalty(1, danger, control * 0.12) }, crewRisk: danger >= 5 ? "minor" : null, message: "보안팀이 밀항자를 제압했습니다." } },
        { id: "watch", label: "감시", hint: "산소 소모 / 위험 보류", effects: { resources: { oxygen: -2 }, delay: 1, message: "격리 구획에 감시를 붙였습니다. 함내 긴장은 유지됩니다." } },
        { id: "leave", label: "방치", hint: "즉시 비용 없음 / 후폭풍", effects: { resources: { oxygen: -4 }, crewRisk: "minor", message: "방치한 사이 밀항자가 보급품 일부를 훼손했습니다." } },
      ],
    },
    {
      threshold: 0.78,
      id: "engine-fault",
      severity: "danger",
      title: "엔진 이상",
      message: "주 추진기 출력 곡선이 흔들립니다. 무시하면 도착은 빠르지만 고장 리스크가 커집니다.",
      choices: [
        { id: "repair-now", label: "즉시 수리", hint: "시간 증가 / 선체 안정", effects: { resources: { credits: -60, hull: 2 }, delay: 5, message: "정비반이 항해 중 엔진 보정을 완료했습니다." } },
        { id: "slow", label: "감속", hint: "안전 / 도착 지연", effects: { delay: 8, message: "출력을 낮추고 안정 항로를 유지합니다." } },
        { id: "ignore", label: "무시", hint: "시간 유지 / 피해 위험", effects: { resources: { hull: scalePenalty(5, danger, control * 0.08), fuel: -2 }, crewRisk: danger >= 4 ? "minor" : null, message: "엔진 이상을 무시하고 항로를 밀어붙였습니다." } },
      ],
    },
    {
      threshold: 1,
      id: "drift-cargo",
      severity: "reward",
      title: "표류 화물",
      message: "항로 주변에 방치된 화물 포드가 있습니다. 회수는 가능하지만 감속이 필요합니다.",
      choices: [
        { id: "recover", label: "회수", hint: "시간 소모 / 보상", effects: { resources: { credits: 65 + danger * 20, fuel: -1 }, delay: 3, item: { id: "alloy-plate", qty: 1 }, message: "화물 포드를 회수해 쓸만한 부품을 얻었습니다." } },
        { id: "mark", label: "좌표 기록", hint: "정보 획득 / 일정 유지", effects: { reveal: true, dust: 4 + danger, message: "좌표를 기록하고 항로 정보를 갱신했습니다." } },
        { id: "pass", label: "통과", hint: "아무 변화 없음", effects: { message: "화물 포드를 지나치고 항로를 유지합니다." } },
      ],
    },
  ];

  const card = pickByRoll(table);
  return {
    ...card,
    id: `${card.id}-${currentMinute}`,
    templateId: card.id,
    createdAt: currentMinute,
    zoneName: target?.name ?? "목적지",
  };
}

export function applyTravelEventChoice(activeTravel, card, choiceId) {
  const choice = card?.choices?.find((entry) => entry.id === choiceId);
  if (!activeTravel || !card || !choice) return null;
  const effects = choice.effects ?? {};
  const delay = effects.delay ?? 0;
  const nextTravel = {
    ...activeTravel,
    completeAt: Math.max(activeTravel.startedAt + 1, activeTravel.completeAt + delay),
    duration: Math.max(1, activeTravel.duration + delay),
  };

  return {
    choice,
    effects,
    nextTravel,
    summary: `${card.title}: ${choice.label} — ${effects.message ?? "지시 완료"}`,
  };
}

export function rollTravelEncounter(activeTravel, currentMinute) {
  return createTravelEventCard(activeTravel, currentMinute);
}
