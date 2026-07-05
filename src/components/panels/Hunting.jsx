import { useState } from "react";
import { PawPrint, Radar, Shield, Skull } from "lucide-react";
import BattleScene from "../common/BattleScene";
import { useCrewStore } from "../../stores/crewStore";
import { useGameStore } from "../../stores/gameStore";
import { useInventoryStore } from "../../stores/inventoryStore";
import { creatures } from "../../data/creatures";

function dangerTone(danger) {
  if (danger >= 5) return "hud-chip-danger";
  if (danger >= 3) return "hud-chip-warn";
  return "hud-chip-success";
}

function chanceTone(chance) {
  if (chance >= 70) return "hud-chip-success";
  if (chance >= 45) return "hud-chip-warn";
  return "hud-chip-danger";
}

export default function Hunting() {
  const [lastHunt, setLastHunt] = useState(null);
  const resources = useGameStore((state) => state.resources);
  const shipName = useGameStore((state) => state.shipName);
  const addResources = useGameStore((state) => state.addResources);
  const addLog = useGameStore((state) => state.addLog);
  const addItem = useInventoryStore((state) => state.addItem);
  const crew = useCrewStore((state) => state.crew);
  const applyCrewOutcome = useCrewStore((state) => state.applyCrewOutcome);
  const activeCrew = crew.filter((member) => member.alive !== false);

  const getScout = () => activeCrew.reduce((best, member) => ((member.stats.scouting ?? 0) > (best?.stats.scouting ?? 0) ? member : best), activeCrew[0]);

  const estimate = (creature) => {
    const scout = getScout();
    const score = (scout?.stats.scouting ?? 8) + (scout?.stats.gunnery ?? 8) + Math.round(resources.hull / 10);
    const target = 16 + creature.danger * 5;
    const chance = activeCrew.length === 0 ? 0 : Math.max(8, Math.min(92, Math.round(((score + 6) / target) * 62)));
    return { scout, score, target, chance };
  };

  const attemptHunt = (creature) => {
    if (activeCrew.length === 0) {
      addLog("사냥 실패: 생존 승무원이 없어 추적조를 편성할 수 없습니다.");
      return;
    }
    const { scout, score, target, chance } = estimate(creature);
    const roll = Math.floor(Math.random() * 12);
    const success = score + roll >= target;
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

    setLastHunt({ creature, scout, score, target, chance, roll, success, hullLoss, oxygenLoss });
  };

  const featuredCreature = lastHunt?.creature ?? creatures[Math.min(3, creatures.length - 1)];
  const featuredEstimate = featuredCreature ? estimate(featuredCreature) : null;
  const sceneLine = lastHunt
    ? lastHunt.success
      ? `${lastHunt.scout?.name ?? "정찰조"}가 ${lastHunt.creature.name}의 약점(${lastHunt.creature.weakness})을 포착. ${lastHunt.creature.reward} 회수 성공.`
      : `${lastHunt.creature.name}이 추적망을 찢고 반격. 선체 ${lastHunt.hullLoss}%, 산소 ${lastHunt.oxygenLoss}% 손실.`
    : "생체 신호가 화면에 잡힙니다. 목표를 선택하면 추적 장면이 중계됩니다.";

  return (
    <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
      <section>
        <div className="section-title">
          <PawPrint size={18} />
          사냥 미션
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {creatures.map((creature) => {
            const { scout, score, target, chance } = estimate(creature);
            return (
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
                  <span className={`hud-chip ${chanceTone(chance)}`}>예상 {chance}%</span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <Info label="정찰조" value={scout?.name ?? "없음"} />
                  <Info label="판정" value={`${score}/${target}`} />
                  <Info label="선체" value={`${Math.round(resources.hull)}%`} />
                </div>
                <button className="primary-button mt-4 w-full" disabled={activeCrew.length === 0} onClick={() => attemptHunt(creature)}>
                  추적 시작
                </button>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <div className="grid gap-4 xl:sticky xl:top-4">
          <BattleScene
            mode="hunting"
            title="생체 추적 장면"
            leftName={shipName}
            leftSub={`정찰조 ${featuredEstimate?.scout?.name ?? "대기"} · 판정 ${featuredEstimate?.score ?? 0}/${featuredEstimate?.target ?? 0}`}
            rightName={featuredCreature?.name ?? "미확인 생명체"}
            rightSub={featuredCreature ? `위험 ${featuredCreature.danger} · 약점 ${featuredCreature.weakness}` : "목표 없음"}
            status={lastHunt ? (lastHunt.success ? "success" : "failed") : "standby"}
            directive={lastHunt ? (lastHunt.success ? "capture" : "counter") : "tracking"}
            eventLine={sceneLine}
            intensity={lastHunt ? Math.max(20, lastHunt.creature.danger * 18) : 12}
            leftTone="emerald"
            rightTone={lastHunt?.success ? "slate" : featuredCreature?.danger >= 5 ? "violet" : "amber"}
            leftStats={[
              { label: "선체", value: `${Math.round(resources.hull)}%`, percent: resources.hull },
              { label: "산소", value: `${Math.round(resources.oxygen)}%`, percent: resources.oxygen },
              { label: "예상", value: `${featuredEstimate?.chance ?? 0}%`, percent: featuredEstimate?.chance ?? 0 },
            ]}
            rightStats={[
              { label: "위험", value: featuredCreature ? `${featuredCreature.danger}` : "-", percent: featuredCreature ? Math.min(100, featuredCreature.danger * 14) : 0 },
              { label: "전리품", value: featuredCreature?.itemId ?? "-" },
              { label: "최근 판정", value: lastHunt ? `${lastHunt.score}+${lastHunt.roll}/${lastHunt.target}` : "대기" },
            ]}
          />

          <div className="grid gap-3 sm:grid-cols-3">
            <Metric icon={Radar} label="추적 대상" value={featuredCreature?.name ?? "없음"} />
            <Metric icon={Skull} label="위험도" value={featuredCreature?.danger ?? "-"} />
            <Metric icon={Shield} label="최근 결과" value={lastHunt ? (lastHunt.success ? "성공" : "실패") : activeCrew.length === 0 ? "승무원 없음" : "대기"} />
          </div>
        </div>
      </section>
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div className="rounded border border-slate-700/70 bg-slate-900/70 px-2 py-2">
      <div className="hud-label truncate">{label}</div>
      <div className="hud-value mt-1 truncate">{value}</div>
    </div>
  );
}

function Metric({ icon: Icon, label, value }) {
  return (
    <div className="rounded border border-slate-700/70 bg-slate-950/60 p-3">
      <div className="flex items-center gap-2 text-slate-400">
        <Icon size={14} />
        <span className="hud-label">{label}</span>
      </div>
      <div className="hud-value mt-1 truncate">{value}</div>
    </div>
  );
}
