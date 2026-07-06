import { ROOM_IDS, ROUTES } from "../data/shipRooms";
import { canWorkWithInjury, injuryWorkSpeedMultiplier, normalizeInjury } from "./injurySystem";

export const CRISIS_TYPES = ["overheat", "fire", "power_loss", "hull_breach", "intruder"];

export const CRISIS_CATALOG = {
  overheat: {
    type: "overheat",
    label: "과열",
    icon: "🌡️",
    actionLabel: "냉각",
    responderAction: "냉각수 우회",
    fitRoles: ["기관실"],
    responderSlots: 2,
    baseMinutes: 48,
    escalateMinutes: 70,
    conditionHit: 18,
    loadHit: 8,
    unattendedConditionLossPerHour: 2.5,
    targetPanel: "crew",
  },
  fire: {
    type: "fire",
    label: "화재",
    icon: "🔥",
    actionLabel: "진화",
    responderAction: "화재 진압",
    fitRoles: ["기관실"],
    responderSlots: 3,
    baseMinutes: 72,
    escalateMinutes: 60,
    conditionHit: 30,
    loadHit: 10,
    unattendedConditionLossPerHour: 9,
    spreadChance: 0.45,
    injuryChance: 0.2,
    targetPanel: "crew",
  },
  power_loss: {
    type: "power_loss",
    label: "정전",
    icon: "⚡",
    actionLabel: "전력 복구",
    responderAction: "전력 계통 복구",
    fitRoles: ["기관실"],
    responderSlots: 2,
    baseMinutes: 64,
    escalateMinutes: 80,
    conditionHit: 16,
    loadHit: 18,
    unattendedConditionLossPerHour: 3.5,
    targetPanel: "crew",
  },
  hull_breach: {
    type: "hull_breach",
    label: "선체 파손",
    icon: "🛡️",
    actionLabel: "봉합 수리",
    responderAction: "선체 균열 봉합",
    fitRoles: ["기관실"],
    responderSlots: 3,
    baseMinutes: 105,
    escalateMinutes: 70,
    conditionHit: 38,
    loadHit: 15,
    unattendedConditionLossPerHour: 7,
    injuryChance: 0.18,
    oxygenLossPerHour: 2.2,
    targetPanel: "crew",
  },
  intruder: {
    type: "intruder",
    label: "침입",
    icon: "🚨",
    actionLabel: "제압",
    responderAction: "침입자 제압",
    fitRoles: ["포탑", "함교"],
    responderSlots: 2,
    baseMinutes: 78,
    escalateMinutes: 65,
    conditionHit: 20,
    loadHit: 12,
    unattendedConditionLossPerHour: 4,
    spreadChance: 0.35,
    injuryChance: 0.22,
    targetPanel: "crew",
  },
};

export const ADJACENCY = ROOM_IDS.reduce((acc, roomId) => ({ ...acc, [roomId]: [] }), {});
ROUTES.forEach(([from, to]) => {
  ADJACENCY[from] = [...(ADJACENCY[from] ?? []), to];
  ADJACENCY[to] = [...(ADJACENCY[to] ?? []), from];
});

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function crisisId(roomId, type, currentMinute) {
  const random = Math.random().toString(36).slice(2, 8);
  return `crisis-${type}-${roomId}-${Math.floor(currentMinute)}-${random}`;
}

export function createCrisisRecord({ roomId, type, severity = 1, currentMinute = 0 }) {
  const config = CRISIS_CATALOG[type] ?? CRISIS_CATALOG.overheat;
  return {
    id: crisisId(roomId, config.type, currentMinute),
    roomId,
    type: config.type,
    severity: clamp(Math.round(severity), 1, 3),
    progress: 0,
    escalateAt: currentMinute + config.escalateMinutes,
    assignedCrewId: null,
    assignedCrewIds: [],
    createdAtMinutes: currentMinute,
  };
}

export function getCrisisConfig(type) {
  return CRISIS_CATALOG[type] ?? CRISIS_CATALOG.overheat;
}

export function getCrisisLabel(crisis) {
  const config = getCrisisConfig(crisis?.type);
  return `${config.icon} ${config.label}`;
}

export function getCrisisResponderSlots(crisis) {
  const config = getCrisisConfig(crisis?.type);
  return Math.max(1, config.responderSlots ?? 1);
}

export function canCrewRespondToCrisis(member) {
  if (!member?.alive) return false;
  if (!canWorkWithInjury(member.injury)) return false;
  if ((member.fatigue ?? 0) >= 85) return false;
  const traits = normalizeInjury(member.injury).permanentTraits;
  if (traits.includes("trauma") && Math.random() < 0.08) return false;
  return true;
}

export function scoreCrisisForMember(member, crisis) {
  if (!canCrewRespondToCrisis(member) || !crisis) return null;

  const config = getCrisisConfig(crisis.type);
  const roleFit = config.fitRoles.includes(member.role);
  const statBoost = crisis.type === "intruder"
    ? (member.stats?.gunnery ?? 0) + (member.stats?.piloting ?? 0) * 0.25
    : (member.stats?.engineering ?? 0) + (member.stats?.medicine ?? 0) * 0.15;

  let score = 200 + crisis.severity * 50;
  if (roleFit) score += 85;
  if (crisis.assignedCrewId === member.id || (crisis.assignedCrewIds ?? []).includes(member.id)) score += 35;
  score += statBoost;
  score -= (member.fatigue ?? 0) * 0.35;
  score *= injuryWorkSpeedMultiplier(member.injury);
  return score;
}

export function crisisResponseRatePerMinute(member, crisis) {
  const config = getCrisisConfig(crisis.type);
  const severityMultiplier = 1 + (crisis.severity - 1) * 0.35;
  const fitMultiplier = config.fitRoles.includes(member?.role) ? 1.35 : 0.85;
  const fatigueMultiplier = clamp(1 - (member?.fatigue ?? 0) / 220, 0.55, 1);
  return (100 / (config.baseMinutes * severityMultiplier)) * fitMultiplier * fatigueMultiplier * injuryWorkSpeedMultiplier(member?.injury);
}

export function shouldSpawnInternalCrisis({ room, currentMinute = 0, deltaMinutes = 0 }) {
  if (!room || room.activeCrisisId) return null;
  const crossedHour = Math.floor((currentMinute - deltaMinutes) / 60) !== Math.floor(currentMinute / 60);
  const heavyTick = deltaMinutes >= 60;
  const canRoll = crossedHour || heavyTick || room.load >= 94;
  if (!canRoll) return null;

  const condition = room.condition ?? 100;
  const load = room.load ?? 0;

  if (room.id === "engineering" && load >= 85) {
    if (load >= 94 || Math.random() < 0.55) return "overheat";
  }
  if (load >= 92 && Math.random() < 0.28) return "power_loss";
  if (condition <= 32 && load >= 72 && Math.random() < 0.2) return "fire";
  return null;
}

export function pickAdjacentRoom(roomId, blockedRoomIds = new Set()) {
  const candidates = (ADJACENCY[roomId] ?? []).filter((candidate) => !blockedRoomIds.has(candidate));
  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

export function clampCrisisProgress(value) {
  return clamp(value, 0, 100);
}
