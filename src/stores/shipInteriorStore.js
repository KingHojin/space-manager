import { create } from "zustand";
import { persist } from "zustand/middleware";
import { ROOM_IDS } from "../data/shipRooms";
import {
  CRISIS_CATALOG,
  createCrisisRecord,
  crisisResponseRatePerMinute,
  getCrisisConfig,
  getCrisisLabel,
  pickAdjacentRoom,
  shouldSpawnInternalCrisis,
} from "../systems/crisisSystem";
import { applyRoomTick, createInitialRoomState, deriveRoomStatus } from "../systems/roomJobs";

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function withRoomStatus(room, currentMinute) {
  const next = { ...room, status: deriveRoomStatus(room) };
  if (currentMinute !== undefined) next.updatedAt = currentMinute;
  return next;
}

function mergeRooms(savedRooms) {
  const initial = createInitialRoomState();
  if (!savedRooms) return initial;
  const merged = { ...initial };
  ROOM_IDS.forEach((id) => {
    if (savedRooms[id]) merged[id] = withRoomStatus({ ...initial[id], ...savedRooms[id], activeCrisisId: savedRooms[id].activeCrisisId ?? null });
  });
  return merged;
}

function mergeCrises(savedCrises) {
  if (!Array.isArray(savedCrises)) return [];
  return savedCrises
    .filter((crisis) => crisis?.id && crisis?.roomId && CRISIS_CATALOG[crisis.type])
    .map((crisis) => ({
      id: crisis.id,
      roomId: crisis.roomId,
      type: crisis.type,
      severity: clamp(crisis.severity ?? 1, 1, 3),
      progress: clamp(crisis.progress ?? 0, 0, 100),
      escalateAt: crisis.escalateAt ?? crisis.createdAtMinutes ?? 0,
      assignedCrewId: crisis.assignedCrewId ?? null,
      createdAtMinutes: crisis.createdAtMinutes ?? 0,
    }));
}

function addCrisisToDraft({ rooms, activeCrises, roomId, type, severity = 1, currentMinute = 0 }) {
  const room = rooms[roomId];
  if (!room || room.activeCrisisId) return null;

  const crisis = createCrisisRecord({ roomId, type, severity, currentMinute });
  const config = getCrisisConfig(crisis.type);
  const conditionHit = config.conditionHit + (crisis.severity - 1) * 7;
  const loadHit = config.loadHit + (crisis.severity - 1) * 4;
  const nextRoom = withRoomStatus(
    {
      ...room,
      condition: clamp((room.condition ?? 100) - conditionHit, 0, 100),
      load: clamp((room.load ?? 0) + loadHit, 0, 100),
      jobId: null,
      assignedMemberId: null,
      progress: 0,
      activeCrisisId: crisis.id,
    },
    currentMinute,
  );

  rooms[roomId] = nextRoom;
  activeCrises.push(crisis);
  return crisis;
}

function releaseCrisisRoom(rooms, crisis, currentMinute) {
  const room = rooms[crisis.roomId];
  if (!room) return;
  rooms[crisis.roomId] = withRoomStatus(
    {
      ...room,
      condition: clamp((room.condition ?? 0) + 10 + crisis.severity * 2, 0, 100),
      load: clamp((room.load ?? 0) - 10, 0, 100),
      activeCrisisId: null,
      jobId: null,
      assignedMemberId: null,
      progress: 0,
    },
    currentMinute,
  );
}

function maybeInjureResponder({ effects, crisis, responder, chanceMultiplier = 1 }) {
  const config = getCrisisConfig(crisis.type);
  if (!responder || !config.injuryChance) return;
  const chance = config.injuryChance * chanceMultiplier * crisis.severity;
  if (Math.random() < chance) {
    effects.push({ type: "crewCasualty", memberId: responder.id, injury: crisis.severity >= 3 ? "중상" : "경상", morale: -1 });
  }
}

function isCrewUsable(member) {
  if (!member?.alive) return false;
  if (member.injury && member.injury !== "정상") return false;
  if ((member.fatigue ?? 0) >= 85) return false;
  return true;
}

export const useShipInteriorStore = create(
  persist(
    (set, get) => ({
      rooms: createInitialRoomState(),
      activeCrises: [],
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
      spawnCrisis: (roomId, type, severity = 1, currentMinute = 0) => {
        let spawned = null;
        set((state) => {
          const rooms = { ...state.rooms };
          const activeCrises = [...(state.activeCrises ?? [])];
          spawned = addCrisisToDraft({ rooms, activeCrises, roomId, type, severity, currentMinute });
          return spawned ? { rooms, activeCrises } : state;
        });
        return spawned;
      },
      assignCrisisResponder: (crisisId, crewId) =>
        set((state) => ({
          activeCrises: (state.activeCrises ?? []).map((crisis) => (crisis.id === crisisId ? { ...crisis, assignedCrewId: crewId } : crisis)),
        })),
      progressCrisis: (crisisId, amount = 0, currentMinute = 0) => {
        let resolved = null;
        set((state) => {
          const rooms = { ...state.rooms };
          const activeCrises = [];
          (state.activeCrises ?? []).forEach((crisis) => {
            if (crisis.id !== crisisId) {
              activeCrises.push(crisis);
              return;
            }
            const next = { ...crisis, progress: clamp((crisis.progress ?? 0) + amount, 0, 100) };
            if (next.progress >= 100) {
              resolved = next;
              releaseCrisisRoom(rooms, next, currentMinute);
            } else {
              activeCrises.push(next);
            }
          });
          return { rooms, activeCrises };
        });
        return resolved;
      },
      resolveCrisis: (crisisId, currentMinute = 0) => {
        let resolved = null;
        set((state) => {
          const rooms = { ...state.rooms };
          const activeCrises = [];
          (state.activeCrises ?? []).forEach((crisis) => {
            if (crisis.id === crisisId) {
              resolved = crisis;
              releaseCrisisRoom(rooms, crisis, currentMinute);
            } else {
              activeCrises.push(crisis);
            }
          });
          return { rooms, activeCrises };
        });
        return resolved;
      },
      tickCrises: ({ currentMinute = 0, deltaMinutes = 0, crisisActivities = {}, crew = [] }) => {
        if (deltaMinutes <= 0) return { effects: [], logs: [] };

        const effects = [];
        const logs = [];
        const crewById = new Map(crew.map((member) => [member.id, member]));
        const responderByCrisisId = new Map(Object.entries(crisisActivities).map(([crisisId, activity]) => [crisisId, activity.memberId]));

        set((state) => {
          const rooms = { ...state.rooms };
          let activeCrises = [...(state.activeCrises ?? [])];

          ROOM_IDS.forEach((roomId) => {
            const spawnType = shouldSpawnInternalCrisis({ room: rooms[roomId], currentMinute, deltaMinutes });
            if (!spawnType) return;
            const spawned = addCrisisToDraft({ rooms, activeCrises, roomId, type: spawnType, severity: 1, currentMinute });
            if (spawned) logs.push(`위기 발생: ${getCrisisLabel(spawned)} (${roomId}).`);
          });

          const newCrises = [];
          const blockedRoomIds = new Set(activeCrises.map((crisis) => crisis.roomId));
          activeCrises = activeCrises
            .map((crisis) => {
              const config = getCrisisConfig(crisis.type);
              const room = rooms[crisis.roomId];
              if (!room) return null;

              const responderId = responderByCrisisId.get(crisis.id) ?? null;
              const responder = isCrewUsable(crewById.get(responderId)) ? crewById.get(responderId) : null;
              let next = { ...crisis, assignedCrewId: responder?.id ?? null };

              if (responder) {
                const gained = crisisResponseRatePerMinute(responder, next) * deltaMinutes;
                next = { ...next, progress: clamp((next.progress ?? 0) + gained, 0, 100) };
                maybeInjureResponder({ effects, crisis: next, responder, chanceMultiplier: deltaMinutes / 90 });
              } else {
                const hours = deltaMinutes / 60;
                const conditionLoss = config.unattendedConditionLossPerHour * hours * next.severity;
                rooms[next.roomId] = withRoomStatus(
                  {
                    ...rooms[next.roomId],
                    condition: clamp((rooms[next.roomId].condition ?? 0) - conditionLoss, 0, 100),
                    load: clamp((rooms[next.roomId].load ?? 0) + hours * next.severity, 0, 100),
                    jobId: null,
                    assignedMemberId: null,
                    progress: 0,
                    activeCrisisId: next.id,
                  },
                  currentMinute,
                );

                if (next.type === "power_loss" && next.severity >= 2) {
                  ROOM_IDS.forEach((roomId) => {
                    if (roomId === next.roomId || !rooms[roomId]) return;
                    rooms[roomId] = withRoomStatus({ ...rooms[roomId], load: clamp((rooms[roomId].load ?? 0) + hours * 0.75 * next.severity, 0, 100) }, currentMinute);
                  });
                }

                if (next.type === "hull_breach") {
                  effects.push({ type: "resourceDelta", resources: { oxygen: -(config.oxygenLossPerHour ?? 0) * hours * next.severity } });
                }
              }

              if (next.progress >= 100) {
                releaseCrisisRoom(rooms, next, currentMinute);
                logs.push(`위기 해결: ${getCrisisLabel(next)} (${next.roomId}).`);
                return null;
              }

              if (currentMinute >= next.escalateAt) {
                if (next.type === "overheat" && next.severity >= 3) {
                  const fire = { ...createCrisisRecord({ roomId: next.roomId, type: "fire", severity: 1, currentMinute }), id: next.id };
                  const fireConfig = getCrisisConfig("fire");
                  rooms[next.roomId] = withRoomStatus(
                    {
                      ...rooms[next.roomId],
                      condition: clamp((rooms[next.roomId].condition ?? 0) - fireConfig.conditionHit, 0, 100),
                      load: clamp((rooms[next.roomId].load ?? 0) + fireConfig.loadHit, 0, 100),
                      activeCrisisId: fire.id,
                    },
                    currentMinute,
                  );
                  logs.push(`위기 승격: ${next.roomId} 과열이 화재로 번졌습니다.`);
                  return fire;
                }

                const nextSeverity = clamp(next.severity + 1, 1, 3);
                next = { ...next, severity: nextSeverity, escalateAt: currentMinute + config.escalateMinutes, progress: Math.max(0, next.progress - 8) };
                logs.push(`위기 악화: ${getCrisisLabel(next)} (${next.roomId}) severity ${next.severity}.`);

                if ((next.type === "fire" || next.type === "intruder") && next.severity >= 3 && Math.random() < (config.spreadChance ?? 0)) {
                  const targetRoomId = pickAdjacentRoom(next.roomId, blockedRoomIds);
                  if (targetRoomId) {
                    const spreadType = next.type === "intruder" ? "intruder" : "fire";
                    const spread = addCrisisToDraft({ rooms, activeCrises: newCrises, roomId: targetRoomId, type: spreadType, severity: 1, currentMinute });
                    if (spread) {
                      blockedRoomIds.add(targetRoomId);
                      logs.push(`위기 전파: ${getCrisisLabel(spread)} (${targetRoomId}).`);
                    }
                  }
                }
              }

              if (next.severity >= 3 && (rooms[next.roomId]?.condition ?? 100) <= 5) {
                rooms[next.roomId] = withRoomStatus({ ...rooms[next.roomId], condition: 0, activeCrisisId: next.id }, currentMinute);
              }

              return next;
            })
            .filter(Boolean);

          activeCrises = [...activeCrises, ...newCrises];
          return { rooms, activeCrises };
        });

        return { effects, logs };
      },
      getActiveCrises: () => get().activeCrises ?? [],
    }),
    {
      name: "space-manager-ship-interior",
      merge: (persistedState, currentState) => {
        const rooms = mergeRooms(persistedState?.rooms);
        const activeCrises = mergeCrises(persistedState?.activeCrises);
        const activeIds = new Set(activeCrises.map((crisis) => crisis.id));
        ROOM_IDS.forEach((roomId) => {
          if (rooms[roomId]?.activeCrisisId && !activeIds.has(rooms[roomId].activeCrisisId)) {
            rooms[roomId] = withRoomStatus({ ...rooms[roomId], activeCrisisId: null });
          }
        });
        return {
          ...currentState,
          ...(persistedState ?? {}),
          rooms,
          activeCrises,
        };
      },
    },
  ),
);

export { deriveRoomStatus };
