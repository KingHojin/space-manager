import { AlertTriangle, Crosshair, Shield, Skull, Swords, Target, Zap } from "lucide-react";
import { useMemo, useState } from "react";
import BattleScene from "../common/BattleScene";
import { ActionCard, FeedList, GaugeBar, StatTile } from "../ui/VisualPrimitives";
import {
  COMBAT_TARGETS,
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
import { useNavStore } from "../../stores/navStore";
import { useShipStore } from "../../stores/shipStore";

const directives = [
  ["attack", "공격 집중", "⌖", "화력 우선"],
  ["evade", "회피 기동", "↯", "피해 감소"],
  ["shield", "방어막 강화", "◈", "생존 우선"],
  ["retreat", "도주 시도", "↩", "이탈"],
  ["skill", "카드 발동", "✦", "변수 창출"],
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

function ThreatPoster({ enemy, pendingCombatEncounter, combat, travelLocked }) {
  const status = combat?.status ?? (pendingCombatEncounter ? "urgent" : travelLocked ? "locked" : "standby");
  const label = enemy?.name ?? pendingCombatEncounter?.title ?? "교전 없음";
  const threat = enemy ? Math.max(8, Math.min(100, enemy.risk * 18)) : pendingCombatEncounter ? 78 : 18;
  return (
    <div className="mission-poster mission-art-bounty">
      <div className="mission-poster-grid" />
      <div className="mission-poster-orbit" />
      <div className="mission-poster-ship" />
      <div className="mission-poster-emblem"><Swords size={24} /></div>
      <div className="mission-poster-label">TACTICAL</div>
      <div className="absolute bottom-10 left-3 right-3 z-10">
        <div className="truncate text-lg font-black text-slate-50">{label}</div>
        <div className="mt-1 flex flex-wrap gap-1.5"><span className="hud-chip bg-slate-950/70">{status}</span>{enemy && <span className="hud-chip bg-slate-950/70">PWR {enemy.power}</span>}</div>
      </div>
      <div className="mission-poster-risk"><span style={{ width: `${threat}%` }} /></div>
    </div>
  );
}

function TargetCard({ target, active, disabled, onSelect }) {
  return (
    <button className={`rounded-2xl border p-3 text-left transition ${active ? "border-cyan-300 bg-cyan-300/15 shadow-[0_0_20px_rgba(34,211,238,0.16)]" : "border-slate-700/70 bg-slate-950/65 hover:border-cyan-300/70"} disabled:opacity-45`} disabled={disabled} onClick={() => onSelect(target.id)}>
      <div className="flex items-center justify-between gap-2"><span className="grid h-9 w-9 place-items-center rounded-xl border border-cyan-300/25 bg-cyan-300/10 text-lg text-cyan-100">{target.icon}</span>{active && <span className="hud-chip hud-chip-accent">LOCK</span>}</div>
      <div className="mt-2 font-black text-slate-50">{target.label}</div>
      <div className="mt-1 line-clamp-2 text-xs leading-5 text-slate-400">{target.desc}</div>
    </button>
  );
}

export default function Combat() {
  const [feed, setFeed] = useState(["교전 대기 중. 전투는 조우나 명시적 출격 상황에서만 시작됩니다."]);
  const [combat, setCombat] = useState(null);
  const [targetId, setTargetId] = useState("hull");
  const installedModules = useShipStore((state) => state.getInstalledModules());
  const crew = useCrewStore((state) => state.crew);
  const applyCrewOutcome = useCrewStore((state) => state.applyCrewOutcome);
  const applyCombatCasualty = useCrewStore((state) => state.applyCombatCasualty);
  const discoveredZoneIds = useExplorationStore((state) => state.discoveredZoneIds);
  const legacyTravel = useExplorationStore((state) => state.activeTravel);
  const navTravel = useNavStore((state) => state.travel);
  const pendingCombatEncounter = useExplorationStore((state) => state.pendingCombatEncounter);
  const clearPendingCombatEncounter = useExplorationStore((state) => state.clearPendingCombatEncounter);
  const resources = useGameStore((state) => state.resources);
  const shipName = useGameStore((state) => state.shipName);
  const setPaused = useGameStore((state) => state.setPaused);
  const addResources = useGameStore((state) => state.addResources);
  const addLog = useGameStore((state) => state.addLog);
  const cards = useInventoryStore((state) => state.cards);
  const activeCardIds = useInventoryStore((state) => state.activeCardIds);
  const addItem = useInventoryStore((state) => state.addItem);
  const activeCrew = crew.filter((member) => member.alive !== false);
  const fallenCrew = crew.filter((member) => member.alive === false);
  const activeCards = useMemo(() => cards.filter((card) => activeCardIds.includes(card.instanceId)), [cards, activeCardIds]);
  const power = calculateCombatPower({ modules: installedModules, crew, activeCards });
  const maxDanger = Math.max(1, ...getAllZones().filter((zone) => discoveredZoneIds.includes(zone.id)).map((zone) => zone.danger));
  const activeTravel = legacyTravel ?? navTravel;
  const combatEngaged = combat?.status === "engaged";
  const travelLocked = Boolean(activeTravel && !pendingCombatEncounter && !combatEngaged);
  const selectedTarget = COMBAT_TARGETS[targetId] ?? COMBAT_TARGETS.hull;

  const pushFeed = (lines) => {
    setFeed((current) => [...lines, ...current].slice(0, 14));
    lines.forEach((line) => addLog(`전투: ${line}`));
  };

  const startEncounter = () => {
    if (travelLocked) return pushFeed(["작전 제한: 항해 중에는 임의 교전을 시작할 수 없습니다."]);
    if (activeCrew.length === 0) return pushFeed(["출격 불가: 생존 승무원이 없습니다."]);
    const danger = pendingCombatEncounter?.danger ?? maxDanger;
    const enemy = pickEnemyFleet(danger);
    const next = createCombatState(enemy);
    setCombat(next);
    setTargetId("hull");
    if (pendingCombatEncounter) {
      clearPendingCombatEncounter();
      pushFeed([`긴급 항해 교전 대응: ${pendingCombatEncounter.title}`, `${enemy.name} 식별. 위협도 ${enemy.risk}, 교전력 ${enemy.power}.`, "타겟 서브시스템과 전술 지시를 함께 선택하세요."]);
    } else {
      pushFeed([`${enemy.name} 식별. 위협도 ${enemy.risk}, 교전력 ${enemy.power}.`, "타겟 서브시스템과 전술 지시를 함께 선택하세요."]);
    }
  };

  const issueDirective = (directive) => {
    if (!combat || combat.status !== "engaged") return pushFeed([getCombatDirectiveResult(directive), travelLocked ? "항해 중이라 훈련 교전도 제한됩니다." : "교전이 없어 훈련 중계만 기록됩니다."]);
    if (activeCrew.length === 0) return pushFeed(["지시 불가: 생존 승무원이 없습니다."]);
    const result = resolveCombatRound({ directive, combat, power, targetId });
    setCombat(result.combat);
    addResources(result.resourceChanges);
    if (result.loot) addItem(result.loot.itemId, result.loot.qty);
    const lead = activeCrew[Math.floor(Math.random() * activeCrew.length)];
    if (lead) applyCrewOutcome({ memberId: lead.id, fatigue: 6, experience: 5, morale: result.combat.status === "won" ? 1 : 0 });
    const casualty = rollCrewCasualty({ crew, enemy: combat.enemy, directive, hullDamage: Math.abs(result.resourceChanges.hull ?? 0), shipHull: resources.hull + (result.resourceChanges.hull ?? 0) });
    const casualtyLogs = [];
    if (casualty) {
      applyCombatCasualty({ memberId: casualty.member.id, injury: casualty.injury, morale: casualty.injury === "전사" ? -3 : -1 });
      casualtyLogs.push(casualty.injury === "전사" ? `치명적 손실: ${casualty.member.name} 전사. 추정 사망 위험 ${casualty.risk}%.` : `승무원 피해: ${casualty.member.name} ${casualty.injury}. 추정 부상 위험 ${casualty.risk}%.`);
    }
    if (result.combat.status === "won" && activeTravel) {
      casualtyLogs.push("긴급 교전 종료. 항해를 계속 진행할 수 있습니다.");
      setPaused(false);
    }
    if (result.combat.status === "lost" && activeTravel) casualtyLogs.push("항해 중 교전 패배. 함선 피해가 누적되어 항해 지속이 매우 위험합니다.");
    pushFeed([...result.logs, ...casualtyLogs]);
  };

  const resetCombat = () => {
    setCombat(null);
    setTargetId("hull");
    pushFeed(["전투 브리핑을 초기화했습니다."]);
  };

  const enemy = combat?.enemy;
  const enemyHull = enemy ? Math.round((enemy.hullNow / enemy.hull) * 100) : 0;
  const enemyShield = enemy ? Math.round((enemy.shieldNow / enemy.shield) * 100) : 0;
  const eventLine = feed[0] ?? "함교가 다음 지시를 기다립니다.";
  const canStart = activeCrew.length > 0 && !travelLocked && !combatEngaged;
  const canIssueDirective = activeCrew.length > 0 && combatEngaged;

  return (
    <div className="grid gap-4 lg:h-full lg:grid-cols-[0.9fr_1.1fr]">
      <section>
        <div className="flex items-start justify-between gap-3"><div><div className="section-title"><Crosshair size={18} />전술 콘솔</div><p className="mt-2 text-sm text-slate-400">타겟 서브시스템과 전술 지시를 조합해 교전을 결재합니다.</p></div><span className="hud-chip hud-chip-accent">PWR {power}</span></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-[0.95fr_1.05fr]"><ThreatPoster enemy={enemy} pendingCombatEncounter={pendingCombatEncounter} combat={combat} travelLocked={travelLocked} /><div className="grid grid-cols-3 gap-2"><StatTile icon={Shield} label="선체" value={`${Math.round(resources.hull)}%`} /><StatTile icon={Zap} label="연료" value={`${Math.round(resources.fuel)}%`} /><StatTile icon={Skull} label="생존/전사" value={`${activeCrew.length}/${fallenCrew.length}`} /></div></div>
        {activeTravel && <div className={`mt-4 rounded-2xl border p-3 text-sm ${pendingCombatEncounter || combatEngaged ? "border-red-400/40 bg-red-400/10 text-red-100" : "border-amber-300/35 bg-amber-300/10 text-amber-100"}`}><div className="flex items-center gap-2 font-bold"><AlertTriangle size={16} />{pendingCombatEncounter || combatEngaged ? "항해 중 긴급 교전" : "항해 작전 진행 중"}</div></div>}
        <div className="mt-4 rounded-2xl border border-slate-700/70 bg-slate-950/60 p-4">
          <div className="flex items-center justify-between gap-2"><div><div className="hud-label">교전 대상</div><div className="font-black text-slate-100">{enemy?.name ?? (pendingCombatEncounter ? pendingCombatEncounter.title : "없음")}</div></div><span className={`hud-chip ${combat?.status === "won" ? "hud-chip-success" : combat?.status === "engaged" || pendingCombatEncounter ? "hud-chip-warn" : ""}`}>{combat?.status ?? (pendingCombatEncounter ? "urgent" : travelLocked ? "locked" : "standby")}</span></div>
          {enemy && <div className="mt-4 space-y-3"><GaugeBar label="적 방어막" value={enemyShield} /><GaugeBar label="적 선체" value={enemyHull} /><div className="flex flex-wrap gap-1.5 text-xs"><span className="mission-reward-icon">₢ {enemy.reward}</span><span className="mission-reward-icon">PWR {enemy.power}</span><span className="mission-reward-icon">전리품 {enemy.lootItemId ?? "-"}</span><span className="mission-reward-icon">타겟 {selectedTarget.label}</span></div></div>}
          <button className="primary-button mt-4 w-full justify-center" disabled={!canStart} onClick={startEncounter}>{combatEngaged ? "교전 진행 중" : pendingCombatEncounter ? "긴급 교전 대응" : travelLocked ? "항해 중 수동 교전 불가" : "새 교전 생성"}</button>
          {combat && <button className="secondary-button mt-2 w-full justify-center" onClick={resetCombat}>브리핑 초기화</button>}
        </div>
        <section className="mt-4 rounded-2xl border border-cyan-300/25 bg-cyan-300/10 p-3"><div className="section-title"><Target size={16} />타겟 서브시스템</div><div className="mt-3 grid grid-cols-2 gap-2">{Object.values(COMBAT_TARGETS).map((target) => <TargetCard key={target.id} target={target} active={target.id === targetId} disabled={!combatEngaged} onSelect={setTargetId} />)}</div></section>
        <div className="mt-4 grid grid-cols-2 gap-2">{directives.map(([id, label, icon, desc]) => <ActionCard key={id} icon={icon} title={label} desc={`${desc} · ${selectedTarget.label} 조준`} disabled={!canIssueDirective} onClick={() => issueDirective(id)} />)}</div>
      </section>
      <section>
        <div className="grid gap-4 lg:h-full lg:grid-rows-[auto_minmax(0,1fr)_auto]">
          <div className="rounded-2xl border border-slate-700/70 bg-slate-950/60 p-4"><div className="hud-label">전술 상황</div><div className="mt-2 text-lg font-black text-slate-50">{shipName}</div><div className="mt-1 line-clamp-2 text-sm text-slate-300">{eventLine}</div></div>
          <BattleScene combat={combat} power={power} />
          <section className="rounded-2xl border border-red-400/25 bg-red-400/10 p-3"><div className="section-title"><AlertTriangle size={16} />전투 피드</div><div className="mt-3"><FeedList entries={feed} /></div></section>
        </div>
      </section>
    </div>
  );
}
