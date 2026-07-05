import { Crosshair, Shield, Skull, Zap } from "lucide-react";
import { useMemo, useState } from "react";
import {
  calculateCombatPower,
  createCombatState,
  getCombatDirectiveResult,
  pickEnemyFleet,
  resolveCombatRound,
} from "../../systems/combatEngine";
import { getAllZones } from "../../data/sectors";
import { useCrewStore } from "../../stores/crewStore";
import { useExplorationStore } from "../../stores/explorationStore";
import { useGameStore } from "../../stores/gameStore";
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
  const [feed, setFeed] = useState(["교전 대기 중. 위험 구역을 기준으로 모의 적 함대를 생성할 수 있습니다."]);
  const [combat, setCombat] = useState(null);
  const installedModules = useShipStore((state) => state.getInstalledModules());
  const crew = useCrewStore((state) => state.crew);
  const applyCrewOutcome = useCrewStore((state) => state.applyCrewOutcome);
  const discoveredZoneIds = useExplorationStore((state) => state.discoveredZoneIds);
  const resources = useGameStore((state) => state.resources);
  const addResources = useGameStore((state) => state.addResources);
  const addLog = useGameStore((state) => state.addLog);
  const cards = useInventoryStore((state) => state.cards);
  const activeCardIds = useInventoryStore((state) => state.activeCardIds);
  const activeCards = useMemo(
    () => cards.filter((card) => activeCardIds.includes(card.instanceId)),
    [cards, activeCardIds],
  );
  const power = calculateCombatPower({ modules: installedModules, crew, activeCards });
  const maxDanger = Math.max(
    1,
    ...getAllZones().filter((zone) => discoveredZoneIds.includes(zone.id)).map((zone) => zone.danger),
  );

  const pushFeed = (lines) => {
    setFeed((current) => [...lines, ...current].slice(0, 14));
    lines.forEach((line) => addLog(`전투: ${line}`));
  };

  const startEncounter = () => {
    const enemy = pickEnemyFleet(maxDanger);
    const next = createCombatState(enemy);
    setCombat(next);
    pushFeed([`${enemy.name} 식별. 위협도 ${enemy.risk}, 교전력 ${enemy.power}.`, "함교가 전술 지시를 기다립니다."]);
  };

  const issueDirective = (directive) => {
    if (!combat || combat.status !== "engaged") {
      pushFeed([getCombatDirectiveResult(directive), "교전이 없어 훈련 중계만 기록됩니다."]);
      return;
    }
    const result = resolveCombatRound({ directive, combat, power });
    setCombat(result.combat);
    addResources(result.resourceChanges);

    const lead = crew[Math.floor(Math.random() * crew.length)];
    if (lead) {
      applyCrewOutcome({ memberId: lead.id, fatigue: 6, experience: 5, morale: result.combat.status === "won" ? 1 : 0 });
    }

    pushFeed(result.logs);
  };

  const resetCombat = () => {
    setCombat(null);
    pushFeed(["전투 브리핑을 초기화했습니다."]);
  };

  const enemy = combat?.enemy;
  const enemyHull = enemy ? Math.round((enemy.hullNow / enemy.hull) * 100) : 0;
  const enemyShield = enemy ? Math.round((enemy.shieldNow / enemy.shield) * 100) : 0;

  return (
    <div className="grid gap-4 lg:h-full lg:grid-cols-[0.85fr_1.15fr]">
      <section>
        <div className="section-title">
          <Crosshair size={18} />
          전투 지시
        </div>
        <div className="mt-5 text-5xl font-bold text-cyan-100">{power}</div>
        <p className="mt-2 text-sm text-slate-400">함선, 승무원, 활성 카드 기준 전투력입니다.</p>

        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <Metric icon={Shield} label="선체" value={`${Math.round(resources.hull)}%`} />
          <Metric icon={Zap} label="연료" value={`${Math.round(resources.fuel)}%`} />
          <Metric icon={Skull} label="위험" value={`${maxDanger}`} />
        </div>

        <div className="mt-5 rounded border border-slate-700/70 bg-slate-950/60 p-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="hud-label">교전 대상</div>
              <div className="font-semibold text-slate-100">{enemy?.name ?? "없음"}</div>
            </div>
            <span className={`hud-chip ${combat?.status === "won" ? "hud-chip-success" : combat?.status === "engaged" ? "hud-chip-warn" : ""}`}>
              {combat?.status ?? "standby"}
            </span>
          </div>
          {enemy && (
            <div className="mt-4 space-y-3">
              <Gauge label="적 방어막" value={enemyShield} />
              <Gauge label="적 선체" value={enemyHull} />
              <div className="text-xs text-slate-500">보상 ₢ {enemy.reward} · 교전력 {enemy.power}</div>
            </div>
          )}
          <button className="primary-button mt-4 w-full" onClick={startEncounter}>
            새 교전 생성
          </button>
          {combat && (
            <button className="secondary-button mt-2 w-full" onClick={resetCombat}>
              브리핑 초기화
            </button>
          )}
        </div>

        <div className="mt-4 grid gap-2">
          {directives.map(([id, label]) => (
            <button key={id} className="secondary-button" onClick={() => issueDirective(id)}>
              {label}
            </button>
          ))}
        </div>
      </section>
      <section>
        <div className="section-title">FM식 전투 중계</div>
        <div className="mt-4 max-h-[32rem] overflow-auto rounded border border-slate-700 bg-slate-950 p-4 lg:h-[calc(100%-2.5rem)] lg:max-h-none">
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

function Metric({ icon: Icon, label, value }) {
  return (
    <div className="rounded border border-slate-700/70 bg-slate-950/60 p-3">
      <div className="flex items-center gap-2 text-slate-400">
        <Icon size={14} />
        <span className="hud-label">{label}</span>
      </div>
      <div className="hud-value mt-1">{value}</div>
    </div>
  );
}

function Gauge({ label, value }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="hud-label">{label}</span>
        <span className="hud-value">{value}%</span>
      </div>
      <div className="hud-gauge">
        <span className="hud-gauge-fill" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}
