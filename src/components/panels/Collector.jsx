import { useState } from "react";
import { Sparkles } from "lucide-react";
import { DUST, SHARD_CRAFT_COST } from "../../data/constants";
import { cards as cardCatalog } from "../../data/cards";
import { useGameStore } from "../../stores/gameStore";
import { useInventoryStore } from "../../stores/inventoryStore";
import { number } from "../../utils/format";
import Badge from "../common/Badge";

const sortedCatalog = [...cardCatalog].sort((a, b) => a.rarity.localeCompare(b.rarity) || a.name.localeCompare(b.name));

export default function Collector() {
  const { dust, shards, lastDraw, pityCount, draw, craftCard } = useInventoryStore();
  const addLog = useGameStore((state) => state.addLog);
  const [craftCardId, setCraftCardId] = useState(sortedCatalog[0]?.id ?? "");

  const handleDraw = (count) => {
    const result = draw(count);
    if (!result.ok) {
      addLog(result.message);
      return;
    }
    addLog(`우주 집진기 카드 ${count}회 뽑기 완료.`);
  };

  const handleCraft = () => {
    if (!craftCardId) return;
    const result = craftCard(craftCardId);
    if (!result.ok) {
      addLog(result.message);
      return;
    }
    addLog(`먼지 조각으로 ${result.card.name} 카드를 제작했습니다.`);
  };

  return (
    <div className="grid gap-4 lg:h-full lg:grid-cols-[0.8fr_1.2fr]">
      <section>
        <div className="section-title">
          <Sparkles size={18} />
          우주 집진기
        </div>
        <div className="mt-5 rounded border border-cyan-400/30 bg-cyan-400/10 p-5">
          <div className="hud-label">보유 우주 먼지</div>
          <div className="mt-2 font-mono text-5xl font-bold text-white tabular-nums">{number(dust, 1)}</div>
          <span className="hud-chip mt-2">먼지 조각 {shards}</span>
          <span className="hud-chip mt-2">천장 {pityCount}/{DUST.PITY_THRESHOLD} (영웅 이상 확정까지)</span>
        </div>
        <div className="mt-4 grid gap-2">
          <button className="primary-button" onClick={() => handleDraw(1)}>
            1회 뽑기 - {DUST.SINGLE_DRAW_COST}
          </button>
          <button className="secondary-button" onClick={() => handleDraw(10)}>
            10연차 - {DUST.TEN_DRAW_COST}
          </button>
        </div>
        <div className="mt-6">
          <div className="section-title">조각 제작</div>
          <div className="mt-3 grid gap-2">
            <select
              className="rounded border border-slate-700/70 bg-slate-950/60 p-2 text-sm text-slate-200"
              value={craftCardId}
              onChange={(event) => setCraftCardId(event.target.value)}
            >
              {sortedCatalog.map((card) => (
                <option key={card.id} value={card.id}>
                  {card.name} ({card.rarity}, {SHARD_CRAFT_COST[card.rarity]})
                </option>
              ))}
            </select>
            <button className="secondary-button" onClick={handleCraft}>
              먼지 조각으로 제작
            </button>
          </div>
        </div>
      </section>
      <section>
        <div className="section-title">최근 획득 카드</div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {lastDraw.length === 0 ? (
            <div className="rounded border border-slate-700/70 bg-slate-950/60 p-4 text-sm text-slate-400">아직 뽑기 기록이 없습니다.</div>
          ) : (
            lastDraw.map((card, index) => (
              <div key={`${card.id}-${index}`} className="card-flip rounded border border-slate-700/70 bg-slate-950/70 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <Badge rarity={card.rarity}>{card.rarity}</Badge>
                  <span className="text-xs text-slate-500">{card.family}</span>
                </div>
                <div className="font-bold text-slate-50">{card.name}</div>
                <p className="mt-2 text-sm text-slate-400">{card.effect}</p>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
