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
      travelLog: [],
      selectZone: (zoneId) => set({ selectedZoneId: zoneId }),
      startTravel: (plan) =>
        set({
          activeTravel: plan,
          selectedZoneId: plan.toZoneId,
          travelLog: [`항로 설정: ${plan.distanceLy} LY · ${plan.duration}분 소요`],
        }),
      resolveTravelEncounter: (checkpointId, summary) =>
        set((state) => ({
          activeTravel: state.activeTravel
            ? {
                ...state.activeTravel,
                encounters: state.activeTravel.encounters.map((checkpoint) =>
                  checkpoint.id === checkpointId ? { ...checkpoint, resolved: true } : checkpoint,
                ),
              }
            : null,
          travelLog: [summary, ...state.travelLog].slice(0, 6),
        })),
      completeTravel: () =>
        set((state) => {
          const destinationId = state.activeTravel?.toZoneId;
          if (!destinationId) return state;
          return {
            currentZoneId: destinationId,
            selectedZoneId: null,
            activeTravel: null,
            route: [...state.route, destinationId].slice(-8),
            discoveredZoneIds: Array.from(new Set([...state.discoveredZoneIds, destinationId])),
            travelLog: [`목적지 도착: ${getAllZones().find((zone) => zone.id === destinationId)?.name ?? destinationId}`, ...state.travelLog].slice(0, 6),
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
        travelLog: persistedState?.travelLog ?? [],
      }),
    },
  ),
);
