import { create } from "zustand";
import { persist } from "zustand/middleware";
import { modules } from "../data/modules";

const initialInstalled = Object.fromEntries(modules.map((module) => [module.slot, module.id]));

export const useShipStore = create(
  persist(
    () => ({
      modules,
      installed: initialInstalled,
      getInstalledModules: () => {
        const state = useShipStore.getState();
        return Object.values(state.installed)
          .map((id) => state.modules.find((module) => module.id === id))
          .filter(Boolean);
      },
    }),
    { name: "space-manager-ship" },
  ),
);
