import { create } from "zustand";
import { persist } from "zustand/middleware";
import { modules } from "../data/modules";

const initialInstalled = Object.fromEntries(modules.map((module) => [module.slot, module.id]));

let installedModulesCache = null;
let installedModulesCacheKey = null;

export const useShipStore = create(
  persist(
    () => ({
      modules,
      installed: initialInstalled,
      // Cached by `installed` reference so selector usages (e.g. useShipStore(s => s.getInstalledModules()))
      // don't produce a new array identity every render and trigger an infinite re-render loop.
      getInstalledModules: () => {
        const state = useShipStore.getState();
        if (installedModulesCacheKey === state.installed) return installedModulesCache;
        installedModulesCacheKey = state.installed;
        installedModulesCache = Object.values(state.installed)
          .map((id) => state.modules.find((module) => module.id === id))
          .filter(Boolean);
        return installedModulesCache;
      },
    }),
    { name: "space-manager-ship" },
  ),
);
