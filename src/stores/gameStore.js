import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEV_FLAGS, GAME_TIME, RESOURCES } from "../data/constants";
import { getActiveModifiers } from "../systems/cardEffects";
import { useInventoryStore } from "./inventoryStore";
import { passthroughMigrate, PERSIST_VERSION } from "./persistVersion";

const PERCENT_RESOURCES = new Set(["fuel", "oxygen", "hull"]);
const LOW_RESOURCE_WARNING_COOLDOWN_MINUTES = 60;
const LOCK_FLAG_BY_RESOURCE = {
  fuel: "LOCK_FUEL",
  oxygen: "LOCK_OXYGEN",
  hull: "LOCK_HULL",
};

function isResourceLocked(key) {
  if (!PERCENT_RESOURCES.has(key)) return false;
  return Boolean(DEV_FLAGS.LOCK_PERCENT_RESOURCES || DEV_FLAGS[LOCK_FLAG_BY_RESOURCE[key]]);
}

function clampResource(key, value) {
  if (key === "credits") return Math.max(0, Math.round(value));
  if (PERCENT_RESOURCES.has(key)) return isResourceLocked(key) ? 100 : Math.min(100, Math.max(0, value));
  return value;
}

function normalizeResources(resources = {}) {
  return {
    credits: clampResource("credits", resources.credits ?? RESOURCES.START_CREDITS),
    fuel: clampResource("fuel", resources.fuel ?? RESOURCES.START_FUEL),
    oxygen: clampResource("oxygen", resources.oxygen ?? RESOURCES.START_OXYGEN),
    hull: clampResource("hull", resources.hull ?? RESOURCES.START_HULL),
  };
}

export function mergePersistedGameState(persistedState, currentState) {
  return {
    ...currentState,
    ...(persistedState ?? {}),
    resources: normalizeResources(persistedState?.resources ?? currentState.resources),
    gameOver: persistedState?.gameOver ?? null,
    lastLowResourceWarningAt: persistedState?.lastLowResourceWarningAt ?? null,
    requisitionReceipts: persistedState?.requisitionReceipts ?? {},
    encounterReceipts: persistedState?.encounterReceipts ?? {},
    incidentReceipts: persistedState?.incidentReceipts ?? {},
  };
}

function hasLowConsumableResource(resources) {
  return (
    (!isResourceLocked("fuel") && resources.fuel <= RESOURCES.LOW_RESOURCE_WARNING) ||
    (!isResourceLocked("oxygen") && resources.oxygen <= RESOURCES.LOW_RESOURCE_WARNING)
  );
}

function canEmitLowResourceWarning(state) {
  if (!hasLowConsumableResource(state.resources)) return false;
  if (state.lastLowResourceWarningAt === null || state.lastLowResourceWarningAt === undefined) return true;
  return state.currentMinute - state.lastLowResourceWarningAt >= LOW_RESOURCE_WARNING_COOLDOWN_MINUTES;
}

export const useGameStore = create(
  persist(
    (set, get) => ({
      shipName: "ISS 새벽항로",
      shipGrade: "shuttle",
      currentMinute: GAME_TIME.START_MINUTE,
      isPaused: true,
      speed: 1,
      resources: normalizeResources(),
      gameOver: null,
      lastLowResourceWarningAt: null,
      requisitionReceipts: {},
      encounterReceipts: {},
      incidentReceipts: {},
      logs: ["우주력 2377년 3월 12일 14:20, 헬리오스 외연에서 항해를 시작했습니다."],
      news: ["항해 준비 완료. 스페이스바로 시간을 시작할 수 있습니다."],
      togglePause: () => set((state) => (state.gameOver ? state : { isPaused: !state.isPaused })),
      setPaused: (isPaused) => set((state) => (state.gameOver && !isPaused ? state : { isPaused })),
      cycleSpeed: () => set((state) => (state.gameOver ? state : { speed: state.speed === 1 ? 2 : state.speed === 2 ? 4 : 1 })),
      triggerGameOver: (cause) => {
        if (!cause || get().gameOver) return false;
        set((state) => ({
          gameOver: { cause, atMinute: state.currentMinute },
          isPaused: true,
          logs: [`항해 종료: ${cause}.`, ...state.logs].slice(0, 80),
          news: [`항해 종료: ${cause}.`, ...state.news].slice(0, 8),
        }));
        return true;
      },
      addLog: (message) =>
        set((state) => ({
          logs: [message, ...state.logs].slice(0, 80),
          news: [message, ...state.news].slice(0, 8),
        })),
      addResource: (key, amount) =>
        set((state) => ({
          resources: {
            ...state.resources,
            [key]: clampResource(key, (state.resources[key] ?? 0) + amount),
          },
        })),
      addResources: (changes) =>
        set((state) => {
          const next = { ...state.resources };
          Object.entries(changes ?? {}).forEach(([key, amount]) => {
            next[key] = clampResource(key, (next[key] ?? 0) + amount);
          });
          return { resources: normalizeResources(next) };
        }),
      applyRequisitionCredits: (claimId, amount) => {
        if (!claimId || get().requisitionReceipts?.[claimId]) return false;
        set((state) => ({
          resources: normalizeResources({ ...state.resources, credits: state.resources.credits + Math.max(0, amount ?? 0) }),
          requisitionReceipts: { ...(state.requisitionReceipts ?? {}), [claimId]: true },
        }));
        return true;
      },
      applyEncounterResources: (claimId, delta = {}) => {
        if (!claimId || get().encounterReceipts?.[claimId]) return false;
        set((state) => ({ resources: normalizeResources(Object.fromEntries(Object.entries(state.resources).map(([key, value]) => [key, value + (delta[key] ?? 0)]))), encounterReceipts: { ...(state.encounterReceipts ?? {}), [claimId]: true } }));
        return true;
      },
      applyIncidentResources: (claimId, delta = {}) => {
        if (!claimId || get().incidentReceipts?.[claimId]) return false;
        set((state) => ({
          resources: normalizeResources(Object.fromEntries(Object.entries(state.resources).map(([key, value]) => [key, value + (delta[key] ?? 0)]))),
          incidentReceipts: { ...(state.incidentReceipts ?? {}), [claimId]: true },
        }));
        return true;
      },
      spendCredits: (amount) => {
        const credits = get().resources.credits;
        if (credits < amount) return false;
        set((state) => ({ resources: { ...state.resources, credits: state.resources.credits - amount } }));
        return true;
      },
      spendFuel: (amount) => {
        const fuel = get().resources.fuel;
        if (fuel < amount) return false;
        set((state) => ({ resources: { ...state.resources, fuel: clampResource("fuel", state.resources.fuel - amount) } }));
        return true;
      },
      repairHull: (amount) => set((state) => ({ resources: { ...state.resources, hull: clampResource("hull", state.resources.hull + amount) } })),
      advanceMinutes: (minutes) => {
        if (get().gameOver) return;
        const hours = minutes / 60;
        const mods = getActiveModifiers(useInventoryStore.getState().getActiveCards());
        set((state) => ({
          currentMinute: state.currentMinute + minutes,
          resources: normalizeResources({
            ...state.resources,
            fuel: state.resources.fuel - RESOURCES.FUEL_PER_GAME_HOUR * hours * mods.fuelConsumptionMult,
            oxygen: state.resources.oxygen - RESOURCES.OXYGEN_PER_GAME_HOUR * hours * mods.oxygenConsumptionMult,
          }),
        }));
        const state = get();
        if (canEmitLowResourceWarning(state)) {
          set({ lastLowResourceWarningAt: state.currentMinute });
          get().addLog("자원 경고: 연료 또는 산소가 낮습니다. 정거장 보급을 검토하세요.");
        }
      },
      resetGame: () =>
        set({
          currentMinute: GAME_TIME.START_MINUTE,
          isPaused: true,
          speed: 1,
          resources: normalizeResources(),
          gameOver: null,
          lastLowResourceWarningAt: null,
          requisitionReceipts: {},
          encounterReceipts: {},
          incidentReceipts: {},
          logs: ["새 항해 기록이 생성되었습니다."],
          news: ["새 게임이 시작되었습니다."],
        }),
    }),
    {
      name: "space-manager-game",
      version: PERSIST_VERSION,
      migrate: passthroughMigrate,
      merge: mergePersistedGameState,
    },
  ),
);
