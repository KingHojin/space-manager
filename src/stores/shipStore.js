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

function mergeUnlocked(persistedState) {
  return Array.from(
    new Set([
      ...initialUnlockedIds,
      ...Object.values(persistedState?.installed ?? {}),
      ...((persistedState?.unlockedModuleIds) ?? []),
    ]),
  );
}

export const useShipStore = create(
  persist(
    (set, get) => ({
      modules,
      installed: initialInstalled,
      unlockedModuleIds: initialUnlockedIds,
      installationQueue: [],
      unlockModule: (moduleId) =>
        set((state) => ({
          unlockedModuleIds: Array.from(new Set([...(state.unlockedModuleIds ?? initialUnlockedIds), moduleId])),
        })),
      startInstallation: ({ slot, moduleId, completeAt, cost, duration }) =>
        set((state) => ({
          installationQueue: [
            ...state.installationQueue.filter((task) => task.slot !== slot),
            { id: crypto.randomUUID(), type: "equip", slot, moduleId, completeAt, cost, duration, startedAt: completeAt - duration },
          ],
        })),
      startUpgrade: ({ moduleId, completeAt, cost, duration }) =>
        set((state) => ({
          installationQueue: [
            ...state.installationQueue,
            { id: crypto.randomUUID(), type: "upgrade", moduleId, completeAt, cost, duration, startedAt: completeAt - duration },
          ],
        })),
      completeReadyInstallations: (currentMinute) => {
        const ready = get().installationQueue.filter((task) => task.completeAt <= currentMinute);
        if (ready.length === 0) return [];
        const logs = [];
        set((state) => {
          let nextInstalled = { ...state.installed };
          let nextModules = state.modules;
          ready.forEach((task) => {
            const module = state.modules.find((entry) => entry.id === task.moduleId);
            if (!module) return;
            if (task.type === "equip") {
              nextInstalled = { ...nextInstalled, [task.slot]: task.moduleId };
              logs.push(`${task.slot} 슬롯에 ${module.name} 장착 완료.`);
            }
            if (task.type === "upgrade") {
              nextModules = nextModules.map((entry) => {
                if (entry.id !== task.moduleId) return entry;
                const nextStats = {};
                Object.entries(entry.stats).forEach(([key, value]) => {
                  nextStats[key] = Math.round(value * 1.12 + (value >= 0 ? 1 : -1));
                });
                logs.push(`${entry.name} 모듈 Lv.${entry.level + 1} 개선 완료.`);
                return { ...entry, level: entry.level + 1, stats: nextStats };
              });
            }
          });
          clearInstalledCache();
          return {
            installed: nextInstalled,
            modules: nextModules,
            installationQueue: state.installationQueue.filter((task) => task.completeAt > currentMinute),
          };
        });
        return logs;
      },
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
        unlockedModuleIds: mergeUnlocked(persistedState),
        installationQueue: persistedState?.installationQueue ?? [],
      }),
    },
  ),
);
