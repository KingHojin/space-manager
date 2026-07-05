import { create } from "zustand";
import { persist } from "zustand/middleware";
import { GAME_TIME, RESOURCES } from "../data/constants";

const PERCENT_RESOURCES = new Set(["fuel", "oxygen", "hull"]);

function clampResource(key, value) {
  if (key === "credits") return Math.max(0, Math.round(value));
  if (PERCENT_RESOURCES.has(key)) return Math.min(100, Math.max(0, value));
  return value;
}

export const useGameStore = create(
  persist(
    (set, get) => ({
      shipName: "ISS 새벽항로",
      shipGrade: "shuttle",
      currentMinute: GAME_TIME.START_MINUTE,
      isPaused: true,
      speed: 1,
      resources: {
        credits: RESOURCES.START_CREDITS,
        fuel: RESOURCES.START_FUEL,
        oxygen: RESOURCES.START_OXYGEN,
        hull: RESOURCES.START_HULL,
      },
      logs: ["우주력 2377년 3월 12일 14:20, 헬리오스 외연에서 항해를 시작했습니다."],
      news: ["항해 준비 완료. 스페이스바로 시간을 시작할 수 있습니다."],
      togglePause: () => set((state) => ({ isPaused: !state.isPaused })),
      setPaused: (isPaused) => set({ isPaused }),
      cycleSpeed: () => set((state) => ({ speed: state.speed === 1 ? 2 : state.speed === 2 ? 4 : 1 })),
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
          return { resources: next };
        }),
      spendCredits: (amount) => {
        const credits = get().resources.credits;
        if (credits < amount) return false;
        set((state) => ({
          resources: { ...state.resources, credits: state.resources.credits - amount },
        }));
        return true;
      },
      spendFuel: (amount) => {
        const fuel = get().resources.fuel;
        if (fuel < amount) return false;
        set((state) => ({
          resources: { ...state.resources, fuel: Math.max(0, state.resources.fuel - amount) },
        }));
        return true;
      },
      repairHull: (amount) =>
        set((state) => ({
          resources: { ...state.resources, hull: Math.min(100, state.resources.hull + amount) },
        })),
      advanceMinutes: (minutes) => {
        const hours = minutes / 60;
        set((state) => ({
          currentMinute: state.currentMinute + minutes,
          resources: {
            ...state.resources,
            fuel: Math.max(0, state.resources.fuel - RESOURCES.FUEL_PER_GAME_HOUR * hours),
            oxygen: Math.max(0, state.resources.oxygen - RESOURCES.OXYGEN_PER_GAME_HOUR * hours),
          },
        }));
        const { resources } = get();
        if (resources.fuel <= RESOURCES.LOW_RESOURCE_WARNING || resources.oxygen <= RESOURCES.LOW_RESOURCE_WARNING) {
          get().addLog("자원 경고: 연료 또는 산소가 낮습니다. 정거장 보급을 검토하세요.");
        }
      },
      resetGame: () =>
        set({
          currentMinute: GAME_TIME.START_MINUTE,
          isPaused: true,
          speed: 1,
          resources: {
            credits: RESOURCES.START_CREDITS,
            fuel: RESOURCES.START_FUEL,
            oxygen: RESOURCES.START_OXYGEN,
            hull: RESOURCES.START_HULL,
          },
          logs: ["새 항해 기록이 생성되었습니다."],
          news: ["새 게임이 시작되었습니다."],
        }),
    }),
    { name: "space-manager-game" },
  ),
);
