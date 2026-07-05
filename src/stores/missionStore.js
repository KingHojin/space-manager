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
import { generateMissionEncounter, normalizeMissionEncounterRecord, resolveMissionEncounterOption } from "../systems/missionEncounterSystem";

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
      resolveMissionEncounter: ({ vesselId, optionId, currentMinute = 0 } = {}) => {
        if (!vesselId) return { ok: false, reason: "missingVesselId" };
        if (!optionId) return { ok: false, reason: "missingOptionId" };
        const encounter = get().pendingMissionEncountersByVesselId[vesselId];
        if (!encounter) return { ok: false, reason: "noPendingEncounter" };
        const result = resolveMissionEncounterOption(encounter, optionId, { currentMinute });
        if (!result.ok) return result;
        set((state) => {
          const nextPending = { ...state.pendingMissionEncountersByVesselId };
          delete nextPending[vesselId];
          return {
            pendingMissionEncountersByVesselId: nextPending,
            resolvedMissionEncounters: [result.encounter, ...(state.resolvedMissionEncounters ?? [])].slice(0, 40),
            missionLog: [`임무 조우 해결: ${result.encounter.title} / ${result.option.label}`, ...(state.missionLog ?? [])].slice(0, 12),
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
        if (state.pendingMissionEncountersByVesselId[vesselId]) return { ok: false, reason: "pendingMissionEncounter" };
        const active = state.activeByVesselId[vesselId];
        if (!active || active.status !== MISSION_STATUS.active) return { ok: false, reason: "noActiveMission" };
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
      failMission: ({ vesselId, currentMinute = 0, reason = "unknown" } = {}) => {
        if (!vesselId) return { ok: false, reason: "missingVesselId" };
        const active = get().activeByVesselId[vesselId];
        if (!active || active.status !== MISSION_STATUS.active) return { ok: false, reason: "noActiveMission" };
        const failed = failMissionRecord(active, { currentMinute, reason });
        set((state) => {
          const nextActive = { ...state.activeByVesselId };
          const nextPending = { ...state.pendingMissionEncountersByVesselId };
          delete nextActive[vesselId];
          delete nextPending[vesselId];
          return {
            activeByVesselId: nextActive,
            pendingMissionEncountersByVesselId: nextPending,
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
        const abandoned = { ...active, status: MISSION_STATUS.abandoned, abandonedAt: currentMinute };
        set((state) => {
          const nextActive = { ...state.activeByVesselId };
          const nextPending = { ...state.pendingMissionEncountersByVesselId };
          delete nextActive[vesselId];
          delete nextPending[vesselId];
          return {
            activeByVesselId: nextActive,
            pendingMissionEncountersByVesselId: nextPending,
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
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...(persistedState ?? {}),
        boardsByScopeId: normalizeBoards(persistedState?.boardsByScopeId),
        activeByVesselId: Object.fromEntries(
          Object.entries(persistedState?.activeByVesselId ?? {})
            .map(([vesselId, mission]) => [vesselId, normalizeMissionRecord(mission)])
            .filter(([, mission]) => Boolean(mission)),
        ),
        pendingMissionEncountersByVesselId: normalizeEncounterMap(persistedState?.pendingMissionEncountersByVesselId),
        resolvedMissionEncounters: normalizeEncounterList(persistedState?.resolvedMissionEncounters).slice(0, 40),
        completedMissions: normalizeList(persistedState?.completedMissions).slice(0, 30),
        missionLog: persistedState?.missionLog ?? currentState.missionLog,
      }),
    },
  ),
);
