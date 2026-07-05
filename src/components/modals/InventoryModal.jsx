import { Archive, CircleDollarSign, Package, Sparkles, Zap } from "lucide-react";
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
  "fuel-rod": { label: "연료 +12", changes: { fuel: 12 }, icon: "⛽" },
  "oxygen-cell": { label: "산소 +15", changes: { oxygen: 15 }, icon: "O₂" },
  "nanite-gel": { label: "선체 +18", changes: { hull: 18 }, icon: "✚" },
  "survey-probe": { label: "탐험 선택지", changes: null, icon: "◌" },
};

const typeIcon = {
  material: "▧",
  consumable: "✚",
  tool: "◌",
  biology: "◍",
  salvage: "▣",
  science: "✦",
  artifact: "◈",
  intel: "◇",
  navigation: "⌖",
  "mission-reward": "★",
  "module-part": "▤",
};

function itemVisual(item) {
  return typeIcon[item.type] ?? "●";
}

function rarityGlow(rarity) {
  if (rarity === "legendary") return "border-amber-300/55 bg-amber-300/10";
  if (rarity === "epic") return "border-violet-300/55 bg-violet-300/10";
  if (rarity === "rare") return "border-sky-300/45 bg-sky-300/10";
  if (rarity === "uncommon") return "border-emerald-300/40 bg-emerald-300/10";
  return "border-slate-700/70 bg-slate-950/60";
}

export default function InventoryModal() {
  const items = useInventoryStore((state) => state.items);
  const removeItem = useInventoryStore((state) => state.removeItem);
  const addResources = useGameStore((state) => state.addResources);
  const addLog = useGameStore((state) => state.addLog);
  const ownedItems = items.filter((item) => (item.qty ?? 0) > 0);
  const totalQty = ownedItems.reduce((sum, item) => sum + item.qty, 0);
  const rareCount = ownedItems.filter((item) => ["rare", "epic", "legendary"].includes(item.rarity)).length;

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
    <div className="grid gap-4">
      <section className="rounded-2xl border border-cyan-300/25 bg-cyan-300/10 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="section-title"><Archive size={18} />화물 인벤토리</div>
            <p className="mt-2 text-sm text-slate-400">아이템을 카드 형태로 보고 즉시 사용/판매합니다.</p>
          </div>
          <div className="flex gap-1.5"><span className="hud-chip hud-chip-accent">보유 {ownedItems.length}</span><span className="hud-chip">수량 {totalQty}</span><span className="hud-chip">희귀 {rareCount}</span></div>
        </div>
      </section>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {items.map((item) => {
          const effect = usableEffects[item.id];
          const canUse = Boolean(effect?.changes) && item.qty > 0;
          return (
            <article key={item.id} className={`mission-contract-card overflow-hidden rounded-2xl border p-3 ${rarityGlow(item.rarity)} ${item.qty <= 0 ? "opacity-55" : ""}`}>
              <div className="relative grid h-28 place-items-center overflow-hidden rounded-xl border border-slate-600/40 bg-slate-950/60">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(125,211,252,0.18),transparent_55%)]" />
                <span className="relative text-5xl font-black text-cyan-100">{effect?.icon ?? itemVisual(item)}</span>
                <span className="absolute right-2 top-2 hud-chip bg-slate-950/70">x{item.qty}</span>
              </div>
              <div className="mt-3 flex items-start justify-between gap-2"><div className="min-w-0"><div className="truncate font-black text-slate-50">{item.name}</div><div className="mt-1 truncate text-xs text-slate-400">{item.type ?? "misc"}</div></div><Badge rarity={item.rarity}>{item.rarity}</Badge></div>
              <div className="mt-3 flex flex-wrap gap-1.5"><span className="mission-reward-icon"><Package size={12} />{item.type ?? "misc"}</span><span className="mission-reward-icon"><CircleDollarSign size={12} />₢{sellPrice[item.rarity] ?? 20}</span>{effect && <span className="mission-reward-icon"><Sparkles size={12} />{effect.label}</span>}</div>
              <div className="mt-4 grid grid-cols-2 gap-2"><button className="secondary-button justify-center" disabled={!canUse} onClick={() => useItem(item)}><Zap size={14} />사용</button><button className="secondary-button justify-center" disabled={item.qty <= 0} onClick={() => sellItem(item)}>판매</button></div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
