import { equipmentForCrew } from "../stores/equipmentStore";
import { getEffectiveCrewProfile, operationalTier, prepareCrewLead, projectActionModifiers, specialtyAvailability } from "./crewCapabilitySystem";

const JOB_CONTEXT = {
  hull_repair: { context: "engineering", threshold: 14 },
  module_upgrade: { context: "engineering", threshold: 14 },
  salvage: { context: "salvage", threshold: 14 },
  decode: { context: "scouting", threshold: 14 },
};

const SPECIALTY_DURATION = {
  "bypass-wiring": { contexts: ["engineering"], durationMinutes: -30 },
  "signal-separation": { contexts: ["scouting"], durationMinutes: -60 },
};

export function getCrewWorkContext(jobType) { return JOB_CONTEXT[jobType] ?? null; }

export function getCrewWorkCandidates({ jobType, crew = [], equipmentInstances = [] } = {}) {
  const meta = getCrewWorkContext(jobType);
  if (!meta) return [];
  return crew.filter((member) => member.alive !== false).map((member) => {
    const equipment = equipmentForCrew(equipmentInstances, member.id);
    const lead = prepareCrewLead({ member, context: meta.context, threshold: meta.threshold, equipment });
    return { ...lead, tier: operationalTier(lead.profile) };
  });
}

// This snapshot is intentionally made when the player queues the job. Later
// fatigue, equipment swaps, or save/reload cannot alter an already accepted ETA
// or completion modifier.
export function prepareCrewWorkSnapshot({ jobType, member, equipmentInstances = [], sectorId = null, useSpecialty = false } = {}) {
  const meta = getCrewWorkContext(jobType);
  if (!meta || !member?.id) return { ok: false, reason: "unsupportedJob" };
  const equipment = equipmentForCrew(equipmentInstances, member.id);
  const initialLead = prepareCrewLead({ member, context: meta.context, threshold: meta.threshold, equipment });
  const lead = { ...initialLead, tier: operationalTier(initialLead.profile) };
  if (!lead.profile.usable) return { ok: false, reason: "workerUnavailable", lead };
  const baseModifiers = projectActionModifiers(lead);
  let specialty = null;
  if (useSpecialty) {
    const availability = specialtyAvailability({ member, sectorId, context: meta.context, profile: lead.profile });
    const authored = SPECIALTY_DURATION[availability.specialty?.id];
    if (!availability.ok || !authored || !authored.contexts.includes(meta.context)) return { ok: false, reason: `specialty:${availability.reason ?? "unsupported"}`, lead };
    specialty = { id: availability.specialty.id, crewId: member.id, sectorId, durationMinutes: authored.durationMinutes };
  }
  const durationMinutes = baseModifiers.durationMinutes + (specialty?.durationMinutes ?? 0);
  const tierOutcome = lead.tier === "expert" ? 1 : lead.tier === "below" ? -1 : 0;
  const outcome = jobType === "hull_repair"
    ? { hullDelta: tierOutcome * 2 }
    : jobType === "salvage"
      ? { outputBonus: tierOutcome > 0 ? 1 : 0 }
      : jobType === "decode"
        ? { dustDelta: tierOutcome * 2 }
      : {};
  const effectiveDuration = Math.max(1, (jobType ? 1 : 1));
  return {
    ok: true,
    workerCrewId: member.id,
    jobType,
    context: meta.context,
    threshold: meta.threshold,
    lead,
    modifiers: { ...baseModifiers, durationMinutes },
    specialty,
    outcome,
    // `duration` is supplied by the caller; preserving the signed modifier is
    // what lets jobDuration calculate the exact, persisted ETA.
    effectiveDuration,
  };
}

export function projectCrewWorkDuration(baseDuration, snapshot) {
  return Math.max(1, Math.round(Number(baseDuration ?? 1) + Number(snapshot?.modifiers?.durationMinutes ?? 0)));
}

export function crewWorkPreviewLabel(snapshot, baseDuration) {
  if (!snapshot?.ok) return "담당 불가";
  const duration = projectCrewWorkDuration(baseDuration, snapshot);
  const tier = snapshot.lead?.tier === "expert" ? "전문" : snapshot.lead?.tier === "assist" ? "지원" : snapshot.lead?.tier === "below" ? "미달" : "표준";
  return `${tier} · ${snapshot.lead.profile.base}→${snapshot.lead.profile.effective} · ${duration}분`;
}

export function getEffectiveWorkProfile(member, context, equipmentInstances = []) {
  return getEffectiveCrewProfile({ member, context, equipment: equipmentForCrew(equipmentInstances, member?.id) });
}
