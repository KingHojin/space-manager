import { create } from "zustand";
import { persist } from "zustand/middleware";
import { ROOM_IDS } from "../data/shipRooms";
import { applyRoomTick, createInitialRoomState, deriveRoomStatus } from "../systems/roomJobs";

function mergeRooms(savedRooms) {
  const initial = createInitialRoomState();
  if (!savedRooms) return initial;
  const merged = { ...initial };
  ROOM_IDS.forEach((id) => {
    if (savedRooms[id]) merged[id] = { ...initial[id], ...savedRooms[id] };
  });
  return merged;
}

export const useShipInteriorStore = create(
  persist(
    (set, get) => ({
      rooms: createInitialRoomState(),
      // Pure tick — mutates only this store's own `rooms` state. Any cross-store
      // effects (crew fatigue, hull, etc.) are returned in `completedJobs` for
      // the caller (gameClock) to apply, so this store never imports another store.
      tickRooms: ({ currentMinute, deltaMinutes, roomActivities = {} }) => {
        const { nextRooms, completedJobs, logs } = applyRoomTick({
          rooms: get().rooms,
          roomActivities,
          deltaMinutes,
          currentMinute,
        });
        set({ rooms: nextRooms });
        return { completedJobs, logs };
      },
    }),
    {
      name: "space-manager-ship-interior",
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...(persistedState ?? {}),
        rooms: mergeRooms(persistedState?.rooms),
      }),
    },
  ),
);

export { deriveRoomStatus };
