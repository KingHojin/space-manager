import { create } from "zustand";
import { persist } from "zustand/middleware";
import { passthroughMigrate, PERSIST_VERSION } from "./persistVersion";

const DEFAULT_TARGET_ID = "hull";
const DEFAULT_FEED = ["교전 대기 중. 전투는 조우나 명시적 출격 상황에서만 시작됩니다."];
const MAX_FEED = 14;

function normalizeFeed(feed) {
  return Array.isArray(feed) && feed.length > 0 ? feed.slice(0, MAX_FEED) : DEFAULT_FEED;
}

function withoutKey(map = {}, key) {
  const next = { ...map };
  delete next[key];
  return next;
}

export const useCombatStore = create(
  persist(
    (set, get) => ({
      combatByVesselId: {},
      feedByVesselId: {},
      targetByVesselId: {},
      startCombat: ({ vesselId, combat, targetId = DEFAULT_TARGET_ID, feed = null } = {}) => {
        if (!vesselId || !combat) return { ok: false, reason: "missingCombat" };
        set((state) => ({
          combatByVesselId: { ...state.combatByVesselId, [vesselId]: combat },
          targetByVesselId: { ...state.targetByVesselId, [vesselId]: targetId },
          feedByVesselId: { ...state.feedByVesselId, [vesselId]: normalizeFeed(feed ?? state.feedByVesselId[vesselId]) },
        }));
        return { ok: true, combat };
      },
      setTarget: ({ vesselId, targetId = DEFAULT_TARGET_ID } = {}) => {
        if (!vesselId) return { ok: false, reason: "missingVesselId" };
        set((state) => ({ targetByVesselId: { ...state.targetByVesselId, [vesselId]: targetId } }));
        return { ok: true, targetId };
      },
      updateCombat: ({ vesselId, combat } = {}) => {
        if (!vesselId || !combat) return { ok: false, reason: "missingCombat" };
        set((state) => ({ combatByVesselId: { ...state.combatByVesselId, [vesselId]: combat } }));
        return { ok: true, combat };
      },
      addFeed: ({ vesselId, lines = [] } = {}) => {
        if (!vesselId) return { ok: false, reason: "missingVesselId" };
        const cleanLines = (Array.isArray(lines) ? lines : [lines]).filter(Boolean);
        if (cleanLines.length === 0) return { ok: true, feed: get().feedByVesselId[vesselId] ?? DEFAULT_FEED };
        let feed = DEFAULT_FEED;
        set((state) => {
          feed = [...cleanLines, ...normalizeFeed(state.feedByVesselId[vesselId])].slice(0, MAX_FEED);
          return { feedByVesselId: { ...state.feedByVesselId, [vesselId]: feed } };
        });
        return { ok: true, feed };
      },
      resetCombat: ({ vesselId, keepFeed = true } = {}) => {
        if (!vesselId) return { ok: false, reason: "missingVesselId" };
        set((state) => ({
          combatByVesselId: withoutKey(state.combatByVesselId, vesselId),
          targetByVesselId: { ...state.targetByVesselId, [vesselId]: DEFAULT_TARGET_ID },
          feedByVesselId: keepFeed ? state.feedByVesselId : withoutKey(state.feedByVesselId, vesselId),
        }));
        return { ok: true };
      },
      getCombatState: (vesselId) => {
        const state = get();
        return {
          combat: state.combatByVesselId[vesselId] ?? null,
          feed: normalizeFeed(state.feedByVesselId[vesselId]),
          targetId: state.targetByVesselId[vesselId] ?? DEFAULT_TARGET_ID,
        };
      },
    }),
    {
      name: "space-manager-combat",
      version: PERSIST_VERSION,
      migrate: passthroughMigrate,
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...(persistedState ?? {}),
        combatByVesselId: persistedState?.combatByVesselId ?? {},
        feedByVesselId: Object.fromEntries(Object.entries(persistedState?.feedByVesselId ?? {}).map(([vesselId, feed]) => [vesselId, normalizeFeed(feed)])),
        targetByVesselId: persistedState?.targetByVesselId ?? {},
      }),
    },
  ),
);
