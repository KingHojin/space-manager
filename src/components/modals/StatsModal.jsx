import { calculateCombatPower } from "../../systems/combatEngine";
import { useCrewStore } from "../../stores/crewStore";
import { useInventoryStore } from "../../stores/inventoryStore";
import { useShipStore } from "../../stores/shipStore";
import { statLabel } from "../../utils/format";

export default function StatsModal() {
  const modules = useShipStore((state) => state.getInstalledModules());
  const crew = useCrewStore((state) => state.crew);
  const cards = useInventoryStore((state) => state.cards);
  const activeCardIds = useInventoryStore((state) => state.activeCardIds);
  const activeCards = cards.filter((card) => activeCardIds.includes(card.instanceId));
  // Bug-fix round 21: statLabel includes "cooking", but the 4 starter crew in
  // data/crew.js only define piloting/gunnery/engineering/medicine/scouting —
  // `acc[key] += member.stats[key]` with an undefined stat produced NaN for
  // the 조리 total on every fresh game (0 + undefined = NaN, and NaN then
  // poisons every later add). Missing stats count as 0 instead.
  const totals = crew.reduce(
    (acc, member) => {
      Object.keys(statLabel).forEach((key) => {
        acc[key] += member.stats?.[key] ?? 0;
      });
      return acc;
    },
    Object.fromEntries(Object.keys(statLabel).map((key) => [key, 0])),
  );
  const moduleStats = modules.reduce((acc, module) => {
    Object.entries(module.stats).forEach(([key, value]) => {
      acc[key] = (acc[key] ?? 0) + value;
    });
    return acc;
  }, {});
  const combatPower = calculateCombatPower({ modules, crew, activeCards });
  const avgFatigue = Math.round(crew.reduce((sum, member) => sum + (member.fatigue ?? 0), 0) / Math.max(1, crew.length));

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section>
        <div className="section-title">핵심 전력</div>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <StatCard label="전투력" value={combatPower} />
          <StatCard label="평균 피로" value={avgFatigue} />
          <StatCard label="활성 카드" value={`${activeCards.length}/3`} />
        </div>
      </section>

      <section>
        <div className="section-title">함선 모듈 보정</div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {Object.entries(moduleStats).map(([key, value]) => (
            <span key={key} className="hud-chip">
              {key} {value > 0 ? "+" : ""}{value}
            </span>
          ))}
        </div>
      </section>

      <section>
        <div className="section-title">승무원 종합</div>
        <div className="mt-3 space-y-2">
          {Object.entries(totals).map(([key, value]) => (
            <div key={key} className="flex justify-between border-b border-slate-800 pb-2 text-sm">
              <span className="hud-label">{statLabel[key]}</span>
              <span className="hud-value font-mono">{value}</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="section-title">장착 모듈</div>
        <div className="mt-3 space-y-2">
          {modules.map((module) => (
            <div key={module.id} className="rounded border border-slate-700/70 bg-slate-950/60 p-3 text-sm text-slate-300">
              <div className="font-semibold text-slate-100">{module.name} Lv.{module.level}</div>
              <div className="mt-1 text-xs text-slate-500">{Object.entries(module.stats).map(([key, value]) => `${key} ${value > 0 ? "+" : ""}${value}`).join(" · ")}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="rounded border border-slate-700/70 bg-slate-950/60 p-3">
      <div className="hud-label">{label}</div>
      <div className="hud-value mt-1 text-lg">{value}</div>
    </div>
  );
}
