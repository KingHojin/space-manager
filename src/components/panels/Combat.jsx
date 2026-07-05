import { Crosshair, Shield, Skull, Zap } from "lucide-react";
import { useMemo, useState } from "react";
import BattleScene from "../common/BattleScene";
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

function rollCrewCasualty({ crew, enemy, directive, hullDamage, shipHull }) {
  const activeCrew = crew.filter((member) => member.alive !== false);
  if (!enemy || activeCrew.length === 0 || hullDamage <= 0) return null;

  const target = activeCrew[Math.floor(Math.random() * activeCrew.length)];
  const directiveModifier = directive === "shield" ? -0.035 : directive === "evade" ? -0.025 : directive === "attack" ? 0.02 : 0;
  const hullModifier = shipHull <= 25 ? 0.055 : shipHull <= 45 ? 0.025 : 0;
  const baseRisk = 0.025 + enemy.risk * 0.009 + Math.min(0.06, hullDamage / 260) + directiveModifier + hullModifier;
  const deathRisk = Math.max(0.006, Math.min(0.12, baseRisk * 0.38));
  const woundRisk = Math.max(0.08, Math.min(0.34, baseRisk * 2.2));
  const roll = Math.random();

  if (roll < deathRisk) return { member: target, injury: "전사", risk: Math.round(deathRisk * 100) };
  if (roll < deathRisk + woundRisk * 0.42) return { member: target, injury: "중상", risk: Math.round((deathRisk + woundRisk) * 100) };
  if (roll < deathRisk + woundRisk) return { member: target, injury: "경상", risk: Math.round((deathRisk + woundRisk) * 100) };
  return null;
}

export default function Combat() {
  const [feed, setFeed] = useState(["교전 대기 중. 위험 구역을 기준으로 모의 적 함대를 생성할 수 있습니다."]);
  const [combat, setCombat] = useState(null);
  const installedModules = useShipStore((state) => state.getInstalledModules());
  const crew = useCrewStore((state) => state.crew);
  const applyCrewOutcome = useCrewStore((state) => state.applyCrewOutcome);
  const applyCombatCasualty = useCrewStore((state) => state.applyCombatCasualty);
  const discoveredZoneIds = useExplorationStore((state) => state.discoveredZoneIds);
  const resources = useGameStore((state) => state.resources);
  const shipName = useGameStore((state) => state.shipName);
  const addResources = useGameStore((state) => state.addResources);
  const addLog = useGameStore((state) => state.addLog);
  const cards = useInventoryStore((state) => state.cards);
  const activeCardIds = useInventoryStore((state) => state.activeCardIds);
  const addItem = useInventoryStore((state) => state.addItem);
  const activeCrew = crew.filter((member) => member.alive !== false);
  const fallenCrew = crew.filter((member) => member.alive === false);
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
    if (activeCrew.length === 0) {
      pushFeed(["출격 불가: 생존 승무원이 없습니다."]);
      return;
    }
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
    if (activeCrew.length === 0) {
      pushFeed(["지시 불가: 생존 승무원이 없습니다."]);
      return;
    }

    const result = resolveCombatRound({ directive, combat, power });
    setCombat(result.combat);
    addResources(result.resourceChanges);
    if (result.loot) addItem(result.loot.itemId, result.loot.qty);

    const lead = activeCrew[Math.floor(Math.random() * activeCrew.length)];
    if (lead) {
      applyCrewOutcome({ memberId: lead.id, fatigue: 6, experience: 5, morale: result.combat.status === "won" ? 1 : 0 });
    }

    const casualty = rollCrewCasualty({
      crew,
      enemy: combat.enemy,
      directive,
      hullDamage: Math.abs(result.resourceChanges.hull ?? 0),
      shipHull: resources.hull + (result.resourceChanges.hull ?? 0),
    });
    const casualtyLogs = [];
    if (casualty) {
      applyCombatCasualty({ memberId: casualty.member.id, injury: casualty.injury, morale: casualty.injury === "전사" ? -3 : -1 });
      casualtyLogs.push(
        casualty.injury === "전사"
          ? `치명적 손실: ${casualty.member.name} 전사. 추정 사망 위험 ${casualty.risk}%.`
          : `승무원 피해: ${casualty.member.name} ${casualty.injury}. 추정 부상 위험 ${casualty.risk}%.`,
      );
    }

    pushFeed([...result.logs, ...casualtyLogs]);
  };

  const resetCombat = () => {
    setCombat(null);
    pushFeed(["전투 브리핑을 초기화했습니다."]);
  };

  const enemy = combat?.enemy;
  const enemyHull = enemy ? Math.round((enemy.hullNow / enemy.hull) * 100) : 0;
  const enemyShield = enemy ? Math.round((enemy.shieldNow / enemy.shield) * 100) : 0;
  const eventLine = feed[0] ?? "함교가 다음 지시를 기다립니다.";

  return (
    <div className="grid gap-4 lg:h-full lg:grid-cols-[0.85fr_1.15fr]">
      <section>
        <div className="section-title">
          <Crosshair size={18} />
          전투 지시
        </div>
        <div className="mt-5 text-5xl font-bold text-cyan-100">{power}</div>
        <p className="mt-2 text-sm text-slate-400">함선, 생존 승무원, 활성 카드 기준 전투력입니다.</p>

        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <Metric icon={Shield} label="선체" value={`${Math.round(resources.hull)}%`} />
          <Metric icon={Zap} label="연료" value={`${Math.round(resources.fuel)}%`} />
          <Metric icon={Skull} label="생존/전사" value={`${activeCrew.length}/${fallenCrew.length}`} />
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
              <div className="text-xs text-slate-500">보상 ₢ {enemy.reward} · 교전력 {enemy.power} · 전리품 {enemy.lootItemId ?? "-"}</div>
            </div>
          )}
          <button className="primary-button mt-4 w-full" disabled={activeCrew.length === 0} onClick={startEncounter}>
            새 교전 생성
          </button>
          {combat && (
            <button className="secondary-button mt-2 w-full" onClick={resetCombat}>
              브리핑 초기화
            </button>
          )}
        </div>

        <div className="mt-4 rounded border border-red-400/25 bg-red-400/10 p-3 text-xs leading-5 text-red-100">
          XCOM식 승무원 리스크: 적 위험도, 선체 피해, 현재 선체 상태, 지시에 따라 경상/중상/전사 판정이 발생합니다. 방어막 강화와 회피 기동은 위험을 낮춥니다.
        </div>

        <div className="mt-4 grid gap-2">
          {directives.map(([id, label]) => (
            <button key={id} className="secondary-button" disabled={activeCrew.length === 0} onClick={() => issueDirective(id)}>
              {label}
            </button>
          ))}
        </div>
      </section>
      <section>
        <div className="grid gap-4 lg:h-full lg:grid-rows-[auto_minmax(0,1fr)]">
          <BattleScene
            mode="combat"
            title="함대 교전 장면"
            leftName={shipName}
            leftSub={`전투력 ${power} · 생존 승무원 ${activeCrew.length}`}
            rightName={enemy?.name ?? "미확인 적 함대"}
            rightSub={enemy ? `위협도 ${enemy.risk} · 교전력 ${enemy.power}` : "새 교전을 생성하면 목표가 표시됩니다."}
            status={combat?.status ?? "standby"}
            directive={combat?.lastDirective ?? "standby"}
            eventLine={eventLine}
            intensity={combat?.lastDamage ?? 0}
            leftTone="cyan"
            rightTone={combat?.status === "won" ? "slate" : "red"}
            leftStats={[
              { label: "선체", value: `${Math.round(resources.hull)}%`, percent: resources.hull },
              { label: "연료", value: `${Math.round(resources.fuel)}%`, percent: resources.fuel },
              { label: "피해", value: combat?.lastTaken ? `-${combat.lastTaken}%` : "대기" },
            ]}
            rightStats={[
              { label: "방어막", value: enemy ? `${enemyShield}%` : "-", percent: enemy ? enemyShield : 0 },
              { label: "선체", value: enemy ? `${enemyHull}%` : "-", percent: enemy ? enemyHull : 0 },
              { label: "최근 피해", value: combat?.lastDamage ? `${combat.lastDamage}` : "대기" },
            ]}
          />

          <div>
            <div className="section-title">FM식 전투 중계</div>
            <div className="mt-4 max-h-[32rem] overflow-auto rounded border border-slate-700 bg-slate-950 p-4 lg:h-[calc(100%-2.5rem)] lg:max-h-none">
              {feed.map((line, index) => (
                <div key={`${line}-${index}`} className="border-b border-slate-800 py-3 text-sm text-slate-300 last:border-b-0">
                  {line}
                </div>
              ))}
            </div>
          </div>
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
