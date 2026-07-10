import { CAMPAIGN } from "../data/constants";

const PROGRESSION_VERSION = 1;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function getSectorProfile(sectorIndex = 0) {
  const safeIndex = Math.max(0, Math.floor(sectorIndex));
  const sectorNumber = safeIndex + 1;
  const rewardMultiplier = 1 + safeIndex * CAMPAIGN.REWARD_MULTIPLIER_PER_SECTOR;
  return {
    sectorIndex: safeIndex,
    sectorNumber,
    expeditionSectors: CAMPAIGN.EXPEDITION_SECTORS,
    dangerFloor: Math.max(1, safeIndex),
    dangerCeiling: Math.min(CAMPAIGN.MAX_NODE_DANGER, safeIndex + 3),
    dangerBonus: Math.max(0, safeIndex - 1),
    richnessBonus: Math.ceil(safeIndex / 2),
    rewardMultiplier,
    enemyRiskCeiling: clamp(4 + safeIndex, 4, 7),
    requiredFieldVisits: Math.min(CAMPAIGN.MAX_REQUIRED_FIELD_VISITS, CAMPAIGN.BASE_REQUIRED_FIELD_VISITS + safeIndex),
    dangerThreshold: Math.min(CAMPAIGN.MAX_DANGER_THRESHOLD, CAMPAIGN.BASE_DANGER_THRESHOLD + Math.floor(safeIndex / 2)),
    gateRewardCredits: Math.round(CAMPAIGN.BASE_GATE_REWARD_CREDITS * rewardMultiplier),
    isExpeditionFinale: sectorNumber >= CAMPAIGN.EXPEDITION_SECTORS,
  };
}

export function applySectorProgression(sector, sectorIndex = 0) {
  if (!sector?.nodes?.length) return sector;
  const profile = getSectorProfile(sectorIndex);
  if (sector.progressionVersion === PROGRESSION_VERSION && sector.sectorIndex === profile.sectorIndex) return sector;
  let nodes = sector.nodes.map((node) => {
    const baseDanger = node.baseDanger ?? node.danger ?? 1;
    const baseRichness = node.baseRichness ?? node.richness ?? 1;
    const dangerRange = profile.dangerCeiling - profile.dangerFloor + 1;
    const scaledDanger = profile.dangerFloor + ((Math.max(1, baseDanger) - 1) % dangerRange);
    return {
      ...node,
      baseDanger,
      baseRichness,
      danger: node.type === "station" ? 1 : node.type === "exit" ? profile.dangerCeiling : scaledDanger,
      richness: clamp(baseRichness + profile.richnessBonus, 1, CAMPAIGN.MAX_NODE_RICHNESS),
    };
  });
  // A generated sector must never ask the player to survive a danger band
  // that does not exist. Promote a stable field node when the seeded rolls
  // produced no qualifying candidate. This is deterministic (node order is
  // deterministic) and does not add/remove nodes or alter save identities.
  const qualifyingFieldCount = nodes.filter((node) => isFieldNode(node) && node.danger >= profile.dangerThreshold).length;
  if (qualifyingFieldCount < 1) {
    const candidateIndex = nodes.findIndex(isFieldNode);
    if (candidateIndex >= 0) {
      nodes = nodes.map((node, index) => index === candidateIndex ? { ...node, danger: profile.dangerThreshold } : node);
    }
  }
  return {
    ...sector,
    name: `개척 원정 섹터 ${profile.sectorNumber}`,
    nodes,
    sectorIndex: profile.sectorIndex,
    progressionVersion: PROGRESSION_VERSION,
    difficulty: profile,
    rewardMultiplier: profile.rewardMultiplier,
  };
}

export function createCampaignState(overrides = {}) {
  return {
    expeditionId: CAMPAIGN.EXPEDITION_ID,
    status: "active",
    sectorsCleared: 0,
    highestSectorReached: 1,
    totalFieldNodesVisited: 0,
    completedAtMinute: null,
    ...overrides,
  };
}

export function normalizeCampaignState(campaign, sectorIndex = 0, visitedFieldCount = 0) {
  const fallback = createCampaignState({
    sectorsCleared: Math.max(0, sectorIndex),
    highestSectorReached: Math.max(1, sectorIndex + 1),
    totalFieldNodesVisited: Math.max(0, visitedFieldCount),
  });
  return {
    ...fallback,
    ...(campaign ?? {}),
    expeditionId: campaign?.expeditionId ?? CAMPAIGN.EXPEDITION_ID,
    status: campaign?.status === "completed" ? "completed" : "active",
  };
}

export function isFieldNode(node) {
  return Boolean(node && node.type !== "station" && node.type !== "exit");
}

export function getSectorObjective({ sector, sectorIndex = 0, visited = [], campaign } = {}) {
  const profile = getSectorProfile(sectorIndex);
  const fieldNodes = (sector?.nodes ?? []).filter(isFieldNode);
  // Old/hydrated sectors may contain fewer fields, or a lower danger band,
  // than current generation rules. Derive a completable objective from what
  // is actually present instead of permanently locking those saves.
  const requiredFieldVisits = Math.min(profile.requiredFieldVisits, fieldNodes.length);
  const maximumFieldDanger = fieldNodes.reduce((maximum, node) => Math.max(maximum, node.danger ?? 0), 0);
  const dangerThreshold = fieldNodes.length > 0
    ? Math.min(profile.dangerThreshold, maximumFieldDanger)
    : 0;
  const visitedSet = new Set(visited);
  const visitedFieldNodes = fieldNodes.filter((node) => visitedSet.has(node.id));
  const dangerousVisited = visitedFieldNodes.filter((node) => (node.danger ?? 0) >= dangerThreshold);
  const visitConditionMet = visitedFieldNodes.length >= requiredFieldVisits;
  const dangerConditionMet = fieldNodes.length === 0 || dangerousVisited.length >= 1;
  const expeditionCompleted = campaign?.status === "completed";
  return {
    ...profile,
    requiredFieldVisits,
    dangerThreshold,
    visitedFieldCount: visitedFieldNodes.length,
    dangerousVisitedCount: dangerousVisited.length,
    visitConditionMet,
    dangerConditionMet,
    gateUnlocked: !expeditionCompleted && visitConditionMet && dangerConditionMet,
    expeditionCompleted,
    progressPercent: expeditionCompleted
      ? 100
      : Math.round(((Math.min(visitedFieldNodes.length, requiredFieldVisits) + (dangerConditionMet ? 1 : 0)) / Math.max(1, requiredFieldVisits + 1)) * 100),
    gateNode: (sector?.nodes ?? []).find((node) => node.type === "exit") ?? null,
  };
}

export function getGateEncounter(encounter, objective) {
  if (!encounter || !objective || objective.gateUnlocked || objective.expeditionCompleted) return encounter;
  return {
    ...encounter,
    id: "exit-objective-locked",
    title: "관문 좌표 잠금",
    description: `현장 노드 ${objective.requiredFieldVisits}곳 조사와 위험 ${objective.dangerThreshold}+ 노드 1곳 생존 기록이 필요합니다.`,
    options: [{ id: "hold", label: "현재 섹터로 복귀", outcome: [{ kind: "log", message: "관문 해제 조건을 충족하지 못해 점프를 보류했습니다." }] }],
  };
}
