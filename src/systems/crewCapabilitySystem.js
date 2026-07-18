import { canWorkWithInjury, normalizeInjury } from "./injurySystem";

export const CREW_SPECIALTIES = {
  "bypass-wiring": { id: "bypass-wiring", label: "우회 배선", contexts: ["engineering"], minStat: 16, effect: "기관실 사건 시 마감 +90분 · 기관 부하 -6", reuse: "구역당 1회" },
  "signal-separation": { id: "signal-separation", label: "신호 분리", contexts: ["scouting", "greywake"], minStat: 16, effect: "센서/해독 작업 -60분", reuse: "구역당 1회" },
  "triage": { id: "triage", label: "응급 분류", contexts: ["medicine", "quarantine"], minStat: 15, effect: "격리선 치료 담당 피로 -10", reuse: "구역당 1회" },
  "shift-coordinator": { id: "shift-coordinator", label: "교대 조율", contexts: ["piloting", "crew"], minStat: 14, effect: "수면부채/당직충돌 불이익 1개 제거", reuse: "구역당 1회" },
  "steady-command": { id: "steady-command", label: "침착한 지휘", contexts: ["command"], minStat: 14, effect: "지휘 사건 마감 +90분", reuse: "구역당 1회" },
  "rationing": { id: "rationing", label: "절약 배급", contexts: ["cooking"], minStat: 12, effect: "배급 사건의 식량·허기 불이익 1단계 완화", reuse: "구역당 1회" },
};

export const STARTER_SPECIALTIES = {
  "captain-yun": "steady-command", "gunner-kang": "shift-coordinator", "engineer-min": "bypass-wiring", "medic-rho": "triage",
};

const statForContext = { engineering: "engineering", scouting: "scouting", gunnery: "gunnery", medicine: "medicine", cooking: "cooking", piloting: "piloting", crew: "gunnery", salvage: "engineering", greywake: "scouting", quarantine: "medicine", command: "piloting" };
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function getContextStat(context) { return statForContext[context] ?? "scouting"; }
export function fatiguePenalty(fatigue = 0) { return fatigue >= 75 ? 5 : fatigue >= 55 ? 2 : 0; }
export function injuryPenalty(injury) { return normalizeInjury(injury).state === "minor" ? 2 : canWorkWithInjury(injury) ? 0 : 99; }

export function getEffectiveCrewProfile({ member, context = "scouting", equipment = [] } = {}) {
  const statKey = getContextStat(context);
  const base = Number(member?.stats?.[statKey] ?? 0);
  const fatigue = Number(member?.fatigue ?? 0);
  const fatigueLoss = fatiguePenalty(fatigue);
  const injuryLoss = injuryPenalty(member?.injury);
  const applicable = equipment.filter((instance) => instance?.definition?.contexts?.includes(context)).slice(0, 1);
  const gearBonus = applicable.reduce((sum, instance) => sum + Number(instance.definition?.effect?.statBonus ?? 0), 0);
  const gearEffect = applicable[0]?.definition?.effect ?? {};
  return { crewId: member?.id ?? null, context, statKey, base, fatigueLoss, injuryLoss, gearBonus, effective: clamp(base + gearBonus - fatigueLoss - injuryLoss, 0, 99), usable: Boolean(member?.alive && canWorkWithInjury(member.injury) && fatigue < 90), equipment: applicable.map((instance) => instance.instanceId), gearEffect, gearDescription: applicable[0]?.definition?.description ?? null };
}

export function outcomeTier(profile, threshold = 10) { if (!profile?.usable) return "unavailable"; if (profile.effective < threshold) return "below"; if (profile.effective >= threshold + 4) return "expert"; return "standard"; }
// P27-B operational work and combat use these fixed, player-facing bands.
// Story chains retain outcomeTier's authored per-option thresholds above.
export function operationalTier(profile) { if (!profile?.usable) return "unavailable"; if (profile.effective < 10) return "below"; if (profile.effective < 14) return "assist"; if (profile.effective < 18) return "standard"; return "expert"; }
export function getSpecialty(id) { return CREW_SPECIALTIES[id] ?? null; }
export function specialtyAvailability({ member, sectorId, context, profile } = {}) {
  const specialty = getSpecialty(member?.specialtyId);
  const state = member?.specialtyState ?? {};
  if (!specialty || !specialty.contexts.includes(context)) return { ok: false, reason: "context", specialty };
  if (!profile?.usable || (member?.fatigue ?? 0) >= 90 || !member?.alive) return { ok: false, reason: "unavailable", specialty };
  if (state.usedSectorId === sectorId) return { ok: false, reason: "usedSector", specialty };
  if (profile.effective < specialty.minStat) return { ok: false, reason: "stat", specialty };
  return { ok: true, specialty };
}

export function prepareCrewLead({ member, context, threshold, equipment = [] } = {}) {
  const profile = getEffectiveCrewProfile({ member, context, equipment });
  return { leadCrewId: member?.id ?? null, context, threshold, profile, tier: outcomeTier(profile, threshold) };
}

// This is the one projection used by cards and orchestration: all equipment
// effects remain contextual and only the first compatible tool participates.
export function projectActionModifiers(lead) {
  const effect = lead?.profile?.gearEffect ?? {};
  return {
    durationMinutes: Number(effect.durationMinutes ?? 0) + (lead?.tier === "expert" ? -30 : lead?.tier === "assist" ? 15 : lead?.tier === "below" ? 30 : 0),
    fatigueDelta: Number(effect.fatigueDelta ?? 0),
    penaltyTier: Number(effect.penaltyTier ?? 0),
    failureTier: Number(effect.failureTier ?? 0),
    resourceDelta: effect.resourceDelta ?? {},
  };
}
