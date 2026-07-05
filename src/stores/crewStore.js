import { create } from "zustand";
import { persist } from "zustand/middleware";
import { initialCrew } from "../data/crew";
import { generateCrewActivities, CREW_AI_INTERVAL } from "../systems/crewAI";
import {
  applyInjury,
  chooseTreatmentTarget,
  getRoleCoverage,
  improveInjuryOneStage,
  injuryLabel,
  injuryRank,
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
  return { ...member, fatigue: clamp((member.fatigue ?? 0) + 12 * fatigueMultiplier(member), 0, 100), experience: (member.experience ?? 0) + 8, morale: shiftMorale(member.morale, 1), stats: { ...member.stats, [statKey]: (member.stats[statKey] ?? 0) + 1 } };
}

function applyTreatment(member, task) {
  if (!member.alive) return member;
  const before = normalizeInjury(member.injury);
  const after = improveInjuryOneStage(before);
  return { ...member, injury: after, fatigue: clamp((member.fatigue ?? 0) + (task.fatiguePenalty ?? 10), 0, 100), morale: shiftMorale(member.morale, 1) };
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
      tickCrewHealth: ({ currentMinute = 0, deltaMinutes = 0 }) => {
        if (deltaMinutes <= 0) return [];
        const logs = [];
        set((state) => {
          const coverage = getRoleCoverage(state.crew);
          const hasMedic = (coverage.counts.의무실 ?? 0) > 0;
          const treatmentByMember = new Map((state.treatmentQueue ?? []).map((task) => [task.memberId, task]));
          const targetByMedic = activityTreatmentTargets(state.crew, state.crewActivities ?? []);
          const medicTargetIds = new Map([...targetByMedic.entries()].map(([medicId, targetId]) => [targetId, medicId]));
          const crew = state.crew.map((member) => {
            const result = tickMemberInjury({ member, deltaMinutes, hasMedic, isQueuedTreatment: treatmentByMember.has(member.id), treatedBy: medicTargetIds.get(member.id) ?? null });
            if (result.log) logs.push(result.log);
            return result.member;
          });
          return { crew, treatmentQueue: state.treatmentQueue.filter((task) => { const member = crew.find((entry) => entry.id === task.memberId); return member?.alive && isInjured(member.injury) && task.completeAt > currentMinute; }) };
        });
        return logs;
      },
      restMember: (memberId) => set((state) => ({ crew: state.crew.map((member) => member.id === memberId && member.alive ? { ...member, fatigue: clamp((member.fatigue ?? 0) - 28, 0, 100), morale: shiftMorale(member.morale, 1) } : member) })),
      applyCrewOutcome: ({ memberId, fatigue = 0, morale = 0, injury = null, experience = 0 }) => set((state) => ({ crew: state.crew.map((member) => member.id === memberId && member.alive ? { ...member, fatigue: clamp((member.fatigue ?? 0) + fatigue * fatigueMultiplier(member), 0, 100), morale: shiftMorale(member.morale, morale), injury: injury ? applyInjury(member, injury) : normalizeInjury(member.injury), experience: (member.experience ?? 0) + experience } : member) })),
      applyCombatCasualty: ({ memberId, injury = "경상", morale = -1 }) => set((state) => ({ trainingQueue: injury === "전사" ? state.trainingQueue.filter((task) => task.memberId !== memberId) : state.trainingQueue, treatmentQueue: injury === "전사" ? state.treatmentQueue.filter((task) => task.memberId !== memberId) : state.treatmentQueue, crew: state.crew.map((member) => member.id === memberId && member.alive ? { ...member, alive: injury !== "전사", injury: injury === "전사" ? normalizeInjury("incapacitated") : applyInjury(member, injury), fatigue: injury === "전사" ? 100 : clamp((member.fatigue ?? 0) + (injury === "중상" ? 28 : 16) * fatigueMultiplier(member), 0, 100), morale: injury === "전사" ? "나쁨" : shiftMorale(member.morale, morale) } : member) })),
      getRoleCoverage: () => getRoleCoverage(get().crew),
      getTreatmentTarget: () => chooseTreatmentTarget(get().crew),
    }),
    {
      name: "space-manager-crew",
      merge: (persistedState, currentState) => ({ ...currentState, ...(persistedState ?? {}), crew: mergeCrew(persistedState?.crew), trainingQueue: (persistedState?.trainingQueue ?? []).map((task) => normalizeTask(task, "normal")), treatmentQueue: (persistedState?.treatmentQueue ?? []).map((task) => normalizeTask(task, task.injury === "중상" || task.injury === "위독" ? "emergency" : "high")), crewActivities: persistedState?.crewActivities ?? [], crewActivityLog: persistedState?.crewActivityLog ?? [], lastCrewAiAt: persistedState?.lastCrewAiAt ?? null }),
    },
  ),
);
