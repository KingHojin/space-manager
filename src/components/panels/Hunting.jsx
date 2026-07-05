import { PawPrint } from "lucide-react";
import { useCrewStore } from "../../stores/crewStore";
import { useGameStore } from "../../stores/gameStore";
import { useInventoryStore } from "../../stores/inventoryStore";
import { creatures } from "../../data/creatures";

function dangerTone(danger) {
  if (danger >= 5) return "hud-chip-danger";
  if (danger >= 3) return "hud-chip-warn";
  return "hud-chip-success";
}

export default function Hunting() {
  const resources = useGameStore((state) => state.resources);
  const addResources = useGameStore((state) => state.addResources);
  const addLog = useGameStore((state) => state.addLog);
  const addItem = useInventoryStore((state) => state.addItem);
  const crew = useCrewStore((state) => state.crew);
  const applyCrewOutcome = useCrewStore((state) => state.applyCrewOutcome);

  const attemptHunt = (creature) => {
    const scout = crew.reduce((best, member) => ((member.stats.scouting ?? 0) > (best?.stats.scouting ?? 0) ? member : best), crew[0]);
    const score = (scout?.stats.scouting ?? 8) + (scout?.stats.gunnery ?? 8) + Math.round(resources.hull / 10);
    const target = 16 + creature.danger * 5;
    const success = score + Math.floor(Math.random() * 12) >= target;
    const hullLoss = success ? Math.max(1, creature.danger - 1) : creature.danger * 3;
    const oxygenLoss = Math.max(1, Math.round(creature.danger / 2));

    addResources({ hull: -hullLoss, oxygen: -oxygenLoss });
    if (scout) applyCrewOutcome({ memberId: scout.id, fatigue: 7 + creature.danger, experience: success ? 8 : 4, morale: success ? 1 : -1, injury: success ? null : "경상" });

    if (success) {
      addResources({ credits: creature.credits });
      addItem(creature.itemId, 1);
      addLog(`사냥 성공: ${creature.name} 회수. ${creature.reward}, 크레딧 +${creature.credits}, 선체 -${hullLoss}.`);
    } else {
      addLog(`사냥 실패: ${creature.name} 추적 중 손상 발생. 선체 -${hullLoss}, 산소 -${oxygenLoss}.`);
    }
  };

  return (
    <section>
      <div className="section-title">
        <PawPrint size={18} />
        사냥 미션
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {creatures.map((creature) => (
          <div key={creature.id} className="rounded border border-slate-700/70 bg-slate-950/60 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-semibold text-slate-100">{creature.name}</div>
                <p className="mt-1 text-sm text-slate-400">약점: {creature.weakness}</p>
              </div>
              <span className={`hud-chip ${dangerTone(creature.danger)}`}>위험 {creature.danger}</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <span className="hud-chip">보상 {creature.reward}</span>
              <span className="hud-chip">₢ {creature.credits}</span>
              <span className="hud-chip">{creature.itemId}</span>
            </div>
            <button className="primary-button mt-4 w-full" onClick={() => attemptHunt(creature)}>
              추적 시작
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
