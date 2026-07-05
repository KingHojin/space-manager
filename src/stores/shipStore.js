import { create } from "zustand";
import { persist } from "zustand/middleware";
import { modules } from "../data/modules";

const initialInstalled = modules.reduce((acc, module) => {
  if (!acc[module.slot] || module.defaultInstalled) acc[module.slot] = module.id;
  return acc;
}, {});

const initialUnlockedIds = modules.filter((module) => module.defaultInstalled).map((module) => module.id);

let installedModulesCache = null;
let installedModulesCacheKey = null;

function clearInstalledCache() {
  installedModulesCache = null;
  installedModulesCacheKey = null;
}

function mergeModules(savedModules = []) {
  const savedById = new Map(savedModules.map((module) => [module.id, module]));
  return modules.map((module) => ({ ...module, ...(savedById.get(module.id) ?? {}) }));
}

function mergeInstalled(savedInstalled = {}) {
  const next = { ...initialInstalled, ...savedInstalled };
  modules.forEach((module) => {
    if (!next[module.slot]) next[module.slot] = module.id;
  });
  return next;
}

export const useShipStore = create(
  persist(
    (set) => ({
      modules,
      installed: initialInstalled,
      unlockedModuleIds: initialUnlockedIds,
      unlockModule: (moduleId) =>
        set((state) => ({
          unlockedModuleIds: Array.from(new Set([...(state.unlockedModuleIds ?? initialUnlockedIds), moduleId])),
        })),
      equipModule: (slot, moduleId) =>
        set((state) => {
          const unlocked = state.unlockedModuleIds ?? initialUnlockedIds;
          const module = state.modules.find((entry) => entry.id === moduleId && entry.slot === slot);
          if (!module || !unlocked.includes(moduleId)) return state;
          clearInstalledCache();
          return { installed: { ...state.installed, [slot]: moduleId } };
        }),
      upgradeModule: (moduleId) =>
        set((state) => {
          clearInstalledCache();
          return {
            modules: state.modules.map((module) => {
              if (module.id !== moduleId) return module;
              const nextStats = {};
              Object.entries(module.stats).forEach(([key, value]) => {
                nextStats[key] = Math.round(value * 1.12 + (value >= 0 ? 1 : -1));
              });
              return { ...module, level: module.level + 1, stats: nextStats };
            }),
          };
        }),
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
    {
      name: "space-manager-ship",
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...(persistedState ?? {}),
        modules: mergeModules(persistedState?.modules),
        installed: mergeInstalled(persistedState?.installed),
        unlockedModuleIds: Array.from(new Set([...initialUnlockedIds, ...((persistedState?.unlockedModuleIds) ?? [])])),
      }),
    },
  ),
);
