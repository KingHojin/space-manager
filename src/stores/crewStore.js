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

export const useCrewStore = create(
  persist(
    (set) => ({
      crew: initialCrew,
      trainMember: (memberId, statKey) =>
        set((state) => ({
          crew: state.crew.map((member) => {
            if (member.id !== memberId) return member;
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
          }),
        })),
      restMember: (memberId) =>
        set((state) => ({
          crew: state.crew.map((member) =>
            member.id === memberId
              ? { ...member, fatigue: clamp((member.fatigue ?? 0) - 28, 0, 100), morale: shiftMorale(member.morale, 1) }
              : member,
          ),
        })),
      treatMember: (memberId) =>
        set((state) => ({
          crew: state.crew.map((member) =>
            member.id === memberId
              ? { ...member, injury: "정상", fatigue: clamp((member.fatigue ?? 0) + 8, 0, 100), morale: shiftMorale(member.morale, 1) }
              : member,
          ),
        })),
      applyCrewOutcome: ({ memberId, fatigue = 0, morale = 0, injury = null, experience = 0 }) =>
        set((state) => ({
          crew: state.crew.map((member) =>
            member.id === memberId
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
    }),
    {
      name: "space-manager-crew",
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...(persistedState ?? {}),
        crew: mergeCrew(persistedState?.crew),
      }),
    },
  ),
);
