import { create } from "zustand";
import { persist } from "zustand/middleware";
import { MISSION_STATUS } from "../data/missions";
import {
  BOARD_REFRESH_MINUTES,
  DEFAULT_BOARD_SIZE,
  acceptMissionRecord,
  canAcceptMission,
  completeMissionRecord,
  failMissionRecord,
  generateMissionBoard,
  normalizeMissionRecord,
} from "../systems/missionSystem";
import { generateMissionEncounter, normalizeMissionEncounterRecord, prepareMissionEncounterChoice } from "../systems/missionEncounterSystem";
import { cancelUnknownEventRuntimes, normalizeEventRuntime, normalizeEventRuntimeMap, normalizePendingStoryMap, normalizeStoryFlags, normalizeStoryHistory, prepareStoryEncounterChoice, resolveStoryEncounterChoice, STORY_HISTORY_LIMIT } from "../systems/eventChainSystem";
import { EVENT_CHAINS, getEventChain } from "../data/eventChains";
import { useCombatStore } from "./combatStore";
import { useExplorationStore } from "./explorationStore";
import { useNavStore } from "./navStore";
import { passthroughMigrate, PERSIST_VERSION } from "./persistVersion";

function normalizeList(list = []) {
  return list.map(normalizeMissionRecord).filter(Boolean);
}

function normalizeBoards(boardsByScopeId = {}) {
  return Object.fromEntries(
    Object.entries(boardsByScopeId).map(([scopeId, board]) => [
      scopeId,
      {
        scopeId,
        generatedAt: board?.generatedAt ?? 0,
        expiresAt: board?.expiresAt ?? BOARD_REFRESH_MINUTES,
        missions: normalizeList(board?.missions),
      },
    ]),
  );
}

function flattenActive(activeByVesselId = {}) {
  return Object.values(activeByVesselId).filter(Boolean).map(normalizeMissionRecord).filter(Boolean);
}

function normalizeEncounterMap(encountersByVesselId = {}) {
  return Object.fromEntries(
    Object.entries(encountersByVesselId)
      .map(([vesselId, encounter]) => [vesselId, normalizeMissionEncounterRecord(encounter)])
      .filter(([, encounter]) => Boolean(encounter)),
  );
}

function normalizeEncounterMapForActive(encountersByVesselId = {}, activeByVesselId = {}) {
  return Object.fromEntries(Object.entries(normalizeEncounterMap(encountersByVesselId)).filter(([vesselId, encounter]) => {
    const active = activeByVesselId[vesselId];
    return active?.status === MISSION_STATUS.active && encounter.missionId === active.id && !encounter.resolvedAt;
  }));
}

function normalizeEncounterList(list = []) {
  return list.map(normalizeMissionEncounterRecord).filter(Boolean);
}

function removeMissionFromBoards(boardsByScopeId, missionId) {
  return Object.fromEntries(
    Object.entries(boardsByScopeId).map(([scopeId, board]) => [
      scopeId,
      { ...board, missions: (board.missions ?? []).filter((mission) => mission.id !== missionId) },
    ]),
  );
}

export const useMissionStore = create(
  persist(
    (set, get) => ({
      boardsByScopeId: {},
      activeByVesselId: {},
      pendingMissionEncountersByVesselId: {},
      resolvedMissionEncounters: [],
      storyFlags: {},
      eventRuntimesById: {},
      pendingStoryEncounterByVesselId: {},
      storyHistory: [],
      registerEventRuntime: (runtime) => {
        const normalized = normalizeEventRuntimeMap(runtime?.id ? { [runtime.id]: runtime } : {});
        const entry = runtime?.id ? normalized[runtime.id] : null;
        const chain = getEventChain(entry?.chainId);
        if (!entry || !chain?.stages?.some((stage) => stage.id === entry.stageId) || get().eventRuntimesById[entry.id]) return { ok: false, reason: entry && get().eventRuntimesById[entry.id] ? "duplicate" : "invalidRuntime" };
        set((state) => ({ eventRuntimesById: { ...state.eventRuntimesById, [entry.id]: entry } }));
        return { ok: true, runtime: entry };
      },
      setStoryFlag: ({ flagId, value = true, currentMinute = 0, sourceRuntimeId = null } = {}) => {
        if (!flagId) return { ok: false, reason: "missingFlagId" };
        set((state) => ({ storyFlags: { ...state.storyFlags, [flagId]: { value, setAtMinute: currentMinute, sourceRuntimeId } } }));
        return { ok: true };
      },
      resolveStoryEncounter: ({ vesselId, runtimeId, stageId, claimId, optionId, currentMinute = 0 } = {}) => {
        const encounter = get().pendingStoryEncounterByVesselId[vesselId];
        const runtime = get().eventRuntimesById[encounter?.runtimeId];
        const result = resolveStoryEncounterChoice({ runtime, encounter, chain: getEventChain(runtime?.chainId), runtimeId, stageId, claimId, optionId, currentMinute });
        if (!result.ok) return result;
        set((state) => {
          const pending = { ...state.pendingStoryEncounterByVesselId }; delete pending[vesselId];
          return { pendingStoryEncounterByVesselId: pending, eventRuntimesById: { ...state.eventRuntimesById, [runtimeId]: result.runtime }, storyFlags: { ...state.storyFlags, ...result.flagUpdates }, storyHistory: [result.historyEntry, ...state.storyHistory].slice(0, STORY_HISTORY_LIMIT) };
        });
        return result;
      },
      prepareStoryEncounter: ({ vesselId, runtimeId, stageId, claimId, optionId, currentMinute = 0 } = {}) => {
        const encounter = get().pendingStoryEncounterByVesselId[vesselId];
        const runtime = get().eventRuntimesById[encounter?.runtimeId];
        if (runtime?.pendingClaim) {
          if (runtime.pendingClaim.claimId === claimId && runtime.pendingClaim.optionId === optionId) return { ok: true, repeated: true, runtime, pendingClaim: runtime.pendingClaim };
          return { ok: false, reason: "staleSettlement" };
        }
        const result = prepareStoryEncounterChoice({ runtime, encounter, chain: getEventChain(runtime?.chainId), runtimeId, stageId, claimId, optionId, currentMinute });
        if (!result.ok) {
          if (result.safeCancelled && runtime) {
            set((state) => {
              const pending = { ...state.pendingStoryEncounterByVesselId }; delete pending[vesselId];
              return { pendingStoryEncounterByVesselId: pending, eventRuntimesById: { ...state.eventRuntimesById, [runtime.id]: normalizeEventRuntime({ ...runtime, status: "cancelled", pendingClaim: null, updatedAt: currentMinute }) } };
            });
          }
          return result;
        }
        set((state) => {
          const pending = { ...state.pendingStoryEncounterByVesselId }; delete pending[vesselId];
          return { pendingStoryEncounterByVesselId: pending, eventRuntimesById: { ...state.eventRuntimesById, [runtimeId]: result.runtime } };
        });
        return result;
      },
      completedMissions: [],
      missionLog: [],
      refreshBoard: ({ scopeId, sector = null, currentNodeId = null, currentMinute = 0, seed = null, count = DEFAULT_BOARD_SIZE, force = false } = {}) => {
        if (!scopeId) return { ok: false, reason: "missingScopeId" };
        const state = get();
        const existing = state.boardsByScopeId[scopeId];
        if (!force && existing && currentMinute < (existing.expiresAt ?? 0)) return { ok: true, board: existing, refreshed: false };
        const activeIds = new Set(flattenActive(state.activeByVesselId).map((mission) => mission.id));
        const completedIds = new Set((state.completedMissions ?? []).map((mission) => mission.id));
        const missions = generateMissionBoard({
          sector,
          currentNodeId,
          currentMinute,
          seed: seed ?? `${scopeId}:${currentMinute}`,
          count,
          excludeMissionIds: [...activeIds, ...completedIds],
        });
        const board = { scopeId, generatedAt: currentMinute, expiresAt: currentMinute + BOARD_REFRESH_MINUTES, missions };
        set((nextState) => ({
          boardsByScopeId: { ...nextState.boardsByScopeId, [scopeId]: board },
          missionLog: [`임무 게시판 갱신: ${missions.length}건`, ...(nextState.missionLog ?? [])].slice(0, 12),
        }));
        return { ok: true, board, refreshed: true };
      },
      acceptMission: ({ scopeId, missionId, vesselId, currentMinute = 0, availableReputation = 0 } = {}) => {
        if (!scopeId) return { ok: false, reason: "missingScopeId" };
        if (!missionId) return { ok: false, reason: "missingMissionId" };
        if (!vesselId) return { ok: false, reason: "missingVesselId" };
        const state = get();
        const board = state.boardsByScopeId[scopeId];
        const mission = board?.missions?.find((entry) => entry.id === missionId);
        const activeMissions = flattenActive(state.activeByVesselId);
        const allowed = canAcceptMission({ mission, activeMissions, vesselId, availableReputation });
        if (!allowed.ok) return allowed;
        const activeMission = acceptMissionRecord(allowed.mission, { vesselId, currentMinute });
        set((nextState) => ({
          boardsByScopeId: removeMissionFromBoards(nextState.boardsByScopeId, missionId),
          activeByVesselId: { ...nextState.activeByVesselId, [vesselId]: activeMission },
          missionLog: [`임무 수락: ${activeMission.title}`, ...(nextState.missionLog ?? [])].slice(0, 12),
        }));
        return { ok: true, mission: activeMission };
      },
      generateMissionEncounterForVessel: ({ vesselId, timing = "objective", currentMinute = 0, seed = null, force = false } = {}) => {
        if (!vesselId) return { ok: false, reason: "missingVesselId" };
        const state = get();
        const active = state.activeByVesselId[vesselId];
        if (!active || active.status !== MISSION_STATUS.active) return { ok: false, reason: "noActiveMission" };
        const nav = useNavStore.getState();
        if (nav.currentNodeId !== active.destinationNodeId) return { ok: false, reason: "notAtDestination" };
        if (nav.travel) return { ok: false, reason: "travel" };
        if (nav.pendingEncounter) return { ok: false, reason: "pendingNavigationEncounter" };
        if (nav.driftState) return { ok: false, reason: "drift" };
        const existing = state.pendingMissionEncountersByVesselId[vesselId];
        if (existing && !force) return { ok: true, encounter: existing, generated: false };
        const excluded = (state.resolvedMissionEncounters ?? []).filter((encounter) => encounter.missionId === active.id).map((encounter) => encounter.templateId);
        const encounter = generateMissionEncounter({ mission: active, timing, seed: seed ?? `${vesselId}:${active.id}`, currentMinute, excludeTemplateIds: excluded });
        if (!encounter) return { ok: false, reason: "noEncounter" };
        set((nextState) => ({
          pendingMissionEncountersByVesselId: { ...nextState.pendingMissionEncountersByVesselId, [vesselId]: encounter },
          missionLog: [`임무 조우 발생: ${encounter.title}`, ...(nextState.missionLog ?? [])].slice(0, 12),
        }));
        return { ok: true, encounter, generated: true };
      },
      prepareMissionEncounter: ({ vesselId, runtimeId, stageId, claimId = null, optionId, currentMinute = 0, livingCrewIds = [] } = {}) => {
        if (!vesselId) return { ok: false, reason: "missingVesselId" };
        if (!optionId) return { ok: false, reason: "missingOptionId" };
        const encounter = get().pendingMissionEncountersByVesselId[vesselId];
        if (!encounter) return { ok: false, reason: "noPendingEncounter" };
        if (runtimeId !== encounter.id || stageId !== encounter.timing) return { ok: false, reason: "staleEncounter" };
        if (claimId && (encounter.settlement?.claimId ?? encounter.claimId) !== claimId) return { ok: false, reason: "staleClaim" };
        if (encounter.settlement && encounter.settlement.optionId !== optionId) return { ok: false, reason: "staleOption" };
        const result = prepareMissionEncounterChoice(encounter, optionId, { currentMinute, livingCrewIds });
        if (!result.ok) return result;
        const nextEncounter = { ...encounter, settlement: result.prepared };
        set((state) => ({ pendingMissionEncountersByVesselId: { ...state.pendingMissionEncountersByVesselId, [vesselId]: nextEncounter } }));
        return { ...result, encounter: nextEncounter };
      },
      markMissionEncounterReceipt: ({ vesselId, claimId, receiver } = {}) => {
        const encounter = get().pendingMissionEncountersByVesselId[vesselId];
        if (!encounter?.settlement || encounter.settlement.claimId !== claimId || !receiver) return false;
        if (encounter.settlement.receipts?.[receiver]) return false;
        set((state) => ({ pendingMissionEncountersByVesselId: { ...state.pendingMissionEncountersByVesselId, [vesselId]: { ...encounter, settlement: { ...encounter.settlement, receipts: { ...(encounter.settlement.receipts ?? {}), [receiver]: true } } } } }));
        return true;
      },
      setMissionEncounterSettlementStatus: ({ vesselId, claimId, status, combatResult = undefined } = {}) => {
        const encounter = get().pendingMissionEncountersByVesselId[vesselId];
        if (!encounter?.settlement || encounter.settlement.claimId !== claimId) return false;
        set((state) => ({ pendingMissionEncountersByVesselId: { ...state.pendingMissionEncountersByVesselId, [vesselId]: { ...encounter, settlement: { ...encounter.settlement, status, ...(combatResult === undefined ? {} : { combatResult }) } } } }));
        return true;
      },
      finalizeMissionEncounter: ({ vesselId, runtimeId, stageId, claimId, optionId, currentMinute = 0 } = {}) => {
        const encounter = get().pendingMissionEncountersByVesselId[vesselId];
        const settlement = encounter?.settlement;
        if (!encounter || encounter.id !== runtimeId || encounter.timing !== stageId || settlement?.claimId !== claimId || settlement.optionId !== optionId) return { ok: false, reason: "staleSettlement" };
        if (settlement.status !== "settled") return { ok: false, reason: "notSettled" };
        const result = { ok: true, encounter: { ...encounter, resolvedAt: currentMinute, selectedOptionId: optionId, settlement: { ...settlement, status: "finalized" } }, option: encounter.options.find((entry) => entry.id === optionId), prepared: settlement };
        set((state) => {
          const nextPending = { ...state.pendingMissionEncountersByVesselId };
          delete nextPending[vesselId];
          return {
            pendingMissionEncountersByVesselId: nextPending,
            resolvedMissionEncounters: [result.encounter, ...(state.resolvedMissionEncounters ?? [])].slice(0, 40),
            missionLog: [`임무 조우 해결: ${result.encounter.title} / ${result.option?.label ?? optionId}`, ...(state.missionLog ?? [])].slice(0, 12),
          };
        });
        return result;
      },
      clearMissionEncounter: ({ vesselId } = {}) => {
        if (!vesselId) return { ok: false, reason: "missingVesselId" };
        const existing = get().pendingMissionEncountersByVesselId[vesselId];
        if (!existing) return { ok: false, reason: "noPendingEncounter" };
        set((state) => {
          const nextPending = { ...state.pendingMissionEncountersByVesselId };
          delete nextPending[vesselId];
          return { pendingMissionEncountersByVesselId: nextPending };
        });
        return { ok: true, encounter: existing };
      },
      completeMission: ({ vesselId, currentMinute = 0 } = {}) => {
        if (!vesselId) return { ok: false, reason: "missingVesselId" };
        const state = get();
        const active = state.activeByVesselId[vesselId];
        if (!active || active.status !== MISSION_STATUS.active) return { ok: false, reason: "noActiveMission" };
        const nav = useNavStore.getState();
        if (nav.currentNodeId !== active.destinationNodeId) return { ok: false, reason: "notAtDestination" };
        if (nav.travel) return { ok: false, reason: "travel" };
        if (nav.pendingEncounter) return { ok: false, reason: "pendingNavigationEncounter" };
        if (nav.driftState) return { ok: false, reason: "drift" };
        if (state.pendingMissionEncountersByVesselId[vesselId]) return { ok: false, reason: "pendingMissionEncounter" };
        if (state.pendingStoryEncounterByVesselId[vesselId]) return { ok: false, reason: "pendingStoryEncounter" };
        if (Object.values(state.eventRuntimesById).some((runtime) => runtime.vesselId === vesselId && runtime.missionId === active.id && !["completed", "failed", "cancelled"].includes(runtime.status))) return { ok: false, reason: "blockingStoryRuntime" };
        if (useCombatStore.getState().combatByVesselId?.[vesselId]?.status === "engaged" || useExplorationStore.getState().pendingCombatEncounter) return { ok: false, reason: "combat" };
        if (!(state.resolvedMissionEncounters ?? []).some((encounter) => encounter.missionId === active.id)) {
          const generated = get().generateMissionEncounterForVessel({ vesselId, timing: "arrival", currentMinute, seed: `${vesselId}:${active.id}:arrival` });
          if (generated.ok) return { ok: false, reason: "pendingMissionEncounter", encounter: generated.encounter };
        }
        const completed = completeMissionRecord(active, { currentMinute });
        set((state) => {
          const nextActive = { ...state.activeByVesselId };
          delete nextActive[vesselId];
          return {
            activeByVesselId: nextActive,
            completedMissions: [completed, ...(state.completedMissions ?? [])].slice(0, 30),
            missionLog: [`임무 완료 기록: ${completed.title}`, ...(state.missionLog ?? [])].slice(0, 12),
          };
        });
        return { ok: true, mission: completed, reward: completed.reward };
      },
      failMission: ({ vesselId, currentMinute = 0, reason = "unknown", expectedMissionId = null } = {}) => {
        if (!vesselId) return { ok: false, reason: "missingVesselId" };
        const active = get().activeByVesselId[vesselId];
        if (!active || active.status !== MISSION_STATUS.active) return { ok: false, reason: "noActiveMission" };
        if (expectedMissionId && active.id !== expectedMissionId) return { ok: false, reason: "staleMission" };
        const failed = failMissionRecord(active, { currentMinute, reason });
        set((state) => {
          const nextActive = { ...state.activeByVesselId };
          const nextPending = { ...state.pendingMissionEncountersByVesselId };
          const nextStoryPending = { ...state.pendingStoryEncounterByVesselId };
          const eventRuntimesById = Object.fromEntries(Object.entries(state.eventRuntimesById).map(([id, runtime]) => [id, runtime.vesselId === vesselId && runtime.missionId === active.id && !["completed", "failed", "cancelled"].includes(runtime.status) ? { ...runtime, status: "cancelled", updatedAt: currentMinute } : runtime]));
          delete nextActive[vesselId];
          delete nextPending[vesselId];
          const pendingStoryRuntime = state.eventRuntimesById[nextStoryPending[vesselId]?.runtimeId];
          if (pendingStoryRuntime?.missionId === active.id) delete nextStoryPending[vesselId];
          return {
            activeByVesselId: nextActive,
            pendingMissionEncountersByVesselId: nextPending,
            pendingStoryEncounterByVesselId: nextStoryPending,
            eventRuntimesById,
            completedMissions: [failed, ...(state.completedMissions ?? [])].slice(0, 30),
            missionLog: [`임무 실패 기록: ${failed.title}`, ...(state.missionLog ?? [])].slice(0, 12),
          };
        });
        return { ok: true, mission: failed };
      },
      abandonMission: ({ vesselId, currentMinute = 0 } = {}) => {
        if (!vesselId) return { ok: false, reason: "missingVesselId" };
        const active = get().activeByVesselId[vesselId];
        if (!active || active.status !== MISSION_STATUS.active) return { ok: false, reason: "noActiveMission" };
        const combat = useCombatStore.getState().combatByVesselId?.[vesselId];
        if (combat?.status === "engaged" && combat.source?.kind === "missionEncounter" && combat.source?.missionId === active.id) return { ok: false, reason: "combat" };
        const abandoned = { ...active, status: MISSION_STATUS.abandoned, abandonedAt: currentMinute };
        set((state) => {
          const nextActive = { ...state.activeByVesselId };
          const nextPending = { ...state.pendingMissionEncountersByVesselId };
          const nextStoryPending = { ...state.pendingStoryEncounterByVesselId };
          const eventRuntimesById = Object.fromEntries(Object.entries(state.eventRuntimesById).map(([id, runtime]) => [id, runtime.vesselId === vesselId && runtime.missionId === active.id && !["completed", "failed", "cancelled"].includes(runtime.status) ? { ...runtime, status: "cancelled", updatedAt: currentMinute } : runtime]));
          delete nextActive[vesselId];
          delete nextPending[vesselId];
          const pendingStoryRuntime = state.eventRuntimesById[nextStoryPending[vesselId]?.runtimeId];
          if (pendingStoryRuntime?.missionId === active.id) delete nextStoryPending[vesselId];
          return {
            activeByVesselId: nextActive,
            pendingMissionEncountersByVesselId: nextPending,
            pendingStoryEncounterByVesselId: nextStoryPending,
            eventRuntimesById,
            completedMissions: [abandoned, ...(state.completedMissions ?? [])].slice(0, 30),
            missionLog: [`임무 포기: ${abandoned.title}`, ...(state.missionLog ?? [])].slice(0, 12),
          };
        });
        return { ok: true, mission: abandoned };
      },
      getBoard: (scopeId) => get().boardsByScopeId[scopeId] ?? null,
      getActiveMission: (vesselId) => get().activeByVesselId[vesselId] ?? null,
      getPendingMissionEncounter: (vesselId) => get().pendingMissionEncountersByVesselId[vesselId] ?? null,
      getMissionSummary: () => {
        const state = get();
        const active = flattenActive(state.activeByVesselId);
        const offered = Object.values(state.boardsByScopeId).reduce((sum, board) => sum + (board.missions?.length ?? 0), 0);
        return {
          offered,
          active: active.length,
          pendingEncounters: Object.keys(state.pendingMissionEncountersByVesselId ?? {}).length,
          completed: (state.completedMissions ?? []).filter((mission) => mission.status === MISSION_STATUS.completed).length,
        };
      },
    }),
    {
      name: "space-manager-missions",
      version: PERSIST_VERSION,
      migrate: passthroughMigrate,
      merge: (persistedState, currentState) => {
        const activeByVesselId = Object.fromEntries(
          Object.entries(persistedState?.activeByVesselId ?? {})
            .map(([vesselId, mission]) => [vesselId, normalizeMissionRecord(mission)])
            .filter(([, mission]) => Boolean(mission)),
        );
        const knownRuntimes = cancelUnknownEventRuntimes(persistedState?.eventRuntimesById, EVENT_CHAINS.map((chain) => chain.id));
        const eventRuntimesById = Object.fromEntries(Object.entries(knownRuntimes).map(([id, runtime]) => {
          const chain = getEventChain(runtime.chainId);
          return [id, chain?.stages?.some((stage) => stage.id === runtime.stageId) ? runtime : { ...runtime, status: "cancelled", pendingClaim: null }];
        }));
        return ({
        ...currentState,
        ...(persistedState ?? {}),
        boardsByScopeId: normalizeBoards(persistedState?.boardsByScopeId),
        activeByVesselId,
        pendingMissionEncountersByVesselId: normalizeEncounterMapForActive(persistedState?.pendingMissionEncountersByVesselId, activeByVesselId),
        resolvedMissionEncounters: normalizeEncounterList(persistedState?.resolvedMissionEncounters).slice(0, 40),
        storyFlags: normalizeStoryFlags(persistedState?.storyFlags),
        eventRuntimesById,
        pendingStoryEncounterByVesselId: normalizePendingStoryMap(persistedState?.pendingStoryEncounterByVesselId, eventRuntimesById),
        storyHistory: normalizeStoryHistory(persistedState?.storyHistory).slice(0, STORY_HISTORY_LIMIT),
        completedMissions: normalizeList(persistedState?.completedMissions).slice(0, 30),
        missionLog: persistedState?.missionLog ?? currentState.missionLog,
      }); },
    },
  ),
);
