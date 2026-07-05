import { create } from "zustand";
import { persist } from "zustand/middleware";
import { initialReputation } from "../data/factions";

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export const useFactionStore = create(
  persist(
    (set) => ({
      reputation: initialReputation,
      addReputation: (factionId, amount) =>
        set((state) => ({
          reputation: {
            ...state.reputation,
            [factionId]: clamp((state.reputation[factionId] ?? 0) + amount, -100, 100),
          },
        })),
    }),
    {
      name: "space-manager-factions",
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...(persistedState ?? {}),
        reputation: { ...initialReputation, ...(persistedState?.reputation ?? {}) },
      }),
    },
  ),
);
