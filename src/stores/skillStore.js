import { create } from "zustand";
import { persist } from "zustand/middleware";
import { getSkillById, isImplementedSkill, starterSkillLevels } from "../data/skills";
import { passthroughMigrate, PERSIST_VERSION } from "./persistVersion";

export const useSkillStore = create(
  persist(
    (set, get) => ({
      availablePoints: 3,
      earnedPoints: 0,
      levels: starterSkillLevels,
      selectedSkillId: "combat-targeting",
      lastResetSectorIndex: -1,
      requisitionReceipts: {},
      selectSkill: (skillId) => set({ selectedSkillId: skillId }),
      upgradeSkill: (skillId) => {
        const skill = getSkillById(skillId);
        if (!skill || !isImplementedSkill(skillId)) return false;
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
      applyValidatedReset: (sectorIndex) => set((state) => ({ availablePoints: 3 + Math.max(0, state.earnedPoints ?? 0), levels: { ...starterSkillLevels }, selectedSkillId: "combat-targeting", lastResetSectorIndex: sectorIndex })),
      grantPoint: (amount = 1) => set((state) => {
        const granted = Math.max(0, Math.floor(amount));
        return {
          availablePoints: Math.max(0, state.availablePoints + granted),
          earnedPoints: Math.max(0, (state.earnedPoints ?? 0) + granted),
        };
      }),
      applyRequisitionPoint: (claimId, amount = 1) => {
        if (!claimId || get().requisitionReceipts?.[claimId]) return false;
        const granted = Math.max(0, Math.floor(amount));
        set((state) => ({ availablePoints: state.availablePoints + granted, earnedPoints: (state.earnedPoints ?? 0) + granted, requisitionReceipts: { ...(state.requisitionReceipts ?? {}), [claimId]: true } }));
        return true;
      },
    }),
    {
      name: "space-manager-skills",
      version: PERSIST_VERSION,
      migrate: passthroughMigrate,
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...(persistedState ?? {}),
        levels: { ...starterSkillLevels, ...(persistedState?.levels ?? {}) },
        availablePoints: persistedState?.availablePoints ?? currentState.availablePoints,
        earnedPoints: persistedState?.earnedPoints ?? 0,
        selectedSkillId: persistedState?.selectedSkillId ?? currentState.selectedSkillId,
        requisitionReceipts: persistedState?.requisitionReceipts ?? {},
        lastResetSectorIndex: persistedState?.lastResetSectorIndex ?? -1,
      }),
    },
  ),
);
