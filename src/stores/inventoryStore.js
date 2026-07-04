import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DUST } from "../data/constants";
import { items } from "../data/items";
import { drawCards } from "../systems/gachaEngine";

export const useInventoryStore = create(
  persist(
    (set, get) => ({
      dust: 40,
      shards: 0,
      items,
      cards: [],
      activeCardIds: [],
      lastDraw: [],
      addDust: (amount) => set((state) => ({ dust: state.dust + amount })),
      draw: (count) => {
        const cost = count >= 10 ? DUST.TEN_DRAW_COST : DUST.SINGLE_DRAW_COST;
        if (get().dust < cost) return { ok: false, message: "우주 먼지가 부족합니다." };
        const drawn = drawCards(count);
        set((state) => {
          const ownedIds = new Set(state.cards.map((card) => card.id));
          const duplicates = drawn.filter((card) => ownedIds.has(card.id)).length;
          return {
            dust: state.dust - cost,
            shards: state.shards + duplicates * DUST.DUPLICATE_SHARDS,
            cards: [...state.cards, ...drawn.map((card) => ({ ...card, instanceId: crypto.randomUUID() }))],
            lastDraw: drawn,
          };
        });
        return { ok: true, drawn };
      },
      toggleActiveCard: (instanceId) =>
        set((state) => {
          const exists = state.activeCardIds.includes(instanceId);
          if (!exists && state.activeCardIds.length >= 3) return state;
          return {
            activeCardIds: exists
              ? state.activeCardIds.filter((id) => id !== instanceId)
              : [...state.activeCardIds, instanceId],
          };
        }),
    }),
    { name: "space-manager-inventory" },
  ),
);
