export const INJURY_STATE_ORDER = ["healthy", "minor", "serious", "critical", "incapacitated"];

export const INJURY_CATALOG = {
  healthy: { state: "healthy", label: "정상", priority: "info", canWork: true, workSpeed: 1, naturalRecoveryPerHour: 0, worsenAfterMinutes: Infinity },
  minor: { state: "minor", label: "경상", priority: "high", canWork: true, workSpeed: 0.8, naturalRecoveryPerHour: 4, worsenAfterMinutes: 720 },
  serious: { state: "serious", label: "중상", priority: "critical", canWork: false, workSpeed: 0, naturalRecoveryPerHour: 0, worsenAfterMinutes: 540 },
  critical: { state: "critical", label: "위독", priority: "critical", canWork: false, workSpeed: 0, naturalRecoveryPerHour: 0, worsenAfterMinutes: 360 },
  incapacitated: { state: "incapacitated", label: "전투불능", priority: "critical", canWork: false, workSpeed: 0, naturalRecoveryPerHour: 0.35, worsenAfterMinutes: Infinity },
};

export const PERMANENT_TRAITS = {
  chronic_fatigue: { id: "chronic_fatigue", label: "만성피로", desc: "피로 증가율 +30%" },
  trauma: { id: "trauma", label: "트라우마", desc: "위기 대응 배정 시 낮은 확률로 거부" },
  scarred: { id: "scarred", label: "흉터", desc: "페널티 없는 생존 기록" },
};

export const ROLE_COVERAGE_RULES = {
  함교: { label: "항해/지휘", missingTitle: "함교 역할 공백", desc: "항로 분석과 조우 판단 안정성이 낮아집니다." },
  기관실: { label: "기관/수리", missingTitle: "엔지니어 부재", desc: "기관실 상태 감소와 위기 대응 위험이 커집니다." },
  의무실: { label: "의료", missingTitle: "메딕 부재", desc: "부상 회복이 느려지고 악화 위험이 커집니다." },
  조리실: { label: "식사/보급", missingTitle: "요리사 부재", desc: "식재료를 조리식으로 전환하지 못해 식사 효율이 낮아집니다.", required: false },
};

const STRING_TO_STATE = {
  정상: "healthy",
  경상: "minor",
  중상: "serious",
  위독: "critical",
  전투불능: "incapacitated",
  전사: "incapacitated",
  minor: "minor",
  serious: "serious",
  critical: "critical",
  incapacitated: "incapacitated",
  healthy: "healthy",
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function normalizeInjury(injury) {
  if (injury && typeof injury === "object") {
    const state = INJURY_CATALOG[injury.state]?.state ?? "healthy";
    return {
      state,
      recoveryProgress: clamp(injury.recoveryProgress ?? 0, 0, 100),
      treatedBy: injury.treatedBy ?? null,
      permanentTraits: Array.isArray(injury.permanentTraits) ? [...new Set(injury.permanentTraits)] : [],
      untreatedMinutes: Math.max(0, injury.untreatedMinutes ?? 0),
    };
  }

  const state = STRING_TO_STATE[injury] ?? "healthy";
  return { state, recoveryProgress: 0, treatedBy: null, permanentTraits: [], untreatedMinutes: 0 };
}

export function injuryLabel(injury) {
  return INJURY_CATALOG[normalizeInjury(injury).state]?.label ?? "정상";
}

// INJURY_CATALOG's `priority` field (and injuryPriority below) intentionally
// reuses commandCenter.js's card-priority vocabulary (info/high/critical) —
// not systems/priorities.js's activity vocabulary. See the boundary comment
// at the top of systems/priorities.js for the full map of who owns which
// vocabulary.
export function injuryPriority(injury) {
  return INJURY_CATALOG[normalizeInjury(injury).state]?.priority ?? "info";
}

// Phase 18-E: the single sanctioned crossing from this module's card-priority
// vocabulary into systems/priorities.js's activity-priority vocabulary.
// Previously crewAI.js inlined this as
// `injuryPriority(member.injury) === "critical" ? "emergency" : "high"`
// (only ever reachable for states where canWorkWithInjury is false — i.e.
// serious/critical/incapacitated, which are all card-priority "critical" —
// so the "high" branch was already effectively dead given today's
// INJURY_CATALOG data, but is kept for defensiveness in case a future
// non-workable state uses a different card priority). Centralized here,
// unchanged in behavior, so any future injury/priority tuning has one place
// to update instead of a scattered inline ternary.
export function injuryActivityPriority(injury) {
  return injuryPriority(injury) === "critical" ? "emergency" : "high";
}

export function isHealthy(injury) {
  return normalizeInjury(injury).state === "healthy";
}

export function isInjured(injury) {
  return !isHealthy(injury);
}

export function injuryRank(injury) {
  return INJURY_STATE_ORDER.indexOf(normalizeInjury(injury).state);
}

export function canWorkWithInjury(injury) {
  return Boolean(INJURY_CATALOG[normalizeInjury(injury).state]?.canWork);
}

export function isSeriousOrWorse(injury) {
  return injuryRank(injury) >= INJURY_STATE_ORDER.indexOf("serious");
}

export function injuryWorkSpeedMultiplier(injury) {
  return INJURY_CATALOG[normalizeInjury(injury).state]?.workSpeed ?? 1;
}

export function applyInjury(member, incoming = "minor") {
  const current = normalizeInjury(member?.injury);
  const nextState = STRING_TO_STATE[incoming] ?? incoming ?? "minor";
  const currentRank = injuryRank(current);
  const nextRank = INJURY_STATE_ORDER.indexOf(nextState);
  const state = INJURY_CATALOG[nextState] && nextRank > currentRank ? nextState : current.state;
  return { ...current, state, recoveryProgress: 0, treatedBy: null, untreatedMinutes: 0 };
}

export function improveInjuryOneStage(injury) {
  const normalized = normalizeInjury(injury);
  const rank = injuryRank(normalized);
  if (rank <= 0) return { ...normalized, state: "healthy", recoveryProgress: 0, treatedBy: null, untreatedMinutes: 0 };
  const state = INJURY_STATE_ORDER[rank - 1] ?? "healthy";
  return { ...normalized, state, recoveryProgress: 0, treatedBy: null, untreatedMinutes: 0 };
}

export function worsenInjuryOneStage(injury) {
  const normalized = normalizeInjury(injury);
  const rank = injuryRank(normalized);
  if (rank < 0 || rank >= INJURY_STATE_ORDER.length - 1) return normalized;
  const state = INJURY_STATE_ORDER[rank + 1];
  return { ...normalized, state, recoveryProgress: 0, treatedBy: null, untreatedMinutes: 0 };
}

export function rollPermanentTrait(existingTraits = []) {
  if (Math.random() > 0.35) return null;
  const pool = ["chronic_fatigue", "trauma", "scarred"].filter((trait) => !existingTraits.includes(trait));
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function getRoleCoverage(crew = []) {
  const counts = Object.fromEntries(Object.keys(ROLE_COVERAGE_RULES).map((role) => [role, 0]));
  counts.포탑 = 0;
  crew.forEach((member) => {
    if (!member?.alive) return;
    if (!canWorkWithInjury(member.injury)) return;
    if (counts[member.role] !== undefined) counts[member.role] += 1;
  });

  const missingRoles = Object.entries(ROLE_COVERAGE_RULES)
    .filter(([, rule]) => rule.required !== false)
    .map(([role]) => role)
    .filter((role) => (counts[role] ?? 0) === 0);
  return { counts, missingRoles };
}

export function chooseTreatmentTarget(crew = []) {
  return [...crew]
    .filter((member) => member?.alive && isInjured(member.injury) && normalizeInjury(member.injury).state !== "incapacitated")
    .sort((a, b) => injuryRank(b.injury) - injuryRank(a.injury) || (b.injury?.untreatedMinutes ?? 0) - (a.injury?.untreatedMinutes ?? 0))[0] ?? null;
}

export function treatmentRatePerHour({ injury, hasMedic = true, activeMedicCount = 0 }) {
  const state = normalizeInjury(injury).state;
  if (state === "healthy") return 0;
  if (state === "minor") return hasMedic ? 22 + activeMedicCount * 6 : 4;
  if (state === "serious") return hasMedic ? 15 + activeMedicCount * 5 : 0;
  if (state === "critical") return hasMedic ? 9 + activeMedicCount * 4 : 0;
  if (state === "incapacitated") return hasMedic ? 2 + activeMedicCount * 1 : 0.35;
  return 0;
}

export function shouldWorsenInjury({ injury, deltaMinutes = 0, hasMedic = true, isBeingTreated = false }) {
  const normalized = normalizeInjury(injury);
  const rule = INJURY_CATALOG[normalized.state];
  if (!rule || !Number.isFinite(rule.worsenAfterMinutes)) return false;
  if (isBeingTreated) return false;
  const threshold = hasMedic ? rule.worsenAfterMinutes : rule.worsenAfterMinutes * 0.7;
  return (normalized.untreatedMinutes ?? 0) + deltaMinutes >= threshold;
}
