import Badge from "../common/Badge";
import { useGameStore } from "../../stores/gameStore";
import { useInventoryStore } from "../../stores/inventoryStore";

const sellPrice = {
  common: 25,
  uncommon: 60,
  rare: 140,
  epic: 320,
  legendary: 900,
};

const usableEffects = {
  "fuel-rod": { label: "사용: 연료 +12", changes: { fuel: 12 } },
  "oxygen-cell": { label: "사용: 산소 +15", changes: { oxygen: 15 } },
  "nanite-gel": { label: "사용: 선체 +18", changes: { hull: 18 } },
  "survey-probe": { label: "탐험 선택지에서 사용", changes: null },
};

export default function InventoryModal() {
  const items = useInventoryStore((state) => state.items);
  const removeItem = useInventoryStore((state) => state.removeItem);
  const addResources = useGameStore((state) => state.addResources);
  const addLog = useGameStore((state) => state.addLog);

  const useItem = (item) => {
    const effect = usableEffects[item.id];
    if (!effect?.changes || item.qty <= 0) return;
    removeItem(item.id, 1);
    addResources(effect.changes);
    addLog(`${item.name} 사용 완료.`);
  };

  const sellItem = (item) => {
    if (item.qty <= 0) return;
    const price = sellPrice[item.rarity] ?? 20;
    removeItem(item.id, 1);
    addResources({ credits: price });
    addLog(`${item.name} 판매: 크레딧 +${price}.`);
  };

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => {
        const effect = usableEffects[item.id];
        const canUse = Boolean(effect?.changes) && item.qty > 0;
        return (
          <div key={item.id} className="rounded border border-slate-700/70 bg-slate-950/60 p-4">
            <div className="mb-3 flex items-center justify-between">
              <Badge rarity={item.rarity}>{item.rarity}</Badge>
              <span className="hud-chip">x{item.qty}</span>
            </div>
            <div className="font-semibold text-slate-50">{item.name}</div>
            <div className="mt-1 text-xs text-slate-500">{item.type ?? "misc"}</div>
            {effect && <p className="mt-2 text-sm text-slate-400">{effect.label}</p>}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button className="secondary-button" disabled={!canUse} onClick={() => useItem(item)}>
                사용
              </button>
              <button className="secondary-button" disabled={item.qty <= 0} onClick={() => sellItem(item)}>
                판매
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
