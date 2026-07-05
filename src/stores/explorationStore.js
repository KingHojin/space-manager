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
      selectZone: (zoneId) => set({ selectedZoneId: zoneId }),
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
    { name: "space-manager-exploration" },
  ),
);
