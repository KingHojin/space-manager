import { Crosshair } from "lucide-react";
import { useMemo, useState } from "react";
import { getCombatDirectiveResult, calculateCombatPower } from "../../systems/combatEngine";
import { useCrewStore } from "../../stores/crewStore";
import { useInventoryStore } from "../../stores/inventoryStore";
import { useShipStore } from "../../stores/shipStore";

const directives = [
  ["attack", "공격 집중"],
  ["evade", "회피 기동"],
  ["shield", "방어막 강화"],
  ["retreat", "도주 시도"],
  ["skill", "카드 발동"],
];

export default function Combat() {
  const [feed, setFeed] = useState(["현재 교전 없음. 훈련 시뮬레이션으로 지시 체계를 점검할 수 있습니다."]);
  const installedModules = useShipStore((state) => state.getInstalledModules());
  const crew = useCrewStore((state) => state.crew);
  const cards = useInventoryStore((state) => state.cards);
  const activeCardIds = useInventoryStore((state) => state.activeCardIds);
  const activeCards = useMemo(
    () => cards.filter((card) => activeCardIds.includes(card.instanceId)),
    [cards, activeCardIds],
  );
  const power = calculateCombatPower({ modules: installedModules, crew, activeCards });

  const issueDirective = (directive) => {
    setFeed((current) => [getCombatDirectiveResult(directive), ...current].slice(0, 8));
  };

  return (
    <div className="grid gap-4 lg:h-full lg:grid-cols-[0.85fr_1.15fr]">
      <section>
        <div className="section-title">
          <Crosshair size={18} />
          전투 지시
        </div>
        <div className="mt-5 text-5xl font-bold text-cyan-100">{power}</div>
        <p className="mt-2 text-sm text-slate-400">현재 함선, 승무원, 활성 카드 기준 전투력입니다.</p>
        <div className="mt-6 grid gap-2">
          {directives.map(([id, label]) => (
            <button key={id} className="secondary-button" onClick={() => issueDirective(id)}>
              {label}
            </button>
          ))}
        </div>
      </section>
      <section>
        <div className="section-title">FM식 전투 중계</div>
        <div className="mt-4 max-h-[28rem] overflow-auto rounded border border-slate-700 bg-slate-950 p-4 lg:h-[calc(100%-2.5rem)] lg:max-h-none">
          {feed.map((line, index) => (
            <div key={`${line}-${index}`} className="border-b border-slate-800 py-3 text-sm text-slate-300 last:border-b-0">
              {line}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
