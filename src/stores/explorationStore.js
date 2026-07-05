import { create } from "zustand";
import { persist } from "zustand/middleware";
import { getAllZones } from "../data/sectors";

export const useExplorationStore = create(
  persist(
    (set) => ({
      currentZoneId: "anchor-station",
      selectedZoneId: null,
      discoveredZoneIds: ["anchor-station", "blue-drift"],
      scannedZoneIds: ["anchor-station"],
      route: ["anchor-station"],
      activeTravel: null,
      pendingTravelEvent: null,
      pendingCombatEncounter: null,
      travelLog: [],
      selectZone: (zoneId) => set({ selectedZoneId: zoneId }),
      startTravel: (plan) =>
        set({
          activeTravel: plan,
          pendingTravelEvent: null,
          pendingCombatEncounter: null,
          selectedZoneId: plan.toZoneId,
          travelLog: [`항로 설정: ${plan.distanceLy} LY · ${plan.duration}분 소요`],
        }),
      registerTravelFuelTick: (currentMinute) =>
        set((state) => ({
          activeTravel: state.activeTravel ? { ...state.activeTravel, lastFuelAt: currentMinute } : null,
        })),
      registerTravelRoll: (summary, currentMinute, happened = false) =>
        set((state) => ({
          activeTravel: state.activeTravel
            ? {
                ...state.activeTravel,
                lastEncounterAt: currentMinute,
                encounterCount: (state.activeTravel.encounterCount ?? 0) + (happened ? 1 : 0),
              }
            : null,
          travelLog: summary ? [summary, ...state.travelLog].slice(0, 8) : state.travelLog,
        })),
      setPendingTravelEvent: (eventCard) =>
        set((state) => ({
          pendingTravelEvent: eventCard,
          travelLog: eventCard ? [`이벤트 카드 발생: ${eventCard.title}`, ...state.travelLog].slice(0, 8) : state.travelLog,
        })),
      resolvePendingTravelEvent: (nextTravel, summary) =>
        set((state) => ({
          activeTravel: nextTravel ?? state.activeTravel,
          pendingTravelEvent: null,
          travelLog: summary ? [summary, ...state.travelLog].slice(0, 8) : state.travelLog,
        })),
      dismissPendingTravelEvent: (summary) =>
        set((state) => ({
          pendingTravelEvent: null,
          travelLog: summary ? [summary, ...state.travelLog].slice(0, 8) : state.travelLog,
        })),
      setPendingCombatEncounter: (encounter) => set({ pendingCombatEncounter: encounter }),
      clearPendingCombatEncounter: () => set({ pendingCombatEncounter: null }),
      completeTravel: () =>
        set((state) => {
          const destinationId = state.activeTravel?.toZoneId;
          if (!destinationId) return state;
          return {
            currentZoneId: destinationId,
            selectedZoneId: null,
            activeTravel: null,
            pendingTravelEvent: null,
            pendingCombatEncounter: null,
            route: [...state.route, destinationId].slice(-8),
            discoveredZoneIds: Array.from(new Set([...state.discoveredZoneIds, destinationId])),
            travelLog: [`목적지 도착: ${getAllZones().find((zone) => zone.id === destinationId)?.name ?? destinationId}`, ...state.travelLog].slice(0, 8),
          };
        }),
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
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...(persistedState ?? {}),
        activeTravel: persistedState?.activeTravel ?? null,
        pendingTravelEvent: persistedState?.pendingTravelEvent ?? null,
        pendingCombatEncounter: persistedState?.pendingCombatEncounter ?? null,
        travelLog: persistedState?.travelLog ?? [],
      }),
    },
  ),
);
