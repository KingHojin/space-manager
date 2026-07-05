import { MISSION_ENCOUNTER_TEMPLATES, MISSION_ENCOUNTER_TIMING } from "../data/missionEncounters";

const DEFAULT_SEED = "mission-encounter";
const RISK_WEIGHT = { low: 1, medium: 2, high: 3, extreme: 4 };

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

function scoreEncounterForMission(template, mission, timing) {
  if (!template || !mission) return 1;
  let score = 1;
  const missionTags = new Set([...(mission.tags ?? []), ...(mission.encounterTags ?? []), mission.category].filter(Boolean));
  (template.tags ?? []).forEach((tag) => {
    if (missionTags.has(tag)) score += 4;
  });
  if (template.category === mission.category) score += 5;
  if (timing && template.timing === timing) score += 3;
  if (mission.risk === "high" || mission.risk === "extreme") score += RISK_WEIGHT[template.risk] ?? 1;
  return score;
}

function runtimeEncounterId(template, mission, seed, timing) {
  return `${mission?.id ?? "mission"}:${template.id}:${timing ?? template.timing}:${hashString(`${seed}:${mission?.id}:${template.id}:${timing}`).toString(36)}`;
}

function normalizeOption(option) {
  return {
    id: option.id,
    label: option.label,
    role: option.role ?? "함교",
    risk: option.risk ?? "medium",
    rewardPreview: option.rewardPreview ?? {},
    outcomes: Array.isArray(option.outcomes) ? option.outcomes : [],
  };
}

export function instantiateMissionEncounter(template, { mission, seed = DEFAULT_SEED, timing = null, currentMinute = 0 } = {}) {
  if (!template || !mission) return null;
  return {
    id: runtimeEncounterId(template, mission, seed, timing),
    templateId: template.id,
    missionId: mission.id,
    missionTemplateId: mission.templateId,
    title: template.title,
    category: template.category,
    icon: template.icon ?? "◆",
    scene: template.scene,
    tags: [...(template.tags ?? [])],
    timing: timing ?? template.timing ?? MISSION_ENCOUNTER_TIMING.objective,
    risk: template.risk ?? "medium",
    destinationNodeId: mission.destinationNodeId ?? null,
    destinationName: mission.destinationName ?? "미확인 좌표",
    options: (template.options ?? []).map(normalizeOption),
    createdAt: currentMinute,
    resolvedAt: null,
    selectedOptionId: null,
  };
}

export function generateMissionEncounter({ mission, timing = MISSION_ENCOUNTER_TIMING.objective, seed = DEFAULT_SEED, currentMinute = 0, excludeTemplateIds = [] } = {}) {
  if (!mission?.id) return null;
  const excluded = new Set(excludeTemplateIds);
  const rng = createRng(`${seed}:${mission.id}:${timing}:${currentMinute}`);
  const candidates = MISSION_ENCOUNTER_TEMPLATES
    .filter((template) => !excluded.has(template.id))
    .map((template) => ({ value: template, weight: scoreEncounterForMission(template, mission, timing) }));
  const template = pickWeighted(candidates, rng);
  return instantiateMissionEncounter(template, { mission, seed, timing, currentMinute });
}

export function normalizeMissionEncounterRecord(encounter) {
  if (!encounter?.id) return null;
  const template = MISSION_ENCOUNTER_TEMPLATES.find((entry) => entry.id === encounter.templateId);
  return {
    ...(template ? instantiateMissionEncounter(template, { mission: { id: encounter.missionId, templateId: encounter.missionTemplateId, destinationNodeId: encounter.destinationNodeId, destinationName: encounter.destinationName }, seed: encounter.id, timing: encounter.timing, currentMinute: encounter.createdAt ?? 0 }) : {}),
    ...encounter,
    options: Array.isArray(encounter.options) ? encounter.options.map(normalizeOption) : template?.options?.map(normalizeOption) ?? [],
    tags: Array.isArray(encounter.tags) ? encounter.tags : template?.tags ?? [],
  };
}

export function resolveMissionEncounterOption(encounter, optionId, { currentMinute = 0 } = {}) {
  const normalized = normalizeMissionEncounterRecord(encounter);
  if (!normalized) return { ok: false, reason: "notFound" };
  if (normalized.resolvedAt) return { ok: false, reason: "alreadyResolved", encounter: normalized };
  const option = normalized.options.find((entry) => entry.id === optionId);
  if (!option) return { ok: false, reason: "optionNotFound", encounter: normalized };
  const resolved = { ...normalized, resolvedAt: currentMinute, selectedOptionId: option.id };
  const effects = option.outcomes ?? [];
  const reward = effects.reduce((sum, effect) => {
    if (effect.kind !== "reward" || !effect.reward) return sum;
    Object.entries(effect.reward).forEach(([key, value]) => {
      sum[key] = (sum[key] ?? 0) + value;
    });
    return sum;
  }, {});
  const resourceDelta = effects.reduce((sum, effect) => {
    if (effect.kind !== "resource" || !effect.delta) return sum;
    Object.entries(effect.delta).forEach(([key, value]) => {
      sum[key] = (sum[key] ?? 0) + value;
    });
    return sum;
  }, {});
  const logs = effects.filter((effect) => effect.kind === "log" && effect.message).map((effect) => effect.message);
  const combat = effects.find((effect) => effect.kind === "combat") ?? null;
  const crewRisk = effects.find((effect) => effect.kind === "crewRisk") ?? null;
  return { ok: true, encounter: resolved, option, effects, reward, resourceDelta, logs, combat, crewRisk };
}

export function getMissionEncounterCandidates({ mission, timing = null } = {}) {
  if (!mission?.id) return [];
  return MISSION_ENCOUNTER_TEMPLATES
    .map((template) => ({ template, score: scoreEncounterForMission(template, mission, timing) }))
    .sort((left, right) => right.score - left.score);
}
