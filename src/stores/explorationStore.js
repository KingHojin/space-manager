import { create } from "zustand";
import { persist } from "zustand/middleware";
import { getAllZones } from "../data/sectors";
import { canExploreZone, consumeZoneYield, refreshZoneRuntimeIfNeeded } from "../systems/explorationRules";
import { rollExplorationReward } from "../systems/explorationLoot";
import { passthroughMigrate, PERSIST_VERSION } from "./persistVersion";

function normalizeRuntimeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeZoneRuntimeMap(map = {}) {
  return Object.fromEntries(
    Object.entries(map ?? {}).map(([zoneId, runtime]) => {
      const remainingYield = normalizeRuntimeNumber(runtime?.remainingYield);
      const lastExploredAt = normalizeRuntimeNumber(runtime?.lastExploredAt);
      return [
        zoneId,
        {
          explored: Boolean(runtime?.explored),
          ...(remainingYield !== undefined ? { remainingYield: Math.max(0, remainingYield) } : {}),
          lastExploredAt: lastExploredAt ?? null,
        },
      ];
    }),
  );
}

export const useExplorationStore = create(
  persist(
    (set, get) => ({
      currentZoneId: "anchor-station",
      selectedZoneId: null,
      discoveredZoneIds: ["anchor-station", "blue-drift"],
      scannedZoneIds: ["anchor-station"],
      route: ["anchor-station"],
      activeTravel: null,
      pendingTravelEvent: null,
      pendingCombatEncounter: null,
      travelLog: [],
      zoneRuntime: {},
      lastExplorationResult: null,
      selectZone: (zoneId) => set({ selectedZoneId: zoneId }),
      getZoneRuntime: (zone, currentMinute = 0) => refreshZoneRuntimeIfNeeded(zone, get().zoneRuntime?.[zone?.id], currentMinute),
      exploreZone: (zone, currentMinute = 0, rng = Math.random) => {
        const state = get();
        if (!zone?.id) return { ok: false, reason: "missingZone" };
        const runtime = refreshZoneRuntimeIfNeeded(zone, state.zoneRuntime?.[zone.id], currentMinute);
        const check = canExploreZone(zone, runtime, currentMinute);
        if (!check.ok) {
          const failed = { ok: false, reason: check.reason, zoneId: zone.id, runtime: check.runtime };
          set((nextState) => ({
            zoneRuntime: { ...nextState.zoneRuntime, [zone.id]: check.runtime },
            lastExplorationResult: failed,
          }));
          return failed;
        }
        const reward = rollExplorationReward(zone, check.runtime, rng);
        const nextRuntime = consumeZoneYield(zone, check.runtime, currentMinute, reward.yieldConsumed ?? 0);
        const result = { ...reward, ok: true, runtime: nextRuntime };
        set((nextState) => ({
          zoneRuntime: { ...nextState.zoneRuntime, [zone.id]: nextRuntime },
          lastExplorationResult: result,
          travelLog: [`탐험 결과: ${zone.name ?? zone.id} · ${reward.summary}`, ...nextState.travelLog].slice(0, 8),
        }));
        return result;
      },
      // NOTE (Phase 18-C): the legacy zone-travel action set (startTravel,
      // registerTravelFuelTick, registerTravelRoll, setPendingTravelEvent,
      // resolvePendingTravelEvent, dismissPendingTravelEvent, completeTravel)
      // was removed here — it had zero callers (navStore.planRoute/tickTravel
      // is the live travel path, see systems/gameClock.js processNavigation).
      // The `activeTravel`/`pendingTravelEvent` state fields stay above for
      // save-compatibility with existing localStorage saves; nothing writes
      // them anymore going forward.
      setPendingCombatEncounter: (encounter) => set({ pendingCombatEncounter: encounter }),
      clearPendingCombatEncounter: () => set({ pendingCombatEncounter: null }),
      moveToZone: (zoneId) =>
        set((state) => ({
          currentZoneId: zoneId,
          route: [...state.route, zoneId].slice(-8),
          discoveredZoneIds: Array.from(new Set([...state.discoveredZoneIds, zoneId])),
        })),
      scanZone: (zoneId) =>
        set((state) => ({
          scannedZoneIds: Array.from(new Set([...state.scannedZoneIds, zoneId])),
          discoveredZoneIds: Array.from(new Set([...state.discoveredZoneIds, zoneId])),
        })),
      revealRandomZone: () =>
        set((state) => {
          const hidden = getAllZones().find((zone) => !state.discoveredZoneIds.includes(zone.id));
          if (!hidden) return state;
          return { discoveredZoneIds: [...state.discoveredZoneIds, hidden.id] };
        }),
    }),
    {
      name: "space-manager-exploration",
      version: PERSIST_VERSION,
      migrate: passthroughMigrate,
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...(persistedState ?? {}),
        activeTravel: persistedState?.activeTravel ?? null,
        pendingTravelEvent: persistedState?.pendingTravelEvent ?? null,
        pendingCombatEncounter: persistedState?.pendingCombatEncounter ?? null,
        travelLog: persistedState?.travelLog ?? [],
        zoneRuntime: normalizeZoneRuntimeMap(persistedState?.zoneRuntime),
        lastExplorationResult: persistedState?.lastExplorationResult ?? null,
      }),
    },
  ),
);
