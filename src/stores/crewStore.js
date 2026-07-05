import { create } from "zustand";
import { persist } from "zustand/middleware";
import { initialCrew } from "../data/crew";

const moraleOrder = ["나쁨", "보통", "좋음", "최상"];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function shiftMorale(current, delta) {
  const index = moraleOrder.indexOf(current);
  const safeIndex = index >= 0 ? index : 1;
  return moraleOrder[clamp(safeIndex + delta, 0, moraleOrder.length - 1)];
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
    stats: { ...(base.stats ?? {}), ...(member.stats ?? {}) },
  };
}

function mergeCrew(savedCrew = []) {
  const savedById = new Map(savedCrew.map((member) => [member.id, member]));
  const mergedBase = initialCrew.map((member) => normalizeCrew({ ...member, ...(savedById.get(member.id) ?? {}) }));
  const extras = savedCrew.filter((member) => !initialCrew.some((base) => base.id === member.id)).map(normalizeCrew);
  return [...mergedBase, ...extras];
}

function applyTraining(member, statKey) {
  if (!member.alive) return member;
  return {
    ...member,
    fatigue: clamp((member.fatigue ?? 0) + 12, 0, 100),
    experience: (member.experience ?? 0) + 8,
    morale: shiftMorale(member.morale, 1),
    stats: {
      ...member.stats,
      [statKey]: (member.stats[statKey] ?? 0) + 1,
    },
  };
}

function applyTreatment(member, task) {
  if (!member.alive) return member;
  return {
    ...member,
    injury: "정상",
    fatigue: clamp((member.fatigue ?? 0) + (task.fatiguePenalty ?? 10), 0, 100),
    morale: shiftMorale(member.morale, 1),
  };
}

export const useCrewStore = create(
  persist(
    (set, get) => ({
      crew: initialCrew.map((member) => ({ ...member, alive: true })),
      trainingQueue: [],
      treatmentQueue: [],
      startTraining: ({ memberId, statKey, completeAt, cost, duration }) =>
        set((state) => ({
          trainingQueue: [
            ...state.trainingQueue.filter((task) => task.memberId !== memberId),
            { id: crypto.randomUUID(), memberId, statKey, completeAt, cost, duration, startedAt: completeAt - duration },
          ],
        })),
      startTreatment: ({ memberId, injury, completeAt, cost, duration, fatiguePenalty }) =>
        set((state) => ({
          treatmentQueue: [
            ...state.treatmentQueue.filter((task) => task.memberId !== memberId),
            { id: crypto.randomUUID(), memberId, injury, completeAt, cost, duration, fatiguePenalty, startedAt: completeAt - duration },
          ],
        })),
      completeReadyTraining: (currentMinute) => {
        const ready = get().trainingQueue.filter((task) => task.completeAt <= currentMinute);
        if (ready.length === 0) return [];
        const readyByMember = new Map(ready.map((task) => [task.memberId, task]));
        set((state) => ({
          trainingQueue: state.trainingQueue.filter((task) => task.completeAt > currentMinute),
          crew: state.crew.map((member) => {
            const task = readyByMember.get(member.id);
            return task ? applyTraining(member, task.statKey) : member;
          }),
        }));
        return ready.map((task) => {
          const member = get().crew.find((entry) => entry.id === task.memberId);
          return `${member?.name ?? "승무원"} 역할 훈련 완료.`;
        });
      },
      completeReadyTreatment: (currentMinute) => {
        const ready = get().treatmentQueue.filter((task) => task.completeAt <= currentMinute);
        if (ready.length === 0) return [];
        const readyByMember = new Map(ready.map((task) => [task.memberId, task]));
        set((state) => ({
          treatmentQueue: state.treatmentQueue.filter((task) => task.completeAt > currentMinute),
          crew: state.crew.map((member) => {
            const task = readyByMember.get(member.id);
            return task ? applyTreatment(member, task) : member;
          }),
        }));
        return ready.map((task) => {
          const member = get().crew.find((entry) => entry.id === task.memberId);
          return `${member?.name ?? "승무원"} 의무실 치료 완료.`;
        });
      },
      restMember: (memberId) =>
        set((state) => ({
          crew: state.crew.map((member) =>
            member.id === memberId && member.alive
              ? { ...member, fatigue: clamp((member.fatigue ?? 0) - 28, 0, 100), morale: shiftMorale(member.morale, 1) }
              : member,
          ),
        })),
      applyCrewOutcome: ({ memberId, fatigue = 0, morale = 0, injury = null, experience = 0 }) =>
        set((state) => ({
          crew: state.crew.map((member) =>
            member.id === memberId && member.alive
              ? {
                  ...member,
                  fatigue: clamp((member.fatigue ?? 0) + fatigue, 0, 100),
                  morale: shiftMorale(member.morale, morale),
                  injury: injury ?? member.injury,
                  experience: (member.experience ?? 0) + experience,
                }
              : member,
          ),
        })),
      applyCombatCasualty: ({ memberId, injury = "경상", morale = -1 }) =>
        set((state) => ({
          trainingQueue: injury === "전사" ? state.trainingQueue.filter((task) => task.memberId !== memberId) : state.trainingQueue,
          treatmentQueue: injury === "전사" ? state.treatmentQueue.filter((task) => task.memberId !== memberId) : state.treatmentQueue,
          crew: state.crew.map((member) =>
            member.id === memberId && member.alive
              ? {
                  ...member,
                  alive: injury !== "전사",
                  injury,
                  fatigue: injury === "전사" ? 100 : clamp((member.fatigue ?? 0) + (injury === "중상" ? 28 : 16), 0, 100),
                  morale: injury === "전사" ? "나쁨" : shiftMorale(member.morale, morale),
                }
              : member,
          ),
        })),
    }),
    {
      name: "space-manager-crew",
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...(persistedState ?? {}),
        crew: mergeCrew(persistedState?.crew),
        trainingQueue: persistedState?.trainingQueue ?? [],
        treatmentQueue: persistedState?.treatmentQueue ?? [],
      }),
    },
  ),
);
