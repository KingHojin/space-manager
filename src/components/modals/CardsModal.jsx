import Badge from "../common/Badge";
import { JOB_DURATION } from "../../data/constants";
import { useGameStore } from "../../stores/gameStore";
import { useInventoryStore } from "../../stores/inventoryStore";
import { useJobStore } from "../../stores/jobStore";

const rarityOrder = { legendary: 0, epic: 1, rare: 2, uncommon: 3, common: 4 };

export default function CardsModal() {
  const { cards, activeCardIds, toggleActiveCard, consumeCard } = useInventoryStore();
  const sortedCards = [...cards].sort((a, b) => (rarityOrder[a.rarity] ?? 9) - (rarityOrder[b.rarity] ?? 9));

  const useConsumable = (card) => {
    const result = consumeCard(card.instanceId);
    if (!result.ok) return useGameStore.getState().addLog(result.message);
    useJobStore.getState().enqueueShipWork({
      type: "hullRepair",
      roomId: "engineering",
      cost: 0,
      duration: JOB_DURATION.hull_repair,
      priority: "high",
      createdAt: useGameStore.getState().currentMinute,
      payload: { hullDelta: 30 },
    });
    return useGameStore.getState().addLog("즉시 보수 카드 사용: 선체 정비 작업(+30%)이 대기열에 등록되었습니다.");
  };

  return (
    <div className="grid gap-4">
      <section className="rounded border border-cyan-400/30 bg-cyan-400/10 p-4">
        <div className="section-title">활성 카드 슬롯</div>
        <p className="mt-2 text-sm text-slate-300">최대 3장까지 활성화되며 전투력, 탐험 보상, 함선 운용에 영향을 줍니다.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {activeCardIds.length === 0 ? (
            <span className="hud-chip">활성 카드 없음</span>
          ) : (
            activeCardIds.map((id) => {
              const card = cards.find((entry) => entry.instanceId === id);
              return <span key={id} className="hud-chip hud-chip-accent">{card?.name ?? "알 수 없음"}</span>;
            })
          )}
          <span className="hud-chip">{activeCardIds.length}/3</span>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sortedCards.length === 0 ? (
          <div className="rounded border border-slate-700/70 bg-slate-950/60 p-4 text-sm text-slate-400 sm:col-span-2 lg:col-span-3">
            보유 카드가 없습니다. 우주 집진기에서 우주 먼지를 사용해 카드를 획득하세요.
          </div>
        ) : (
          sortedCards.map((card) => {
            const active = activeCardIds.includes(card.instanceId);
            const consumable = card.family === "consumable";
            const usable = card.id === "instant-patch";
            return (
              <div
                key={card.instanceId}
                className={`rounded border p-4 text-left ${active ? "border-cyan-300 bg-cyan-400/10" : "border-slate-700 bg-slate-950/60"}`}
              >
                <button className="w-full text-left" onClick={() => toggleActiveCard(card.instanceId)}>
                  <div className="mb-3 flex items-center justify-between">
                    <Badge rarity={card.rarity}>{card.rarity}</Badge>
                    <span className="text-xs text-slate-500">{active ? "활성" : card.family}</span>
                  </div>
                  <div className="font-semibold text-slate-50">{card.name}</div>
                  <p className="mt-2 text-sm text-slate-400">{card.effect}</p>
                </button>
                {consumable && (
                  <button
                    className="secondary-button mt-3 min-h-8 w-full justify-center text-xs"
                    disabled={!usable}
                    title={usable ? "카드를 소모해 효과를 발동합니다" : "아직 사용할 수 없습니다"}
                    onClick={() => useConsumable(card)}
                  >
                    사용
                  </button>
                )}
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}
