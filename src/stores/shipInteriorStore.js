import { create } from "zustand";
import { persist } from "zustand/middleware";
import { ROOM_IDS } from "../data/shipRooms";
import { ROOM_MODULE_CATALOG, ROOM_TIER_CONFIG, calculateRoomModifiers, canInstallRoomModule, getRoomModule } from "../data/roomModules";
import { canWorkWithInjury } from "../systems/injurySystem";
import {
  CRISIS_CATALOG,
  createCrisisRecord,
  crisisResponseRatePerMinute,
  getCrisisConfig,
  getCrisisLabel,
  pickAdjacentRoom,
} from "../systems/crisisSystem";
import { applyRoomTick, createInitialRoomState, deriveRoomStatus } from "../systems/roomJobs";
import { DUST, WEAR } from "../data/constants";
import { useInventoryStore } from "./inventoryStore";
import { passthroughMigrate, PERSIST_VERSION } from "./persistVersion";

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeRoom(room) {
  const validModules = Array.isArray(room?.modules) ? room.modules.filter((id) => ROOM_MODULE_CATALOG.some((module) => module.id === id)) : [];
  const draft = { ...room, tier: clamp(room?.tier ?? 1, 1, 3), modules: validModules };
  const slots = Math.max(1, Math.round(calculateRoomModifiers(draft).slots ?? 1));
  const assignedMemberIds = (Array.isArray(room?.assignedMemberIds) ? room.assignedMemberIds : room?.assignedMemberId ? [room.assignedMemberId] : []).filter(Boolean).slice(0, slots);
  return { ...draft, assignedMemberIds, assignedMemberId: assignedMemberIds[0] ?? null };
}

function withRoomStatus(room, currentMinute) {
  const normalized = normalizeRoom(room);
  const next = { ...normalized, status: deriveRoomStatus(normalized) };
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
      assignedCrewIds: crisis.assignedCrewIds ?? (crisis.assignedCrewId ? [crisis.assignedCrewId] : []),
      createdAtMinutes: crisis.createdAtMinutes ?? 0,
    }));
}

function addCrisisToDraft({ rooms, activeCrises, roomId, type, severity = 1, currentMinute = 0, id = null }) {
  const room = rooms[roomId];
  if (!room || room.activeCrisisId) return null;
  const modifiers = calculateRoomModifiers(room);
  const resist = clamp(modifiers.crisisResist ?? 0, 0, 0.75);
  const crisis = createCrisisRecord({ id, roomId, type, severity, currentMinute });
  const config = getCrisisConfig(crisis.type);
  const conditionHit = (config.conditionHit + (crisis.severity - 1) * 7) * (1 - resist);
  const loadHit = (config.loadHit + (crisis.severity - 1) * 4) * (1 - resist * 0.6);
  const nextRoom = withRoomStatus({ ...room, condition: clamp((room.condition ?? 100) - conditionHit, 0, 100), load: clamp((room.load ?? 0) + loadHit, 0, 100), jobId: null, assignedMemberId: null, assignedMemberIds: [], progress: 0, activeCrisisId: crisis.id }, currentMinute);
  rooms[roomId] = nextRoom;
  activeCrises.push(crisis);
  return crisis;
}

function releaseCrisisRoom(rooms, crisis, currentMinute) {
  const room = rooms[crisis.roomId];
  if (!room) return;
  rooms[crisis.roomId] = withRoomStatus({ ...room, condition: clamp((room.condition ?? 0) + 10 + crisis.severity * 2, 0, 100), load: clamp((room.load ?? 0) - 10, 0, 100), activeCrisisId: null, jobId: null, assignedMemberId: null, assignedMemberIds: [], progress: 0 }, currentMinute);
}

function maybeInjureResponder({ effects, crisis, responder, chanceMultiplier = 1, room }) {
  const config = getCrisisConfig(crisis.type);
  if (!responder || !config.injuryChance) return;
  const resist = calculateRoomModifiers(room).crisisResist ?? 0;
  const chance = config.injuryChance * chanceMultiplier * crisis.severity * (1 - resist);
  if (Math.random() < chance) effects.push({ type: "crewCasualty", memberId: responder.id, injury: crisis.severity >= 3 ? "중상" : "경상", morale: -1 });
}

function isCrewUsable(member) {
  if (!member?.alive) return false;
  if (!canWorkWithInjury(member.injury)) return false;
  if ((member.fatigue ?? 0) >= 85) return false;
  return true;
}

function clearOverflowAssignments(room) {
  return normalizeRoom(room);
}

function normalizeCrisisActivityList(activity) {
  if (!activity) return [];
  if (Array.isArray(activity)) return activity.filter(Boolean);
  return [activity];
}

export const useShipInteriorStore = create(
  persist(
    (set, get) => ({
      rooms: createInitialRoomState(),
      activeCrises: [],
      incidentReceipts: {},
      getRoomModifiers: (roomId) => calculateRoomModifiers(get().rooms[roomId]),
      upgradeRoomTier: (roomId) => {
        let result = { ok: false, reason: "unknown" };
        set((state) => {
          const room = state.rooms[roomId];
          if (!room) return state;
          const tier = room.tier ?? 1;
          if (tier >= 3) {
            result = { ok: false, reason: "maxTier" };
            return state;
          }
          const nextTier = tier + 1;
          const cost = ROOM_TIER_CONFIG[nextTier]?.upgradeCost ?? 0;
          result = { ok: true, cost, nextTier };
          return { rooms: { ...state.rooms, [roomId]: withRoomStatus({ ...room, tier: nextTier }) } };
        });
        return result;
      },
      installModule: (roomId, moduleId) => {
        let result = { ok: false, reason: "unknown" };
        set((state) => {
          const room = state.rooms[roomId];
          const module = getRoomModule(moduleId);
          if (!room || !module) {
            result = { ok: false, reason: "notFound" };
            return state;
          }
          if (!canInstallRoomModule(room, module)) {
            result = { ok: false, reason: "blocked" };
            return state;
          }
          result = { ok: true, cost: module.cost, module };
          return { rooms: { ...state.rooms, [roomId]: withRoomStatus(clearOverflowAssignments({ ...room, modules: [...(room.modules ?? []), moduleId] })) } };
        });
        return result;
      },
      uninstallModule: (roomId, moduleId) => {
        let result = { ok: false, reason: "unknown" };
        set((state) => {
          const room = state.rooms[roomId];
          if (!room || !(room.modules ?? []).includes(moduleId)) {
            result = { ok: false, reason: "notInstalled" };
            return state;
          }
          const nextRoom = clearOverflowAssignments({ ...room, modules: room.modules.filter((id) => id !== moduleId) });
          result = { ok: true };
          return { rooms: { ...state.rooms, [roomId]: withRoomStatus(nextRoom) } };
        });
        return result;
      },
      tickRooms: ({ currentMinute, deltaMinutes, roomActivities = {}, roleCoverage = null, usageByRoom = {}, relationships = {} }) => {
        const { nextRooms, completedJobs, logs } = applyRoomTick({ rooms: get().rooms, roomActivities, deltaMinutes, currentMinute, roleCoverage, usageByRoom, relationships });
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
      applyIncidentPhysicalEffects: (claimId, { roomEffects = [], crisis = null, currentMinute = 0 } = {}) => {
        if (!claimId) return { ok: false, repeated: false, crisis: null };
        if (get().incidentReceipts?.[claimId]) return { ok: true, repeated: true, crisis: crisis ? (get().activeCrises ?? []).find((entry) => entry.id === crisis.id) ?? null : null };
        let spawned = null;
        set((state) => {
          const rooms = { ...state.rooms };
          const activeCrises = [...(state.activeCrises ?? [])];
          roomEffects.forEach((effect) => {
            const room = rooms[effect.roomId];
            if (!room) return;
            rooms[effect.roomId] = withRoomStatus({ ...room, condition: clamp((room.condition ?? 100) + (effect.condition ?? 0), 0, 100), load: clamp((room.load ?? 0) + (effect.load ?? 0), 0, 100) }, currentMinute);
          });
          if (crisis) spawned = addCrisisToDraft({ rooms, activeCrises, roomId: crisis.roomId, type: crisis.type, severity: crisis.severity, currentMinute, id: crisis.id });
          return { rooms, activeCrises, incidentReceipts: { ...(state.incidentReceipts ?? {}), [claimId]: true } };
        });
        return { ok: true, repeated: false, crisis: spawned };
      },
      assignCrisisResponder: (crisisId, crewId) => set((state) => ({ activeCrises: (state.activeCrises ?? []).map((crisis) => (crisis.id === crisisId ? { ...crisis, assignedCrewId: crewId, assignedCrewIds: crewId ? [crewId] : [] } : crisis)) })),
      progressCrisis: (crisisId, amount = 0, currentMinute = 0) => {
        let resolved = null;
        set((state) => {
          const rooms = { ...state.rooms };
          const activeCrises = [];
          (state.activeCrises ?? []).forEach((crisis) => {
            if (crisis.id !== crisisId) activeCrises.push(crisis);
            else {
              const next = { ...crisis, progress: clamp((crisis.progress ?? 0) + amount, 0, 100) };
              if (next.progress >= 100) {
                resolved = next;
                releaseCrisisRoom(rooms, next, currentMinute);
              } else activeCrises.push(next);
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
            } else activeCrises.push(crisis);
          });
          return { rooms, activeCrises };
        });
        return resolved;
      },
      // tickCrises: returns { effects, logs, crisisEvents }. `crisisEvents`
      // (Phase 20-B) is a non-destructive addition on top of the pre-existing
      // effects/logs contract — it exposes the same spawn/resolve/escalate
      // moments the `logs` strings already narrate, but as structured
      // { kind, crisis, roomId } records so gameClock.js's processCrises can
      // build reportSystem.js's buildCrisisReport() from real data instead of
      // parsing a log string (see reportSystem.js's file-header "no log
      // parsing" rule). `kind` is one of "spawned" | "resolved" | "escalated"
      // (the last covers severity bump, overheat->fire promotion, and
      // fire/intruder spread alike — gameClock.js's 20-B wiring only reports
      // "spawned"/"resolved", intentionally skipping "escalated" to avoid
      // over-reporting; see docs/PHASE_20_REPORT_SYSTEM.md).
      tickCrises: ({ currentMinute = 0, deltaMinutes = 0, crisisActivities = {}, crew = [], roleCoverage = null }) => {
        if (deltaMinutes <= 0) return { effects: [], logs: [], crisisEvents: [] };
        const effects = [];
        const logs = [];
        const crisisEvents = [];
        const crewById = new Map(crew.map((member) => [member.id, member]));
        const respondersByCrisisId = new Map(Object.entries(crisisActivities).map(([crisisId, activity]) => [crisisId, normalizeCrisisActivityList(activity).map((entry) => entry.memberId).filter(Boolean)]));
        const missingRoles = new Set(roleCoverage?.missingRoles ?? []);
        set((state) => {
          const rooms = { ...state.rooms };
          let activeCrises = [...(state.activeCrises ?? [])];
          // Ambient crisis creation belongs to the deterministic incident director.
          // Existing or externally spawned crises still progress below.
          const newCrises = [];
          const blockedRoomIds = new Set(activeCrises.map((crisis) => crisis.roomId));
          activeCrises = activeCrises.map((crisis) => {
            const config = getCrisisConfig(crisis.type);
            const room = rooms[crisis.roomId];
            if (!room) return null;
            const modifiers = calculateRoomModifiers(room);
            const responderIds = respondersByCrisisId.get(crisis.id) ?? [];
            const responders = responderIds.map((id) => crewById.get(id)).filter(isCrewUsable);
            let next = { ...crisis, assignedCrewId: responders[0]?.id ?? null, assignedCrewIds: responders.map((member) => member.id) };
            if (responders.length > 0) {
              const gained = responders.reduce((sum, responder) => sum + crisisResponseRatePerMinute(responder, next) * deltaMinutes * (1 + (modifiers.crisisResist ?? 0)), 0);
              next = { ...next, progress: clamp((next.progress ?? 0) + gained, 0, 100) };
              responders.forEach((responder) => maybeInjureResponder({ effects, crisis: next, responder, chanceMultiplier: deltaMinutes / 120 / Math.max(1, responders.length), room }));
            } else {
              const hours = deltaMinutes / 60;
              const rolePenalty = missingRoles.has("기관실") ? 1.35 : 1;
              const resistMul = 1 - (modifiers.crisisResist ?? 0);
              const conditionLoss = config.unattendedConditionLossPerHour * hours * next.severity * rolePenalty * resistMul;
              rooms[next.roomId] = withRoomStatus({ ...rooms[next.roomId], condition: clamp((rooms[next.roomId].condition ?? 0) - conditionLoss, 0, 100), load: clamp((rooms[next.roomId].load ?? 0) + hours * next.severity * rolePenalty * resistMul, 0, 100), jobId: null, assignedMemberId: null, assignedMemberIds: [], progress: 0, activeCrisisId: next.id }, currentMinute);
              if (next.type === "power_loss" && next.severity >= 2) ROOM_IDS.forEach((roomId) => { if (roomId !== next.roomId && rooms[roomId]) rooms[roomId] = withRoomStatus({ ...rooms[roomId], load: clamp((rooms[roomId].load ?? 0) + hours * 0.75 * next.severity * resistMul, 0, 100) }, currentMinute); });
              if (next.type === "hull_breach") effects.push({ type: "resourceDelta", resources: { oxygen: -(config.oxygenLossPerHour ?? 0) * hours * next.severity * resistMul } });
            }
            if (next.progress >= 100) {
              releaseCrisisRoom(rooms, next, currentMinute);
              const dustGain = Math.round(DUST.CRISIS_REWARD * next.severity);
              useInventoryStore.getState().addDust(dustGain);
              crisisEvents.push({ kind: "resolved", crisis: next, roomId: next.roomId, dustGain });
              logs.push(`위기 해결: ${getCrisisLabel(next)} (${next.roomId}) (+먼지 ${dustGain}).`);
              return null;
            }
            if (currentMinute >= next.escalateAt) {
              if (next.type === "overheat" && next.severity >= 3) {
                const fire = { ...createCrisisRecord({ roomId: next.roomId, type: "fire", severity: 1, currentMinute }), id: next.id };
                const fireConfig = getCrisisConfig("fire");
                const resistMul = 1 - (modifiers.crisisResist ?? 0);
                rooms[next.roomId] = withRoomStatus({ ...rooms[next.roomId], condition: clamp((rooms[next.roomId].condition ?? 0) - fireConfig.conditionHit * resistMul, 0, 100), load: clamp((rooms[next.roomId].load ?? 0) + fireConfig.loadHit * resistMul, 0, 100), activeCrisisId: fire.id }, currentMinute);
                crisisEvents.push({ kind: "escalated", crisis: fire, roomId: next.roomId });
                logs.push(`위기 승격: ${next.roomId} 과열이 화재로 번졌습니다.`);
                return fire;
              }
              next = { ...next, severity: clamp(next.severity + 1, 1, 3), escalateAt: currentMinute + config.escalateMinutes, progress: Math.max(0, next.progress - 8) };
              crisisEvents.push({ kind: "escalated", crisis: next, roomId: next.roomId });
              logs.push(`위기 악화: ${getCrisisLabel(next)} (${next.roomId}) severity ${next.severity}.`);
              if ((next.type === "fire" || next.type === "intruder") && next.severity >= 3 && Math.random() < (config.spreadChance ?? 0) * (1 - (modifiers.crisisResist ?? 0))) {
                const targetRoomId = pickAdjacentRoom(next.roomId, blockedRoomIds);
                if (targetRoomId) {
                  const spread = addCrisisToDraft({ rooms, activeCrises: newCrises, roomId: targetRoomId, type: next.type === "intruder" ? "intruder" : "fire", severity: 1, currentMinute });
                  if (spread) { blockedRoomIds.add(targetRoomId); crisisEvents.push({ kind: "escalated", crisis: spread, roomId: targetRoomId }); logs.push(`위기 전파: ${getCrisisLabel(spread)} (${targetRoomId}).`); }
                }
              }
            }
            if (next.severity >= 3 && (rooms[next.roomId]?.condition ?? 100) <= 5) rooms[next.roomId] = withRoomStatus({ ...rooms[next.roomId], condition: 0, activeCrisisId: next.id }, currentMinute);
            return next;
          }).filter(Boolean);
          activeCrises = [...activeCrises, ...newCrises];
          return { rooms, activeCrises };
        });
        return { effects, logs, crisisEvents };
      },
      getActiveCrises: () => get().activeCrises ?? [],
    }),
    {
      name: "space-manager-ship-interior",
      version: PERSIST_VERSION,
      migrate: passthroughMigrate,
      merge: (persistedState, currentState) => {
        const rooms = mergeRooms(persistedState?.rooms);
        const activeCrises = mergeCrises(persistedState?.activeCrises);
        const activeIds = new Set(activeCrises.map((crisis) => crisis.id));
        ROOM_IDS.forEach((roomId) => { if (rooms[roomId]?.activeCrisisId && !activeIds.has(rooms[roomId].activeCrisisId)) rooms[roomId] = withRoomStatus({ ...rooms[roomId], activeCrisisId: null }); });
        return { ...currentState, ...(persistedState ?? {}), rooms, activeCrises, incidentReceipts: persistedState?.incidentReceipts ?? {} };
      },
    },
  ),
);

export { deriveRoomStatus };
