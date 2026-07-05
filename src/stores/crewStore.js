import { create } from "zustand";
import { persist } from "zustand/middleware";
import { CREW_NEEDS } from "../data/constants";
import { initialCrew } from "../data/crew";
import { generateCrewActivities, CREW_AI_INTERVAL } from "../systems/crewAI";
import {
  applyInjury,
  chooseTreatmentTarget,
  getRoleCoverage,
  improveInjuryOneStage,
  injuryLabel,
  isHealthy,
  isInjured,
  normalizeInjury,
  rollPermanentTrait,
  shouldWorsenInjury,
  treatmentRatePerHour,
  worsenInjuryOneStage,
} from "../systems/injurySystem";
import { normalizePriority } from "../systems/priorities";

const moraleOrder = ["나쁨", "보통", "좋음", "최상"];
const DEFAULT_NEEDS = { hunger: 12, mood: 68, stress: 18, sleepDebt: 8, hygiene: 78 };

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function shiftMorale(current, delta) {
  const index = moraleOrder.indexOf(current);
  const safeIndex = index >= 0 ? index : 1;
  return moraleOrder[clamp(safeIndex + delta, 0, moraleOrder.length - 1)];
}

function fatigueMultiplier(member) {
  return normalizeInjury(member.injury).permanentTraits.includes("chronic_fatigue") ? 1.3 : 1;
}

function normalizeNeeds(needs = {}) {
  return {
    hunger: clamp(needs.hunger ?? DEFAULT_NEEDS.hunger, 0, 100),
    mood: clamp(needs.mood ?? DEFAULT_NEEDS.mood, 0, 100),
    stress: clamp(needs.stress ?? DEFAULT_NEEDS.stress, 0, 100),
    sleepDebt: clamp(needs.sleepDebt ?? DEFAULT_NEEDS.sleepDebt, 0, 100),
    hygiene: clamp(needs.hygiene ?? DEFAULT_NEEDS.hygiene, 0, 100),
  };
}

function applyNeedDelta(needs, delta = {}) {
  const base = normalizeNeeds(needs);
  return normalizeNeeds({
    hunger: base.hunger + (delta.hunger ?? 0),
    mood: base.mood + (delta.mood ?? 0),
    stress: base.stress + (delta.stress ?? 0),
    sleepDebt: base.sleepDebt + (delta.sleepDebt ?? 0),
    hygiene: base.hygiene + (delta.hygiene ?? 0),
  });
}

function moraleFromNeeds(current, needs) {
  if (needs.stress >= 88 || needs.hunger >= 92 || needs.mood <= 15) return shiftMorale(current, -1);
  if (needs.stress <= 20 && needs.hunger <= 35 && needs.mood >= 72) return shiftMorale(current, 1);
  return current;
}

function normalizeCrew(member) {
  const base = initialCrew.find((entry) => entry.id === member.id) ?? {};
  return {
    ...base,
    ...member,
    alive: member.alive ?? base.alive ?? true,
    fatigue: member.fatigue ?? base.fatigue ?? 0,
    experience: member.experience ?? base.experience ?? 0,
    trait: member.trait ?? base.trait ?? "일반 대원",
    injury: normalizeInjury(member.injury ?? base.injury),
    needs: normalizeNeeds({ ...(base.needs ?? DEFAULT_NEEDS), ...(member.needs ?? {}) }),
    stats: { ...(base.stats ?? {}), ...(member.stats ?? {}) },
  };
}

function normalizeTask(task, fallbackPriority = "normal") {
  return { ...task, priority: normalizePriority(task.priority ?? fallbackPriority) };
}

function mergeCrew(savedCrew = []) {
  const savedById = new Map(savedCrew.map((member) => [member.id, member]));
  const mergedBase = initialCrew.map((member) => normalizeCrew({ ...member, ...(savedById.get(member.id) ?? {}) }));
  const extras = savedCrew.filter((member) => !initialCrew.some((base) => base.id === member.id)).map(normalizeCrew);
  return [...mergedBase, ...extras];
}

function applyTraining(member, statKey) {
  if (!member.alive) return member;
  const needs = applyNeedDelta(member.needs, { hunger: 8, mood: 2, stress: 8, sleepDebt: 4, hygiene: -4 });
  return { ...member, needs, fatigue: clamp((member.fatigue ?? 0) + 12 * fatigueMultiplier(member), 0, 100), experience: (member.experience ?? 0) + 8, morale: moraleFromNeeds(shiftMorale(member.morale, 1), needs), stats: { ...member.stats, [statKey]: (member.stats[statKey] ?? 0) + 1 } };
}

function applyTreatment(member, task) {
  if (!member.alive) return member;
  const before = normalizeInjury(member.injury);
  const after = improveInjuryOneStage(before);
  const needs = applyNeedDelta(member.needs, { hunger: 3, mood: 3, stress: -8, sleepDebt: -2, hygiene: 4 });
  return { ...member, needs, injury: after, fatigue: clamp((member.fatigue ?? 0) + (task.fatiguePenalty ?? 10), 0, 100), morale: moraleFromNeeds(shiftMorale(member.morale, 1), needs) };
}

function activityTreatmentTargets(crew, activities = []) {
  const medicActivities = activities.filter((activity) => activity.intent === "medical-care");
  if (medicActivities.length === 0) return new Map();
  const target = chooseTreatmentTarget(crew);
  if (!target) return new Map();
  return new Map(medicActivities.map((activity) => [activity.memberId, target.id]));
}

function tickMemberInjury({ member, deltaMinutes, hasMedic, isQueuedTreatment, treatedBy }) {
  if (!member.alive) return { member, log: null };
  const injury = normalizeInjury(member.injury);
  if (injury.state === "healthy") return { member: { ...member, injury }, log: null };
  const isBeingTreated = Boolean(isQueuedTreatment || treatedBy);
  const activeMedicCount = treatedBy ? 1 : 0;
  const hours = deltaMinutes / 60;
  let nextInjury = { ...injury, treatedBy: treatedBy ?? null, untreatedMinutes: isBeingTreated ? 0 : (injury.untreatedMinutes ?? 0) + deltaMinutes };
  let log = null;
  const canNaturallyRecover = injury.state === "minor" || injury.state === "incapacitated";
  const rate = isBeingTreated || canNaturallyRecover ? treatmentRatePerHour({ injury, hasMedic, activeMedicCount }) : 0;
  if (rate > 0) nextInjury = { ...nextInjury, recoveryProgress: clamp((nextInjury.recoveryProgress ?? 0) + rate * hours, 0, 100) };
  if (nextInjury.recoveryProgress >= 100) {
    const beforeState = nextInjury.state;
    nextInjury = improveInjuryOneStage(nextInjury);
    if (beforeState === "critical" && nextInjury.state === "serious") {
      const trait = rollPermanentTrait(nextInjury.permanentTraits);
      if (trait) nextInjury = { ...nextInjury, permanentTraits: [...nextInjury.permanentTraits, trait] };
    }
    log = `${member.name} 부상 호전: ${injuryLabel(beforeState)} → ${injuryLabel(nextInjury)}.`;
  } else if (shouldWorsenInjury({ injury: nextInjury, deltaMinutes, hasMedic, isBeingTreated })) {
    const beforeState = nextInjury.state;
    nextInjury = worsenInjuryOneStage(nextInjury);
    log = `${member.name} 부상 악화: ${injuryLabel(beforeState)} → ${injuryLabel(nextInjury)}.`;
  }
  return { member: { ...member, injury: nextInjury }, log };
}

function tickNeedsForMember(member, { deltaMinutes = 0, mode = "normal", severity = 1 }) {
  if (!member.alive) return { member, log: null };
  const hours = deltaMinutes / 60;
  const drift = mode === "drift";
  const severityMul = drift ? Math.max(1, severity) : 1;
  const hungerGain = (CREW_NEEDS.HUNGER_PER_HOUR + (drift ? CREW_NEEDS.DRIFT_HUNGER_PER_HOUR * severityMul : 0)) * hours;
  const stressGain = ((drift ? CREW_NEEDS.DRIFT_STRESS_PER_HOUR * severityMul : -CREW_NEEDS.STRESS_DECAY_PER_HOUR) + (member.fatigue >= 75 ? 0.9 : 0)) * hours;
  const moodLoss = (CREW_NEEDS.MOOD_DECAY_PER_HOUR + (drift ? CREW_NEEDS.DRIFT_MOOD_LOSS_PER_HOUR * severityMul : 0)) * hours;
  const sleepGain = (0.9 + (drift ? 1.1 * severityMul : 0)) * hours;
  const hygieneLoss = (0.7 + (drift ? 0.6 * severityMul : 0)) * hours;
  const needs = applyNeedDelta(member.needs, { hunger: hungerGain, stress: stressGain, mood: -moodLoss, sleepDebt: sleepGain, hygiene: -hygieneLoss });
  const fatigue = clamp((member.fatigue ?? 0) + (drift ? CREW_NEEDS.DRIFT_FATIGUE_PER_HOUR * severityMul * hours : 0.18 * hours), 0, 100);
  let log = null;
  if (drift && (needs.hunger >= 85 || needs.stress >= 85 || needs.mood <= 20)) log = `${member.name} 표류 스트레스 누적: 배고픔 ${Math.round(needs.hunger)}, 기분 ${Math.round(needs.mood)}, 스트레스 ${Math.round(needs.stress)}.`;
  return { member: { ...member, needs, fatigue, morale: moraleFromNeeds(member.morale, needs) }, log };
}

export const useCrewStore = create(
  persist(
    (set, get) => ({
      crew: initialCrew.map((member) => normalizeCrew({ ...member, alive: true })),
      trainingQueue: [],
      treatmentQueue: [],
      crewActivities: [],
      crewActivityLog: [],
      lastCrewAiAt: null,
      recruitCrew: (crewMember) => {
        const normalized = normalizeCrew({ ...crewMember, alive: true, injury: crewMember.injury ?? "healthy", fatigue: crewMember.fatigue ?? 0, morale: crewMember.morale ?? "보통", experience: crewMember.experience ?? 0 });
        let result = { ok: false, reason: "duplicate" };
        set((state) => {
          if (state.crew.some((member) => member.id === normalized.id)) return state;
          result = { ok: true, member: normalized };
          return { crew: [...state.crew, normalized] };
        });
        return result;
      },
      startTraining: ({ memberId, statKey, completeAt, cost, duration, priority = "normal" }) => set((state) => ({ trainingQueue: [...state.trainingQueue.filter((task) => task.memberId !== memberId), { id: crypto.randomUUID(), memberId, statKey, completeAt, cost, duration, priority: normalizePriority(priority), startedAt: completeAt - duration }] })),
      startTreatment: ({ memberId, injury, completeAt, cost, duration, fatiguePenalty, priority = "high" }) => set((state) => ({ treatmentQueue: [...state.treatmentQueue.filter((task) => task.memberId !== memberId), { id: crypto.randomUUID(), memberId, injury: injuryLabel(injury), completeAt, cost, duration, fatiguePenalty, priority: normalizePriority(priority), startedAt: completeAt - duration }] })),
      setTrainingPriority: (taskId, priority) => set((state) => ({ trainingQueue: state.trainingQueue.map((task) => (task.id === taskId ? { ...task, priority: normalizePriority(priority) } : task)) })),
      setTreatmentPriority: (taskId, priority) => set((state) => ({ treatmentQueue: state.treatmentQueue.map((task) => (task.id === taskId ? { ...task, priority: normalizePriority(priority) } : task)) })),
      runCrewAI: (snapshot) => {
        const currentMinute = snapshot.currentMinute ?? 0;
        const state = get();
        if (state.lastCrewAiAt !== null && currentMinute - state.lastCrewAiAt < CREW_AI_INTERVAL) return [];
        const activities = generateCrewActivities({ crew: state.crew, queues: { trainingQueue: state.trainingQueue, treatmentQueue: state.treatmentQueue }, snapshot, currentMinute });
        const previousByMember = new Map((state.crewActivities ?? []).map((activity) => [activity.memberId, activity]));
        const changed = activities.filter((activity) => previousByMember.get(activity.memberId)?.action !== activity.action || previousByMember.get(activity.memberId)?.station !== activity.station);
        const logEntries = changed.slice(0, 3).map((activity) => { const member = state.crew.find((entry) => entry.id === activity.memberId); return `${member?.name ?? "승무원"}: ${activity.station} · ${activity.action}`; });
        set((nextState) => ({ crewActivities: activities, lastCrewAiAt: currentMinute, crewActivityLog: [...logEntries, ...(nextState.crewActivityLog ?? [])].slice(0, 12) }));
        return logEntries;
      },
      completeReadyTraining: (currentMinute) => {
        const ready = get().trainingQueue.filter((task) => task.completeAt <= currentMinute);
        if (ready.length === 0) return [];
        const readyByMember = new Map(ready.map((task) => [task.memberId, task]));
        set((state) => ({ trainingQueue: state.trainingQueue.filter((task) => task.completeAt > currentMinute), crew: state.crew.map((member) => { const task = readyByMember.get(member.id); return task ? applyTraining(member, task.statKey) : member; }) }));
        return ready.map((task) => { const member = get().crew.find((entry) => entry.id === task.memberId); return `${member?.name ?? "승무원"} 역할 훈련 완료.`; });
      },
      completeReadyTreatment: (currentMinute) => {
        const ready = get().treatmentQueue.filter((task) => task.completeAt <= currentMinute);
        if (ready.length === 0) return [];
        const readyByMember = new Map(ready.map((task) => [task.memberId, task]));
        set((state) => ({ treatmentQueue: state.treatmentQueue.filter((task) => task.completeAt > currentMinute), crew: state.crew.map((member) => { const task = readyByMember.get(member.id); return task && isInjured(member.injury) ? applyTreatment(member, task) : member; }) }));
        return ready.map((task) => { const member = get().crew.find((entry) => entry.id === task.memberId); return `${member?.name ?? "승무원"} 의무실 치료 단계 완료.`; });
      },
      tickCrewNeeds: ({ deltaMinutes = 0, mode = "normal", severity = 1 }) => {
        if (deltaMinutes <= 0) return [];
        const logs = [];
        set((state) => ({ crew: state.crew.map((member) => { const result = tickNeedsForMember(member, { deltaMinutes, mode, severity }); if (result.log) logs.push(result.log); return result.member; }) }));
        return logs.slice(0, 3);
      },
      tickCrewHealth: ({ currentMinute = 0, deltaMinutes = 0 }) => {
        if (deltaMinutes <= 0) return [];
        const logs = [];
        set((state) => {
          const coverage = getRoleCoverage(state.crew);
          const hasMedic = (coverage.counts.의무실 ?? 0) > 0;
          const treatmentByMember = new Map((state.treatmentQueue ?? []).map((task) => [task.memberId, task]));
          const targetByMedic = activityTreatmentTargets(state.crew, state.crewActivities ?? []);
          const medicTargetIds = new Map([...targetByMedic.entries()].map(([medicId, targetId]) => [targetId, medicId]));
          const crew = state.crew.map((member) => { const result = tickMemberInjury({ member, deltaMinutes, hasMedic, isQueuedTreatment: treatmentByMember.has(member.id), treatedBy: medicTargetIds.get(member.id) ?? null }); if (result.log) logs.push(result.log); return result.member; });
          return { crew, treatmentQueue: state.treatmentQueue.filter((task) => { const member = crew.find((entry) => entry.id === task.memberId); return member?.alive && isInjured(member.injury) && task.completeAt > currentMinute; }) };
        });
        return logs;
      },
      restMember: (memberId) => set((state) => ({ crew: state.crew.map((member) => member.id === memberId && member.alive ? { ...member, needs: applyNeedDelta(member.needs, { hunger: -12, mood: 8, stress: -16, sleepDebt: -24, hygiene: 6 }), fatigue: clamp((member.fatigue ?? 0) - 28, 0, 100), morale: shiftMorale(member.morale, 1) } : member) })),
      applyCrewNeeds: ({ memberId = null, changes = {}, mode = "manual" }) => set((state) => ({ crew: state.crew.map((member) => { if (!member.alive || (memberId && member.id !== memberId)) return member; const needs = applyNeedDelta(member.needs, changes); return { ...member, needs, morale: moraleFromNeeds(member.morale, needs), fatigue: clamp((member.fatigue ?? 0) + (changes.fatigue ?? 0), 0, 100), lastNeedMode: mode }; }) })),
      applyCrewOutcome: ({ memberId, fatigue = 0, morale = 0, injury = null, experience = 0, needs = null }) => set((state) => ({ crew: state.crew.map((member) => member.id === memberId && member.alive ? { ...member, needs: needs ? applyNeedDelta(member.needs, needs) : normalizeNeeds(member.needs), fatigue: clamp((member.fatigue ?? 0) + fatigue * fatigueMultiplier(member), 0, 100), morale: shiftMorale(member.morale, morale), injury: injury ? applyInjury(member, injury) : normalizeInjury(member.injury), experience: (member.experience ?? 0) + experience } : member) })),
      applyCombatCasualty: ({ memberId, injury = "경상", morale = -1 }) => set((state) => ({ trainingQueue: injury === "전사" ? state.trainingQueue.filter((task) => task.memberId !== memberId) : state.trainingQueue, treatmentQueue: injury === "전사" ? state.treatmentQueue.filter((task) => task.memberId !== memberId) : state.treatmentQueue, crew: state.crew.map((member) => member.id === memberId && member.alive ? { ...member, alive: injury !== "전사", injury: injury === "전사" ? normalizeInjury("incapacitated") : applyInjury(member, injury), fatigue: injury === "전사" ? 100 : clamp((member.fatigue ?? 0) + (injury === "중상" ? 28 : 16) * fatigueMultiplier(member), 0, 100), morale: injury === "전사" ? "나쁨" : shiftMorale(member.morale, morale), needs: applyNeedDelta(member.needs, { mood: injury === "전사" ? -40 : -12, stress: injury === "전사" ? 40 : 18 }) } : member) })),
      getRoleCoverage: () => getRoleCoverage(get().crew),
      getTreatmentTarget: () => chooseTreatmentTarget(get().crew),
    }),
    {
      name: "space-manager-crew",
      merge: (persistedState, currentState) => ({ ...currentState, ...(persistedState ?? {}), crew: mergeCrew(persistedState?.crew), trainingQueue: (persistedState?.trainingQueue ?? []).map((task) => normalizeTask(task, "normal")), treatmentQueue: (persistedState?.treatmentQueue ?? []).map((task) => normalizeTask(task, task.injury === "중상" || task.injury === "위독" ? "emergency" : "high")), crewActivities: persistedState?.crewActivities ?? [], crewActivityLog: persistedState?.crewActivityLog ?? [], lastCrewAiAt: persistedState?.lastCrewAiAt ?? null }),
    },
  ),
);
