import { create } from "zustand";
import { persist } from "zustand/middleware";
import { getSkillById, starterSkillLevels } from "../data/skills";

export const useSkillStore = create(
  persist(
    (set, get) => ({
      availablePoints: 3,
      levels: starterSkillLevels,
      selectedSkillId: "exploration-deep-scan",
      selectSkill: (skillId) => set({ selectedSkillId: skillId }),
      upgradeSkill: (skillId) => {
        const skill = getSkillById(skillId);
        if (!skill) return false;
        const level = get().levels[skillId] ?? 0;
        const requiredLevel = skill.requires ? get().levels[skill.requires] ?? 0 : 1;
        if (level >= skill.maxLevel) return false;
        if (skill.requires && requiredLevel <= 0) return false;
        if (get().availablePoints < skill.cost) return false;
        set((state) => ({
          availablePoints: state.availablePoints - skill.cost,
          levels: { ...state.levels, [skillId]: level + 1 },
          selectedSkillId: skillId,
        }));
        return true;
      },
      resetSkills: () => set({ availablePoints: 3, levels: starterSkillLevels, selectedSkillId: "exploration-deep-scan" }),
      grantPoint: (amount = 1) => set((state) => ({ availablePoints: Math.max(0, state.availablePoints + amount) })),
    }),
    {
      name: "space-manager-skills",
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...(persistedState ?? {}),
        levels: { ...starterSkillLevels, ...(persistedState?.levels ?? {}) },
        availablePoints: persistedState?.availablePoints ?? currentState.availablePoints,
        selectedSkillId: persistedState?.selectedSkillId ?? currentState.selectedSkillId,
      }),
    },
  ),
);
