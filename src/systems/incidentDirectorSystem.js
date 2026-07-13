import { DIRECTOR_INCIDENTS, INCIDENT_DIRECTOR_RULES } from "../data/directorIncidents";

const terminal = new Set(["resolved", "failed", "cancelled", "suppressed"]);
export const INCIDENT_TERMINAL_STATUSES = terminal;

export function stableHash(input = "") {
  let hash = 2166136261;
  for (let index = 0; index < String(input).length; index += 1) {
    hash ^= String(input).charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function hashUnit(seed) { return stableHash(seed) / 4294967296; }

export function normalizeDirector(input = {}, startMinute = 0) {
  const pulse = INCIDENT_DIRECTOR_RULES.pulseMinutes;
  const safeStartMinute = Number.isFinite(startMinute) ? startMinute : 0;
  const firstPulse = Math.ceil(safeStartMinute / pulse) * pulse;
  const sequence = Number(input.sequence);
  const tension = Number(input.tension);
  const pressure = Number(input.pressure);
  const categoryUntil = input.categoryUntil && typeof input.categoryUntil === "object" && !Array.isArray(input.categoryUntil)
    ? Object.fromEntries(Object.entries(input.categoryUntil).filter(([key, value]) => key && Number.isFinite(value)))
    : {};
  return {
    cursorMinute: Number.isFinite(input.cursorMinute) ? input.cursorMinute : firstPulse,
    sequence: Number.isFinite(sequence) ? Math.max(0, Math.floor(sequence)) : 0,
    tension: Number.isFinite(tension) ? Math.max(0, tension) : 0,
    pressure: Number.isFinite(pressure) ? Math.max(0, pressure) : 0,
    quietUntil: Number.isFinite(input.quietUntil) ? input.quietUntil : safeStartMinute + INCIDENT_DIRECTOR_RULES.startupQuietMinutes,
    recent: Array.isArray(input.recent) ? input.recent.filter((entry) => entry?.id && Number.isFinite(entry.at)).slice(-24) : [],
    categoryUntil,
  };
}

function incidentSnapshotAt(snapshot, director, pulseMinute) {
  const lastIncidentAt = director.recent.reduce((latest, entry) => Math.max(latest, entry.at ?? 0), snapshot.campaignStartMinute ?? 0);
  return { ...snapshot, minutesSinceIncident: Math.max(0, pulseMinute - lastIncidentAt) };
}

function eligibleTemplate(template, director, pulseMinute, context, snapshot) {
  // A decision that the player has not answered yet is state, not a UI
  // detail. Holding generation here makes a partitioned 10x60 window match
  // a single 600-minute window: neither can invent a second incident while
  // the first decision is still unresolved.
  if (context.hasUnresolvedDecision || (context.operationalActive ?? 0) >= INCIDENT_DIRECTOR_RULES.maxActive) return false;
  if (snapshot.hasActiveCrisis && template.positive) return false;
  if (template.eligibility && !template.eligibility(snapshot)) return false;
  if (template.targetMode === "lowestAffinityPair" && (context.aliveCrewCount ?? 0) < 2) return false;
  if (template.targetMode === "highestFatigue" && (context.aliveCrewCount ?? 0) < 1) return false;
  const same = [...director.recent].reverse().find((entry) => entry.id === template.id);
  const templateCd = template.severity === "medium" ? INCIDENT_DIRECTOR_RULES.templateCooldownMedium : INCIDENT_DIRECTOR_RULES.templateCooldownDaily;
  if (same && pulseMinute - same.at < templateCd) return false;
  if ((director.categoryUntil[template.category] ?? 0) > pulseMinute) return false;
  if (template.severity === "medium") {
    if (context.hasMedium || context.hasActiveCrisis) return false;
    if (director.tension < INCIDENT_DIRECTOR_RULES.mediumThreshold || director.pressure < INCIDENT_DIRECTOR_RULES.mediumRiskThreshold) return false;
  } else if (director.tension < INCIDENT_DIRECTOR_RULES.dailyThreshold) return false;
  return true;
}

export function chooseIncidentTemplate({ director, pulseMinute, vesselId, sectorId = "sector", context = { aliveCrewCount: Infinity }, snapshot = {}, catalog = DIRECTOR_INCIDENTS }) {
  const currentSnapshot = incidentSnapshotAt(snapshot, director, pulseMinute);
  const eligible = catalog.filter((template) => eligibleTemplate(template, director, pulseMinute, context, currentSnapshot));
  if (eligible.length === 0) return null;
  const sorted = [...eligible].sort((a, b) => a.id.localeCompare(b.id));
  const weighted = sorted.map((template) => ({ template, weight: Math.max(0.1, template.weight ?? 1) * Math.max(0.1, Math.min(4, template.triggerScore?.(currentSnapshot) ?? 1)) }));
  const total = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = hashUnit(`${vesselId}|${sectorId}|${pulseMinute}|${director.sequence}`) * total;
  for (const entry of weighted) {
    roll -= entry.weight;
    if (roll < 0) return entry.template;
  }
  return weighted.at(-1)?.template ?? null;
}

export function advanceDirectorWindow({ director: input, fromMinute, toMinute, vesselId, sectorId, risk = 0, context = {}, snapshot = {}, catalog = DIRECTOR_INCIDENTS }) {
  const director = normalizeDirector(input, fromMinute);
  const pulse = INCIDENT_DIRECTOR_RULES.pulseMinutes;
  let cursor = Math.max(director.cursorMinute, Math.ceil(fromMinute / pulse) * pulse);
  let selected = null;
  let next = { ...director, categoryUntil: { ...director.categoryUntil }, recent: [...director.recent] };
  while (cursor <= toMinute) {
    next = { ...next, cursorMinute: cursor + pulse, tension: next.tension + 8 + Math.min(8, risk / 10), pressure: next.pressure + Math.max(2, risk / 6) };
    if (!selected && cursor >= next.quietUntil) {
      const template = chooseIncidentTemplate({ director: next, pulseMinute: cursor, vesselId, sectorId, context, snapshot, catalog });
      if (template) selected = { template, pulseMinute: cursor };
    }
    cursor += pulse;
  }
  if (!selected) return { director: next, selected: null };
  const at = selected.pulseMinute;
  const selectedTemplate = selected.template;
  const isMedium = selectedTemplate.severity === "medium";
  next = {
    ...next,
    sequence: next.sequence + 1,
    tension: Math.max(0, next.tension - (isMedium ? 48 : 24)),
    pressure: Math.max(0, next.pressure - (isMedium ? 24 : 8)),
    quietUntil: at + (isMedium ? INCIDENT_DIRECTOR_RULES.quietAfterMedium : INCIDENT_DIRECTOR_RULES.quietAfterDaily),
    recent: [...next.recent, { id: selectedTemplate.id, category: selectedTemplate.category, at }].slice(-24),
    categoryUntil: { ...next.categoryUntil, [selectedTemplate.category]: at + (isMedium ? INCIDENT_DIRECTOR_RULES.categoryCooldownMedium : INCIDENT_DIRECTOR_RULES.categoryCooldownDaily) },
  };
  return { director: next, selected: { templateId: selectedTemplate.id, pulseMinute: at, sequence: next.sequence } };
}

export function canPresentIncident(blockers = {}) {
  return !blockers.combat && !blockers.navigation && !blockers.missionEncounter && !blockers.story && !blockers.incidentPresented;
}

export function activeRuntimeCounts(runtimes = []) {
  const active = runtimes.filter((runtime) => !terminal.has(runtime.status));
  return {
    active: active.length,
    operational: active.filter((runtime) => ["pending", "settling", "waitingJob", "monitoring"].includes(runtime.status)).length,
    medium: active.filter((runtime) => runtime.severity === "medium").length,
    unresolvedDecision: active.some((runtime) => ["queued", "pending", "settling"].includes(runtime.status)),
  };
}
