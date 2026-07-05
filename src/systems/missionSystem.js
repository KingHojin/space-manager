import { MISSION_DISTANCE, MISSION_RISK, MISSION_STATUS, MISSION_TEMPLATES, getMissionTemplate } from "../data/missions";

const DEFAULT_BOARD_SIZE = 3;
const BOARD_REFRESH_MINUTES = 360;
const DEFAULT_SEED = "mission-board";

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function hashString(text = "") {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createRng(seed = DEFAULT_SEED) {
  let state = hashString(String(seed)) || 1;
  return () => {
    state = Math.imul(1664525, state) + 1013904223;
    return (state >>> 0) / 4294967296;
  };
}

function pickWeighted(entries, rng) {
  const total = entries.reduce((sum, entry) => sum + Math.max(0, entry.weight ?? 1), 0);
  if (total <= 0) return entries[0]?.value ?? null;
  let roll = rng() * total;
  for (const entry of entries) {
    roll -= Math.max(0, entry.weight ?? 1);
    if (roll <= 0) return entry.value;
  }
  return entries[entries.length - 1]?.value ?? null;
}

function reachableNodes(sector, currentNodeId) {
  const nodes = sector?.nodes ?? [];
  if (!currentNodeId) return nodes;
  const current = nodes.find((node) => node.id === currentNodeId);
  const connectedIds = new Set(current?.connections ?? []);
  const discovered = nodes.filter((node) => node.discovered || connectedIds.has(node.id) || node.id === currentNodeId);
  return discovered.length > 0 ? discovered : nodes;
}

function scoreTemplateForNode(template, node) {
  if (!node) return 1;
  let score = 1;
  if (template.preferredNodeTypes?.includes(node.type)) score += 5;
  if (template.risk === "low" && (node.danger ?? 1) <= 2) score += 2;
  if (template.risk === "medium" && (node.danger ?? 1) >= 2 && (node.danger ?? 1) <= 4) score += 2;
  if (["high", "extreme"].includes(template.risk) && (node.danger ?? 1) >= 4) score += 2;
  return score;
}

function chooseDestination(template, { sector, currentNodeId, rng }) {
  const nodes = reachableNodes(sector, currentNodeId).filter((node) => node.id !== currentNodeId);
  if (nodes.length === 0) return null;
  return pickWeighted(nodes.map((node) => ({ value: node, weight: scoreTemplateForNode(template, node) })), rng);
}

function rewardMultiplier(template, destination) {
  const risk = MISSION_RISK[template.risk] ?? MISSION_RISK.low;
  const distance = MISSION_DISTANCE[template.distance] ?? MISSION_DISTANCE.short;
  const nodeDanger = destination?.danger ?? 1;
  const nodeRichness = destination?.richness ?? 1;
  return risk.rewardMultiplier * distance.rewardMultiplier * (1 + Math.max(0, nodeDanger - 1) * 0.07) * (1 + Math.max(0, nodeRichness - 1) * 0.04);
}

function scaleReward(reward = {}, multiplier = 1) {
  return Object.fromEntries(
    Object.entries(reward).map(([key, value]) => {
      if (typeof value !== "number") return [key, value];
      if (/Chance$/.test(key)) return [key, Number(clamp(value * Math.sqrt(multiplier), 0, 0.95).toFixed(3))];
      return [key, Math.max(0, Math.round(value * multiplier))];
    }),
  );
}

function missionRuntimeId(template, destination, seed, index) {
  return `${template.id}:${destination?.id ?? "open"}:${hashString(`${seed}:${template.id}:${destination?.id ?? "open"}:${index}`).toString(36)}`;
}

export function instantiateMission(template, { destination = null, seed = DEFAULT_SEED, index = 0, currentMinute = 0 } = {}) {
  const multiplier = rewardMultiplier(template, destination);
  const risk = MISSION_RISK[template.risk] ?? MISSION_RISK.low;
  const distance = MISSION_DISTANCE[template.distance] ?? MISSION_DISTANCE.short;
  return {
    id: missionRuntimeId(template, destination, seed, index),
    templateId: template.id,
    title: template.title,
    category: template.category,
    client: template.client,
    summary: template.summary,
    status: MISSION_STATUS.offered,
    risk: risk.id,
    riskLabel: risk.label,
    riskWeight: risk.weight,
    distance: distance.id,
    distanceLabel: distance.label,
    durationHint: distance.durationHint,
    destinationNodeId: destination?.id ?? null,
    destinationName: destination?.name ?? "미정 좌표",
    destinationType: destination?.type ?? null,
    destinationDanger: destination?.danger ?? null,
    tags: [...(template.tags ?? [])],
    encounterTags: [...(template.encounterTags ?? [])],
    reward: scaleReward(template.reward, multiplier),
    offeredAt: currentMinute,
    acceptedAt: null,
    completedAt: null,
    vesselId: null,
  };
}

export function generateMissionBoard({ sector = null, currentNodeId = null, currentMinute = 0, seed = DEFAULT_SEED, count = DEFAULT_BOARD_SIZE, excludeMissionIds = [] } = {}) {
  const rng = createRng(`${seed}:${currentMinute}:${currentNodeId ?? "none"}`);
  const excluded = new Set(excludeMissionIds);
  const pickedTemplateIds = new Set();
  const board = [];

  while (board.length < count && pickedTemplateIds.size < MISSION_TEMPLATES.length) {
    const weightedTemplates = MISSION_TEMPLATES
      .filter((template) => !pickedTemplateIds.has(template.id))
      .map((template) => {
        const previewDestination = chooseDestination(template, { sector, currentNodeId, rng });
        const weight = previewDestination ? scoreTemplateForNode(template, previewDestination) : 1;
        return { value: template, weight, previewDestination };
      });
    const template = pickWeighted(weightedTemplates, rng);
    if (!template) break;
    pickedTemplateIds.add(template.id);
    const destination = chooseDestination(template, { sector, currentNodeId, rng });
    const mission = instantiateMission(template, { destination, seed, index: board.length, currentMinute });
    if (!excluded.has(mission.id)) board.push(mission);
  }

  return board;
}

export function normalizeMissionRecord(mission) {
  if (!mission?.id) return null;
  const template = getMissionTemplate(mission.templateId);
  const status = Object.values(MISSION_STATUS).includes(mission.status) ? mission.status : MISSION_STATUS.offered;
  return {
    ...(template ? instantiateMission(template, { destination: null, seed: mission.id, index: 0, currentMinute: mission.offeredAt ?? 0 }) : {}),
    ...mission,
    status,
    tags: Array.isArray(mission.tags) ? mission.tags : template?.tags ?? [],
    encounterTags: Array.isArray(mission.encounterTags) ? mission.encounterTags : template?.encounterTags ?? [],
    reward: mission.reward ?? template?.reward ?? {},
    vesselId: mission.vesselId ?? null,
  };
}

export function canAcceptMission({ mission, activeMissions = [], vesselId }) {
  const normalized = normalizeMissionRecord(mission);
  if (!normalized) return { ok: false, reason: "notFound" };
  if (normalized.status !== MISSION_STATUS.offered) return { ok: false, reason: "notOffered" };
  if (!vesselId) return { ok: false, reason: "missingVesselId" };
  if (activeMissions.some((entry) => entry.vesselId === vesselId && entry.status === MISSION_STATUS.active)) return { ok: false, reason: "vesselBusy" };
  return { ok: true, mission: normalized };
}

export function acceptMissionRecord(mission, { vesselId, currentMinute = 0 } = {}) {
  const normalized = normalizeMissionRecord(mission);
  if (!normalized || !vesselId) return null;
  return { ...normalized, status: MISSION_STATUS.active, vesselId, acceptedAt: currentMinute };
}

export function completeMissionRecord(mission, { currentMinute = 0 } = {}) {
  const normalized = normalizeMissionRecord(mission);
  if (!normalized) return null;
  return { ...normalized, status: MISSION_STATUS.completed, completedAt: currentMinute };
}

export function failMissionRecord(mission, { currentMinute = 0, reason = "unknown" } = {}) {
  const normalized = normalizeMissionRecord(mission);
  if (!normalized) return null;
  return { ...normalized, status: MISSION_STATUS.failed, failedAt: currentMinute, failureReason: reason };
}

export { BOARD_REFRESH_MINUTES, DEFAULT_BOARD_SIZE };
