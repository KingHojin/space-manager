import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DUST, SHARD_CRAFT_COST } from "../data/constants";
import { cards as cardCatalog } from "../data/cards";
import { items as baseItems } from "../data/items";
import { drawCard, drawPityCard } from "../systems/gachaEngine";
import { passthroughMigrate, PERSIST_VERSION } from "./persistVersion";

export function mergeItems(savedItems = []) {
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
      pityCount: 0,
      requisitionReceipts: {},
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
      applyRequisitionItems: (claimId, grants = []) => {
        if (!claimId || get().requisitionReceipts?.[claimId]) return false;
        set((state) => {
          let items = state.items;
          for (const { itemId, qty } of grants) {
            if (!itemId || !(qty > 0)) continue;
            const existing = items.find((item) => item.id === itemId);
            items = existing
              ? items.map((item) => item.id === itemId ? { ...item, qty: Math.max(0, (item.qty ?? 0) + qty) } : item)
              : [...items, { ...(baseItems.find((item) => item.id === itemId) ?? { id: itemId, name: itemId, rarity: "common", type: "misc" }), qty }];
          }
          return { items, requisitionReceipts: { ...(state.requisitionReceipts ?? {}), [claimId]: true } };
        });
        return true;
      },
      removeItem: (itemId, qty = 1) =>
        set((state) => ({
          items: state.items.map((item) => (item.id === itemId ? { ...item, qty: Math.max(0, (item.qty ?? 0) - qty) } : item)),
        })),
      draw: (count) => {
        const cost = count >= 10 ? DUST.TEN_DRAW_COST : DUST.SINGLE_DRAW_COST;
        if (get().dust < cost) return { ok: false, message: "우주 먼지가 부족합니다." };
        // Draw cards one at a time so the pity counter can force an epic-or-better
        // card the moment it crosses DUST.PITY_THRESHOLD, then resets.
        let runningPity = get().pityCount;
        const drawn = [];
        for (let index = 0; index < count; index += 1) {
          const forcedPity = runningPity + 1 >= DUST.PITY_THRESHOLD;
          const card = forcedPity ? drawPityCard() : drawCard(count >= 10 && index === count - 1);
          drawn.push(card);
          runningPity = ["epic", "legendary"].includes(card.rarity) ? 0 : runningPity + 1;
        }
        set((state) => {
          const ownedIds = new Set(state.cards.map((card) => card.id));
          const duplicates = drawn.filter((card) => ownedIds.has(card.id)).length;
          return {
            dust: state.dust - cost,
            shards: state.shards + duplicates * DUST.DUPLICATE_SHARDS,
            cards: [...state.cards, ...drawn.map((card) => ({ ...card, instanceId: crypto.randomUUID() }))],
            lastDraw: drawn,
            pityCount: runningPity,
          };
        });
        return { ok: true, drawn };
      },
      craftCard: (cardId) => {
        const template = cardCatalog.find((card) => card.id === cardId);
        if (!template) return { ok: false, message: "카드를 찾을 수 없습니다." };
        const cost = SHARD_CRAFT_COST[template.rarity] ?? SHARD_CRAFT_COST.common;
        if (get().shards < cost) return { ok: false, message: "먼지 조각이 부족합니다." };
        const card = { ...template, instanceId: crypto.randomUUID() };
        set((state) => ({
          shards: state.shards - cost,
          cards: [...state.cards, card],
        }));
        return { ok: true, card };
      },
      getActiveCards: () => get().cards.filter((card) => get().activeCardIds.includes(card.instanceId)),
      consumeCard: (instanceId) => {
        const card = get().cards.find((entry) => entry.instanceId === instanceId);
        if (!card) return { ok: false, message: "카드를 찾을 수 없습니다." };
        if (card.id !== "instant-patch") return { ok: false, message: "이 카드는 아직 사용할 수 없습니다." };
        set((state) => ({
          cards: state.cards.filter((entry) => entry.instanceId !== instanceId),
          activeCardIds: state.activeCardIds.filter((id) => id !== instanceId),
        }));
        return { ok: true, card };
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
      version: PERSIST_VERSION,
      migrate: passthroughMigrate,
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...(persistedState ?? {}),
        items: mergeItems(persistedState?.items),
        requisitionReceipts: persistedState?.requisitionReceipts ?? {},
      }),
    },
  ),
);
