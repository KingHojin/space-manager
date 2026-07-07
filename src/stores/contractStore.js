import { create } from "zustand";
import { persist } from "zustand/middleware";
import { contracts } from "../data/contracts";
import { passthroughMigrate, PERSIST_VERSION } from "./persistVersion";

export const useContractStore = create(
  persist(
    (set) => ({
      acceptedIds: [],
      completedIds: [],
      acceptContract: (contractId) =>
        set((state) => {
          if (state.acceptedIds.includes(contractId) || state.completedIds.includes(contractId)) return state;
          return { acceptedIds: [...state.acceptedIds, contractId] };
        }),
      completeContract: (contractId) =>
        set((state) => ({
          acceptedIds: state.acceptedIds.filter((id) => id !== contractId),
          completedIds: Array.from(new Set([...state.completedIds, contractId])),
        })),
      abandonContract: (contractId) =>
        set((state) => ({ acceptedIds: state.acceptedIds.filter((id) => id !== contractId) })),
      getAvailableContracts: () => {
        const state = useContractStore.getState();
        return contracts.filter((contract) => !state.acceptedIds.includes(contract.id) && !state.completedIds.includes(contract.id));
      },
    }),
    { name: "space-manager-contracts", version: PERSIST_VERSION, migrate: passthroughMigrate },
  ),
);
