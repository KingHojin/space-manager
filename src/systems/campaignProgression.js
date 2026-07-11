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
    pendingRequisition: null,
    claimedRequisitions: {},
    ...overrides,
  };
}

export function normalizeCampaignState(campaign, sectorIndex = 0, visitedFieldCount = 0) {
  const fallback = createCampaignState({
    sectorsCleared: Math.max(0, sectorIndex),
    highestSectorReached: Math.max(1, sectorIndex + 1),
    totalFieldNodesVisited: Math.max(0, visitedFieldCount),
  });
  const expeditionId = campaign?.expeditionId ?? CAMPAIGN.EXPEDITION_ID;
  const status = campaign?.status === "completed" ? "completed" : "active";
  const claimedRequisitions = Object.fromEntries(Object.entries(
    campaign?.claimedRequisitions && typeof campaign.claimedRequisitions === "object" ? campaign.claimedRequisitions : {},
  ).filter(([claimId]) => claimId.startsWith(`${expeditionId}:sector:`)));
  const normalizedPending = status === "completed" ? null : normalizePendingRequisition(campaign?.pendingRequisition, expeditionId);
  const pendingRequisition = normalizedPending && !claimedRequisitions[normalizedPending.claimId] ? normalizedPending : null;
  return {
    ...fallback,
    ...(campaign ?? {}),
    expeditionId,
    status,
    pendingRequisition,
    claimedRequisitions,
  };
}

export function getGateClaimId(campaign, sectorNumber) {
  return `${campaign?.expeditionId ?? CAMPAIGN.EXPEDITION_ID}:sector:${sectorNumber}`;
}

function normalizePendingRequisition(pending, expeditionId) {
  if (!pending || typeof pending !== "object") return null;
  const sectorNumber = Math.max(1, Math.floor(pending.sectorNumber ?? 0));
  const claimId = `${expeditionId}:sector:${sectorNumber}`;
  if (pending.claimId !== claimId) return null;
  return {
    claimId,
    sectorNumber,
    baseCredits: Math.max(0, Math.round(pending.baseCredits ?? 0)),
    skillPoints: 1,
    isExpeditionFinale: Boolean(pending.isExpeditionFinale),
    createdAtMinute: Number.isFinite(pending.createdAtMinute) ? pending.createdAtMinute : 0,
  };
}

export function getGateRequisitionPackages() {
  return Object.entries(CAMPAIGN.GATE_REQUISITION_PACKAGES).map(([id, packageDef]) => ({ id, ...packageDef }));
}

export function createGateRequisitionEncounter(pending) {
  if (!pending) return null;
  return {
    id: `gate-requisition-choice:${pending.claimId}`,
    claimId: pending.claimId,
    nodeType: "requisition",
    icon: "📦",
    typeLabel: "관문 보급",
    title: pending.isExpeditionFinale ? "최종 관문 보급 선택" : `섹터 ${pending.sectorNumber} 관문 보급 선택`,
    description: `기본 보급 ₢${pending.baseCredits}과 스킬 포인트 1을 확보합니다. 함대의 다음 성장 방향을 하나 선택하십시오.`,
    options: getGateRequisitionPackages().map((packageDef) => ({
      id: `claim:${pending.claimId}:${packageDef.id}`,
      label: `${packageDef.label} · ${packageDef.summary}`,
      manualOnly: true,
      outcome: [{ kind: "gateRequisitionClaim", packageId: packageDef.id, claimId: pending.claimId }],
    })),
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
  const pendingRequisition = campaign?.pendingRequisition ?? null;
  return {
    ...profile,
    requiredFieldVisits,
    dangerThreshold,
    visitedFieldCount: visitedFieldNodes.length,
    dangerousVisitedCount: dangerousVisited.length,
    visitConditionMet,
    dangerConditionMet,
    gateUnlocked: !expeditionCompleted && !pendingRequisition && visitConditionMet && dangerConditionMet,
    expeditionCompleted,
    pendingRequisition,
    progressPercent: expeditionCompleted
      ? 100
      : Math.round(((Math.min(visitedFieldNodes.length, requiredFieldVisits) + (dangerConditionMet ? 1 : 0)) / Math.max(1, requiredFieldVisits + 1)) * 100),
    gateNode: (sector?.nodes ?? []).find((node) => node.type === "exit") ?? null,
  };
}

export function getGateEncounter(encounter, objective) {
  if (!encounter || !objective || objective.expeditionCompleted) return encounter;
  if (objective.gateUnlocked) {
    return {
      ...encounter,
      id: "exit-next-sector",
      description: `장거리 점프 좌표가 안정화됐습니다. 통과 후 기본 보급 ₢${objective.gateRewardCredits}과 성장 패키지 하나를 결재해야 다음 항해가 가능합니다.`,
    };
  }
  return {
    ...encounter,
    id: "exit-objective-locked",
    title: "관문 좌표 잠금",
    description: `현장 노드 ${objective.requiredFieldVisits}곳 조사와 위험 ${objective.dangerThreshold}+ 노드 1곳 생존 기록이 필요합니다.`,
    options: [{ id: "hold", label: "현재 섹터로 복귀", outcome: [{ kind: "log", message: "관문 해제 조건을 충족하지 못해 점프를 보류했습니다." }] }],
  };
}
