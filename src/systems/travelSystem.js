import { getZoneById } from "../data/sectors";

const LY_PER_MAP_UNIT = 1 / 5;
const BASE_LY_PER_HOUR = 2.2;
const BASE_FUEL_PER_LY = 1.35;
const MIN_TRAVEL_MINUTES = 1440;
const TRAVEL_TIME_MULTIPLIER = 6;

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
    { engine: 0, fuelEfficiency: 0, scanner: 0, control: 0, evasion: 0 },
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
  const encounterCount = Math.min(5, Math.max(2, Math.floor(duration / 480)));
  const encounters = Array.from({ length: encounterCount }, (_, index) => {
    const ratio = (index + 1) / (encounterCount + 1);
    return {
      id: `nav-${currentMinute}-${toZone.id}-${index}`,
      minute: currentMinute + Math.round(duration * ratio),
      resolved: false,
      chance: clamp(0.16 + (toZone?.danger ?? 1) * 0.035 - (stats.scanner ?? 0) * 0.01, 0.08, 0.42),
    };
  });

  return {
    fromZoneId: fromZone.id,
    toZoneId: toZone.id,
    startedAt: currentMinute,
    completeAt: currentMinute + duration,
    duration,
    fuelCost,
    distanceLy,
    speedLyPerHour,
    encounters,
  };
}

export function getTravelProgress(activeTravel, currentMinute) {
  if (!activeTravel) return 0;
  return clamp(((currentMinute - activeTravel.startedAt) / Math.max(1, activeTravel.duration)) * 100, 0, 100);
}

export function rollTravelEncounter(activeTravel, currentMinute) {
  const target = getZoneById(activeTravel?.toZoneId);
  const danger = target?.danger ?? 1;
  const roll = Math.random();
  const table = [
    {
      threshold: 0.2,
      title: "미세 운석군 회피",
      message: "항로 전방에 미세 운석군이 포착되어 회피 기동을 수행했습니다.",
      resources: { hull: -(2 + Math.floor(danger / 2)), fuel: -1 },
    },
    {
      threshold: 0.38,
      title: "이온 난류 통과",
      message: "항법 장치가 짧게 흔들렸고 산소 순환계가 과부하되었습니다.",
      resources: { oxygen: -(1 + Math.floor(danger / 3)), fuel: -2 },
    },
    {
      threshold: 0.56,
      title: "표류 잔해 발견",
      message: "항로 가장자리에서 표류 잔해를 회수했습니다.",
      resources: { credits: 45 + danger * 18 },
      item: { id: "alloy-plate", qty: 1 },
    },
    {
      threshold: 0.72,
      title: "수상한 신호 포착",
      message: "미확인 신호를 삼각측량해 주변 성계 정보를 일부 갱신했습니다.",
      reveal: true,
      dust: 6 + danger,
    },
    {
      threshold: 0.86,
      title: "해적 정찰파 회피",
      message: "장거리 스캐너에 해적 정찰파가 잡혔지만 직접 교전은 피했습니다.",
      resources: { fuel: -3, hull: -1 },
    },
    {
      threshold: 1,
      title: "평온한 항해",
      message: "이 구간은 특별한 문제 없이 통과했습니다.",
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
