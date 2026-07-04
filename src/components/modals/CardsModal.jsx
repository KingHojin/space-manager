import Badge from "../common/Badge";
import { useInventoryStore } from "../../stores/inventoryStore";

export default function CardsModal() {
  const { cards, activeCardIds, toggleActiveCard } = useInventoryStore();
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {cards.length === 0 ? (
        <div className="col-span-3 rounded border border-slate-700/70 bg-slate-950/60 p-4 text-sm text-slate-400">보유 카드가 없습니다.</div>
      ) : (
        cards.map((card) => {
          const active = activeCardIds.includes(card.instanceId);
          return (
            <button key={card.instanceId} className={`text-left rounded border p-4 ${active ? "border-cyan-300 bg-cyan-400/10" : "border-slate-700 bg-slate-950/60"}`} onClick={() => toggleActiveCard(card.instanceId)}>
              <div className="mb-3 flex items-center justify-between">
                <Badge rarity={card.rarity}>{card.rarity}</Badge>
                <span className="text-xs text-slate-500">{active ? "활성" : card.family}</span>
              </div>
              <div className="font-semibold text-slate-50">{card.name}</div>
              <p className="mt-2 text-sm text-slate-400">{card.effect}</p>
            </button>
          );
        })
      )}
    </div>
  );
}
