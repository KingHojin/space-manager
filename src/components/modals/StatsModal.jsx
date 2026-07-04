import { useCrewStore } from "../../stores/crewStore";
import { useShipStore } from "../../stores/shipStore";
import { statLabel } from "../../utils/format";

export default function StatsModal() {
  const modules = useShipStore((state) => state.getInstalledModules());
  const crew = useCrewStore((state) => state.crew);
  const totals = crew.reduce(
    (acc, member) => {
      Object.keys(statLabel).forEach((key) => {
        acc[key] += member.stats[key];
      });
      return acc;
    },
    Object.fromEntries(Object.keys(statLabel).map((key) => [key, 0])),
  );

  return (
    <div className="grid grid-cols-2 gap-4">
      <section>
        <div className="section-title">승무원 종합</div>
        <div className="mt-3 space-y-2">
          {Object.entries(totals).map(([key, value]) => (
            <div key={key} className="flex justify-between border-b border-slate-800 pb-2 text-sm">
              <span className="text-slate-400">{statLabel[key]}</span>
              <span className="font-mono text-slate-100">{value}</span>
            </div>
          ))}
        </div>
      </section>
      <section>
        <div className="section-title">함선 모듈 보정</div>
        <div className="mt-3 space-y-2">
          {modules.map((module) => (
            <div key={module.id} className="rounded border border-slate-700/70 bg-slate-950/60 p-3 text-sm text-slate-300">
              {module.name} Lv.{module.level}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
