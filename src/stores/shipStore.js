import { create } from "zustand";
import { persist } from "zustand/middleware";
import { modules } from "../data/modules";
import { normalizePriority } from "../systems/priorities";

const STARTER_VESSEL_ID = "vessel-starter";
const initialVesselsById = {
  [STARTER_VESSEL_ID]: {
    id: STARTER_VESSEL_ID,
    name: "개척선 알파",
    callsign: "ALPHA",
    role: "starter",
  },
};

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

function mergeVessels(persistedState) {
  const vesselsById = { ...initialVesselsById, ...(persistedState?.vesselsById ?? {}) };
  const activeVesselId = persistedState?.activeVesselId && vesselsById[persistedState.activeVesselId] ? persistedState.activeVesselId : STARTER_VESSEL_ID;
  return { vesselsById, activeVesselId };
}

function normalizeWorkTask(task) {
  const fallback = task.type === "equip" ? "high" : "normal";
  const module = modules.find((entry) => entry.id === task.moduleId);
  return { ...task, slot: task.slot ?? module?.slot, priority: normalizePriority(task.priority ?? fallback) };
}

function normalizeShipWorkTask(task) {
  const fallback = task.type === "hullRepair" ? "high" : "normal";
  return {
    ...task,
    payload: task.payload ?? {},
    roomId: task.roomId ?? "engineering",
    priority: normalizePriority(task.priority ?? fallback),
  };
}

function improveModule(module) {
  const nextStats = {};
  Object.entries(module.stats).forEach(([key, value]) => {
    nextStats[key] = Math.round(value * 1.12 + (value >= 0 ? 1 : -1));
  });
  return { ...module, level: module.level + 1, stats: nextStats };
}

export const useShipStore = create(
  persist(
    (set, get) => ({
      activeVesselId: STARTER_VESSEL_ID,
      vesselsById: initialVesselsById,
      modules,
      installed: initialInstalled,
      unlockedModuleIds: initialUnlockedIds,
      installationQueue: [],
      shipWorkQueue: [],
      selectVessel: (vesselId) => set((state) => (state.vesselsById?.[vesselId] ? { activeVesselId: vesselId } : state)),
      unlockModule: (moduleId) =>
        set((state) => ({
          unlockedModuleIds: Array.from(new Set([...(state.unlockedModuleIds ?? initialUnlockedIds), moduleId])),
        })),
      startInstallation: ({ slot, moduleId, completeAt, cost, duration, priority = "high" }) =>
        set((state) => ({
          installationQueue: [
            ...state.installationQueue.filter((task) => task.slot !== slot),
            { id: crypto.randomUUID(), type: "equip", slot, moduleId, completeAt, cost, duration, priority: normalizePriority(priority), startedAt: completeAt - duration },
          ],
        })),
      startUpgrade: ({ moduleId, slot = null, completeAt, cost, duration, priority = "normal" }) =>
        set((state) => ({
          installationQueue: [
            ...state.installationQueue,
            { id: crypto.randomUUID(), type: "upgrade", slot: slot ?? state.modules.find((module) => module.id === moduleId)?.slot, moduleId, completeAt, cost, duration, priority: normalizePriority(priority), startedAt: completeAt - duration },
          ],
        })),
      startShipWork: ({ type, roomId = "engineering", completeAt, cost = 0, duration, payload = {}, priority = "normal" }) =>
        set((state) => ({
          shipWorkQueue: [
            ...state.shipWorkQueue,
            normalizeShipWorkTask({ id: crypto.randomUUID(), type, roomId, completeAt, cost, duration, payload, priority, startedAt: completeAt - duration }),
          ],
        })),
      setInstallationPriority: (taskId, priority) =>
        set((state) => ({
          installationQueue: state.installationQueue.map((task) => (task.id === taskId ? { ...task, priority: normalizePriority(priority) } : task)),
        })),
      setShipWorkPriority: (taskId, priority) =>
        set((state) => ({
          shipWorkQueue: state.shipWorkQueue.map((task) => (task.id === taskId ? { ...task, priority: normalizePriority(priority) } : task)),
        })),
      applyModuleJob: (task = {}) => {
        const action = task.action ?? task.type;
        const moduleId = task.moduleId ?? task.payload?.moduleId;
        const requestedSlot = task.slot ?? task.payload?.slot;
        let log = null;
        set((state) => {
          const module = state.modules.find((entry) => entry.id === moduleId);
          if (!module) return state;
          const slot = requestedSlot ?? module.slot;
          if (action === "equip") {
            log = `${slot} 슬롯에 ${module.name} 장착 완료.`;
            clearInstalledCache();
            return { installed: { ...state.installed, [slot]: moduleId } };
          }
          if (action === "upgrade") {
            const nextModules = state.modules.map((entry) => (entry.id === moduleId ? improveModule(entry) : entry));
            log = `${module.name} 모듈 Lv.${module.level + 1} 개선 완료.`;
            clearInstalledCache();
            return { modules: nextModules };
          }
          return state;
        });
        return log;
      },
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
              nextModules = nextModules.map((entry) => (entry.id === task.moduleId ? improveModule(entry) : entry));
              logs.push(`${module.name} 모듈 Lv.${module.level + 1} 개선 완료.`);
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
      completeReadyShipWork: (currentMinute) => {
        const ready = get().shipWorkQueue.filter((task) => task.completeAt <= currentMinute).map(normalizeShipWorkTask);
        if (ready.length === 0) return [];
        set((state) => ({ shipWorkQueue: state.shipWorkQueue.filter((task) => task.completeAt > currentMinute) }));
        return ready;
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
      getActiveVessel: () => {
        const state = get();
        return state.vesselsById?.[state.activeVesselId] ?? null;
      },
    }),
    {
      name: "space-manager-ship",
      merge: (persistedState, currentState) => {
        const fleet = mergeVessels(persistedState);
        return {
          ...currentState,
          ...(persistedState ?? {}),
          ...fleet,
          modules: mergeModules(persistedState?.modules),
          installed: mergeInstalled(persistedState?.installed),
          unlockedModuleIds: mergeUnlocked(persistedState),
          installationQueue: (persistedState?.installationQueue ?? []).map(normalizeWorkTask),
          shipWorkQueue: (persistedState?.shipWorkQueue ?? []).map(normalizeShipWorkTask),
        };
      },
    },
  ),
);
