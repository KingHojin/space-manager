import { getZoneById } from "../data/sectors";

const LY_PER_MAP_UNIT = 1 / 5;
const BASE_LY_PER_HOUR = 2.2;
const BASE_FUEL_PER_LY = 1.35;
const MIN_TRAVEL_MINUTES = 1440;
const TRAVEL_TIME_MULTIPLIER = 6;
const ENCOUNTER_ROLL_INTERVAL = 180;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
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

export function calculateTravelPlan({ fromZone, toZone, modules = [], currentMinute }) {
  const stats = getShipStats(modules);
  const distanceLy = calculateRouteDistance(fromZone, toZone);
  const speedLyPerHour = Math.max(0.9, BASE_LY_PER_HOUR + (stats.engine ?? 0) * 0.08);
  const baseDuration = Math.round((distanceLy / speedLyPerHour) * 60 * TRAVEL_TIME_MULTIPLIER);
  const dangerDelay = 1 + Math.max(0, (toZone?.danger ?? 1) - 1) * 0.08;
  const duration = Math.max(MIN_TRAVEL_MINUTES, Math.round(baseDuration * dangerDelay));
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
  return clamp(0.12 + danger * 0.035 - (stats.scanner ?? 0) * 0.008 - (stats.control ?? 0) * 0.004, 0.06, 0.36);
}

export function shouldRollTravelEncounter(activeTravel, currentMinute) {
  if (!activeTravel) return false;
  const interval = activeTravel.encounterRollInterval ?? ENCOUNTER_ROLL_INTERVAL;
  return currentMinute - (activeTravel.lastEncounterAt ?? activeTravel.startedAt) >= interval;
}

export function rollTravelEncounter(activeTravel, currentMinute) {
  const target = getZoneById(activeTravel?.toZoneId);
  const stats = activeTravel?.stats ?? {};
  const danger = target?.danger ?? 1;
  const mitigation = Math.max(0, (stats.defense ?? 0) * 0.08 + (stats.evasion ?? 0) * 0.06 + (stats.control ?? 0) * 0.04);
  const roll = Math.random();
  const table = [
    {
      threshold: 0.16,
      severity: "danger",
      title: "운석 충돌",
      message: "예상 항로 밖에서 날아든 고속 운석이 외부 장갑을 긁고 지나갔습니다.",
      resources: { hull: -Math.max(2, Math.round(6 + danger * 1.5 - mitigation)), fuel: -1 },
      crewRisk: danger >= 4 ? "minor" : null,
    },
    {
      threshold: 0.3,
      severity: "danger",
      title: "침투 경보",
      message: "정체불명의 미세 드론이 정비 덕트에 침투했습니다. 보안팀이 격벽을 폐쇄했습니다.",
      resources: { oxygen: -Math.max(1, Math.round(2 + danger - (stats.control ?? 0) * 0.1)) },
      crewRisk: "minor",
    },
    {
      threshold: 0.44,
      severity: "combat",
      title: "타 함선과 조우",
      message: "항로 측면에서 무장 함선이 접근했습니다. 짧은 경고 사격 후 거리를 벌렸습니다.",
      resources: { hull: -Math.max(1, Math.round(3 + danger - (stats.attack ?? 0) * 0.08)), fuel: -2 },
      combatHint: true,
    },
    {
      threshold: 0.58,
      severity: "warning",
      title: "이온 폭풍",
      message: "이온 폭풍대가 항로를 가로질러 산소 순환계와 항법 장치에 부담을 줬습니다.",
      resources: { oxygen: -Math.max(1, Math.round(3 + danger * 0.7)), fuel: -1 },
    },
    {
      threshold: 0.72,
      severity: "reward",
      title: "표류 화물 회수",
      message: "항로 가장자리에서 버려진 화물 포드를 회수했습니다.",
      resources: { credits: 45 + danger * 20 },
      item: { id: "alloy-plate", qty: 1 },
    },
    {
      threshold: 0.84,
      severity: "reward",
      title: "미확인 신호 포착",
      message: "장거리 스캐너가 희미한 신호를 잡았습니다. 주변 성계 정보가 일부 갱신됩니다.",
      reveal: true,
      dust: 6 + danger,
    },
    {
      threshold: 1,
      severity: "calm",
      title: "긴장된 항해",
      message: "이상 징후가 있었지만 실제 피해 없이 항로를 유지했습니다.",
      resources: {},
    },
  ];
  const outcome = table.find((entry) => roll <= entry.threshold) ?? table[table.length - 1];
  return {
    ...outcome,
    at: currentMinute,
    zoneName: target?.name ?? "목적지",
  };
}
