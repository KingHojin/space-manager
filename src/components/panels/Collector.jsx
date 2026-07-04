import { Sparkles } from "lucide-react";
import { DUST } from "../../data/constants";
import { useGameStore } from "../../stores/gameStore";
import { useInventoryStore } from "../../stores/inventoryStore";
import { number } from "../../utils/format";
import Badge from "../common/Badge";

export default function Collector() {
  const { dust, shards, lastDraw, draw } = useInventoryStore();
  const addLog = useGameStore((state) => state.addLog);

  const handleDraw = (count) => {
    const result = draw(count);
    if (!result.ok) {
      addLog(result.message);
      return;
    }
    addLog(`우주 집진기 카드 ${count}회 뽑기 완료.`);
  };

  return (
    <div className="grid h-full grid-cols-[0.8fr_1.2fr] gap-4">
      <section>
        <div className="section-title">
          <Sparkles size={18} />
          우주 집진기
        </div>
        <div className="mt-5 rounded border border-cyan-400/30 bg-cyan-400/10 p-5">
          <div className="text-sm text-cyan-100">보유 우주 먼지</div>
          <div className="mt-2 font-mono text-5xl font-bold text-white tabular-nums">{number(dust, 1)}</div>
          <div className="mt-2 text-sm text-slate-400">먼지 조각 {shards}</div>
        </div>
        <div className="mt-4 grid gap-2">
          <button className="primary-button" onClick={() => handleDraw(1)}>
            1회 뽑기 - {DUST.SINGLE_DRAW_COST}
          </button>
          <button className="secondary-button" onClick={() => handleDraw(10)}>
            10연차 - {DUST.TEN_DRAW_COST}
          </button>
        </div>
      </section>
      <section>
        <div className="section-title">최근 획득 카드</div>
        <div className="mt-4 grid grid-cols-2 gap-3">
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
