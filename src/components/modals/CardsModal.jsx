import { cards as catalogCards } from "../../data/cards";
import { useInventoryStore } from "../../stores/inventoryStore";
import Badge from "../common/Badge";

const skillRows = [
  { label: "항법", ids: ["lean-burn", "fast-scan", "map-flare"] },
  { label: "함교", ids: ["calm-bridge", "battle-focus", "ghost-turn"] },
  { label: "보급", ids: ["collector-tune", "instant-patch", "auric-cache"] },
];

export default function CardsModal() {
  const { cards, activeCardIds, toggleActiveCard } = useInventoryStore();
  const ownedCardIds = new Set(cards.map((card) => card.id));

  return (
    <div className="space-y-5">
      <section className="p-0">
        <div className="border-b border-slate-700/70 px-4 py-3">
          <div className="section-title">카드 스킬 트리</div>
          <p className="mt-1 text-sm text-slate-400">모바일에서도 좌우로 넘겨 전체 성장 경로를 확인할 수 있습니다.</p>
        </div>
        <div className="skill-tree-scroll p-4">
          <div className="skill-tree">
            {skillRows.map((row) => (
              <div key={row.label} className="skill-tree-row">
                <div className="skill-tree-label">{row.label}</div>
                {row.ids.map((id, index) => {
                  const card = catalogCards.find((entry) => entry.id === id);
                  const owned = ownedCardIds.has(id);
                  return (
                    <div key={id} className="flex items-center gap-3">
                      {index > 0 && <div className={`skill-tree-link ${owned ? "skill-tree-link-owned" : ""}`} />}
                      <div className={`skill-node ${owned ? "skill-node-owned" : ""}`}>
                        <Badge rarity={card.rarity}>{card.rarity}</Badge>
                        <div className="mt-2 font-semibold text-slate-50">{card.name}</div>
                        <p className="mt-1 text-xs text-slate-400">{card.effect}</p>
                        <div className="mt-2 text-xs font-bold text-cyan-100">{owned ? "해금됨" : "미보유"}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="p-0">
        <div className="border-b border-slate-700/70 px-4 py-3">
          <div className="section-title">보유 카드</div>
          <p className="mt-1 text-sm text-slate-400">보유 카드를 눌러 전투 및 항해 보너스를 활성화합니다.</p>
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.length === 0 ? (
            <div className="rounded border border-slate-700/70 bg-slate-950/60 p-4 text-sm text-slate-400 sm:col-span-2 lg:col-span-3">
              보유 카드가 없습니다. 우주 집진기에서 카드를 획득하면 스킬 트리에도 표시됩니다.
            </div>
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
      </section>
    </div>
  );
}
