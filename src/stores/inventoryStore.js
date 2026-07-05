import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DUST } from "../data/constants";
import { items as baseItems } from "../data/items";
import { drawCards } from "../systems/gachaEngine";

function mergeItems(savedItems = []) {
  const savedById = new Map(savedItems.map((item) => [item.id, item]));
  const mergedBase = baseItems.map((item) => ({ ...item, ...(savedById.get(item.id) ?? {}) }));
  const extraSaved = savedItems.filter((item) => !baseItems.some((base) => base.id === item.id));
  return [...mergedBase, ...extraSaved];
}

export const useInventoryStore = create(
  persist(
    (set, get) => ({
      dust: 40,
      shards: 0,
      items: baseItems,
      cards: [],
      activeCardIds: [],
      lastDraw: [],
      addDust: (amount) => set((state) => ({ dust: Math.max(0, state.dust + amount) })),
      addItem: (itemId, qty = 1) =>
        set((state) => {
          const existing = state.items.find((item) => item.id === itemId);
          if (existing) {
            return {
              items: state.items.map((item) => (item.id === itemId ? { ...item, qty: Math.max(0, (item.qty ?? 0) + qty) } : item)),
            };
          }
          const template = baseItems.find((item) => item.id === itemId) ?? {
            id: itemId,
            name: itemId,
            rarity: "common",
            type: "misc",
          };
          return { items: [...state.items, { ...template, qty: Math.max(0, qty) }] };
        }),
      removeItem: (itemId, qty = 1) =>
        set((state) => ({
          items: state.items.map((item) => (item.id === itemId ? { ...item, qty: Math.max(0, (item.qty ?? 0) - qty) } : item)),
        })),
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
    {
      name: "space-manager-inventory",
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...(persistedState ?? {}),
        items: mergeItems(persistedState?.items),
      }),
    },
  ),
);
