import { AlertTriangle, Crosshair, Shield, Skull, Swords, Target, Users, Zap } from "lucide-react";
import { useMemo } from "react";
import BattleScene from "../common/BattleScene";
import { ActionCard, FeedList, StatTile } from "../ui/VisualPrimitives";
import {
  COMBAT_TARGETS,
  TACTICAL_STATIONS,
  autoAssignTacticalCrew,
  calculateCombatPower,
  calculateTacticalCrewBonus,
  createCombatState,
  getActiveEnemySubsystems,
  getCombatDirectiveResult,
  pickEnemyFleet,
  resolveEnemyFleet,
  resolveCombatRound,
} from "../../systems/combatEngine";
import { getSectorProfile } from "../../systems/campaignProgression";
import { DUST } from "../../data/constants";
import { applyCombatCasualtyWithJobs } from "../../systems/gameClock";
import { buildCombatReport } from "../../systems/reportSystem";
import { useCombatStore } from "../../stores/combatStore";
import { useCrewStore } from "../../stores/crewStore";
import { useExplorationStore } from "../../stores/explorationStore";
import { useGameStore } from "../../stores/gameStore";
import { useInventoryStore } from "../../stores/inventoryStore";
import { useMissionStore } from "../../stores/missionStore";
import { useNavStore } from "../../stores/navStore";
import { useReportStore } from "../../stores/reportStore";
import { useShipStore } from "../../stores/shipStore";
import { useSkillStore } from "../../stores/skillStore";
import { getSkillEffects } from "../../systems/skillEffects";
import Hunting from "./Hunting";
import { reconcileMissionCombatOutcome } from "../../orchestration/missionEncounterOrchestrator";

const COMBAT_OUTCOME_META = {
  won: { outcome: "victory", priority: "high" },
  lost: { outcome: "defeat", priority: "critical" },
  retreated: { outcome: "fled", priority: "medium" },
};

const DEFAULT_FEED = ["교전 대기 중. 전투는 조우나 명시적 출격 상황에서만 시작됩니다."];

const directives = [
  ["attack", "공격 집중", "⌖", "화력 우선"],
  ["evade", "회피 기동", "↯", "피해 감소"],
  ["shield", "방어막 강화", "◈", "생존 우선"],
  ["retreat", "도주 시도", "↩", "이탈"],
  ["skill", "카드 발동", "✦", "변수 창출"],
];

function rollCrewCasualty({ crew, enemy, directive, hullDamage, shipHull, casualtyRiskMul = 1 }) {
  const activeCrew = crew.filter((member) => member.alive !== false);
  if (!enemy || activeCrew.length === 0 || hullDamage <= 0) return null;
  const target = activeCrew[Math.floor(Math.random() * activeCrew.length)];
  const directiveModifier = directive === "shield" ? -0.035 : directive === "evade" ? -0.025 : directive === "attack" ? 0.02 : 0;
  const hullModifier = shipHull <= 25 ? 0.055 : shipHull <= 45 ? 0.025 : 0;
  const baseRisk = (0.025 + enemy.risk * 0.009 + Math.min(0.06, hullDamage / 260) + directiveModifier + hullModifier) * casualtyRiskMul;
  const deathRisk = Math.max(0.006, Math.min(0.12, baseRisk * 0.38));
  const woundRisk = Math.max(0.08, Math.min(0.34, baseRisk * 2.2));
  const roll = Math.random();
  if (roll < deathRisk) return { member: target, injury: "전사", risk: Math.round(deathRisk * 100) };
  if (roll < deathRisk + woundRisk * 0.42) return { member: target, injury: "중상", risk: Math.round((deathRisk + woundRisk) * 100) };
  if (roll < deathRisk + woundRisk) return { member: target, injury: "경상", risk: Math.round((deathRisk + woundRisk) * 100) };
  return null;
}

function combatStatusChip(status, combatEngaged) {
  if (status === "won") return "hud-chip-success";
  if (status === "retreated" || status === "lost") return "hud-chip-danger";
  if (combatEngaged) return "hud-chip-warn";
  return "";
}

function missionCombatOutcomeLabel(status) {
  if (status === "won") return "승리";
  if (status === "retreated") return "퇴각";
  if (status === "lost") return "패배";
  return status;
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

function TacticalCrewPanel({ crew, assignments, bonus }) {
  const byId = new Map(crew.map((member) => [member.id, member]));
  return (
    <section className="mt-4 rounded-2xl border border-sky-300/25 bg-sky-300/10 p-3">
      <div className="flex items-center justify-between gap-2"><div className="section-title"><Users size={16} />전술 담당 승무원</div><span className="hud-chip hud-chip-accent">AUTO</span></div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {Object.values(TACTICAL_STATIONS).map((station) => {
          const member = byId.get(assignments[station.id]);
          const stat = member?.stats?.[station.stat] ?? 0;
          return (
            <div key={station.id} className="rounded-xl border border-slate-700/70 bg-slate-950/65 p-2">
              <div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="truncate text-xs font-black text-slate-100">{station.label}</div><div className="mt-0.5 truncate text-[11px] text-slate-400">{member?.name ?? "미배치"}</div></div><span className="hud-chip bg-slate-950/70">{station.stat} {stat}</span></div>
              <div className="mt-1 truncate text-[10px] text-slate-500">{station.desc}</div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5 text-xs"><span className="hud-chip">화력 x{(bonus.damageMul ?? 1).toFixed(2)}</span><span className="hud-chip">피해 x{(bonus.takenMul ?? 1).toFixed(2)}</span><span className="hud-chip">부상 x{(bonus.casualtyRiskMul ?? 1).toFixed(2)}</span></div>
    </section>
  );
}

function EnemySubsystemPanel({ enemy }) {
  const activeStates = getActiveEnemySubsystems(enemy);
  return (
    <section className="mt-3 rounded-2xl border border-violet-300/25 bg-violet-300/10 p-3">
      <div className="flex items-center justify-between gap-2"><div className="section-title"><Zap size={16} />적 서브시스템 상태</div><span className="hud-chip bg-slate-950/70">{activeStates.length || 0} ACTIVE</span></div>
      {activeStates.length > 0 ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {activeStates.map((state) => (
            <div key={state.key} className="rounded-xl border border-violet-300/25 bg-slate-950/65 p-2">
              <div className="flex items-center justify-between gap-2"><span className="font-black text-slate-100">{state.icon} {state.label}</span><span className="hud-chip hud-chip-accent">{state.turns}R</span></div>
              <div className="mt-1 text-[11px] text-slate-400">{state.desc}</div>
            </div>
          ))}
        </div>
      ) : <p className="mt-2 text-xs text-slate-400">아직 지속 교란 없음. 무장/엔진/방어막을 노리면 다음 라운드 전술 효과가 남습니다.</p>}
    </section>
  );
}

function combatOutcomeSummary({ isMissionCombat, won, failed }) {
  if (isMissionCombat && won) return "임무 전투에서 승리했습니다. 임무는 유지되며 탐사 화면에서 보상을 수령할 수 있습니다.";
  if (isMissionCombat && failed) return "임무 전투가 실패로 종료되어 계약이 실패 처리되었습니다. 새 임무를 고르거나 함선을 정비하세요.";
  if (won) return "교전에서 승리했습니다. 전리품과 피해 상황을 확인한 뒤 다음 작전을 준비하세요.";
  return "교전이 종료되었습니다. 피해와 승무원 상태를 점검한 뒤 브리핑을 정리하세요.";
}

function combatOutcomeNextAction({ isMissionCombat, won, failed }) {
  if (isMissionCombat && won) return "탐사 화면으로 복귀 → 임무 완료 보상 수령";
  if (isMissionCombat && failed) return "임무 게시판 확인 → 새 계약 선택 또는 정비";
  if (won) return "브리핑 초기화 → 다음 교전 또는 항해 준비";
  return "브리핑 초기화 → 함선/승무원 피해 점검";
}

function CombatOutcomeActions({ combat, onNavigate, onOpenModal, onResetCombat }) {
  if (!combat || combat.status === "engaged") return null;
  const isMissionCombat = combat.source?.kind === "missionEncounter";
  const won = combat.status === "won";
  const failed = combat.status === "retreated" || combat.status === "lost";
  if (!won && !failed) return null;
  const summary = combatOutcomeSummary({ isMissionCombat, won, failed });
  const nextAction = combatOutcomeNextAction({ isMissionCombat, won, failed });

  return (
    <section className={`mt-3 rounded-2xl border p-3 ${won ? "border-emerald-300/35 bg-emerald-300/10" : "border-red-300/35 bg-red-400/10"}`}>
      <div className="flex items-center justify-between gap-2"><div className="section-title"><CheckCircleIcon won={won} />전투 결과 처리</div><span className={`hud-chip ${won ? "hud-chip-success" : "hud-chip-danger"}`}>{missionCombatOutcomeLabel(combat.status)}</span></div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-700/70 bg-slate-950/65 p-3"><div className="hud-label">결과 요약</div><p className="mt-1 text-sm leading-6 text-slate-200">{summary}</p></div>
        <div className="rounded-xl border border-slate-700/70 bg-slate-950/65 p-3"><div className="hud-label">다음 행동</div><p className={`mt-1 text-sm font-bold leading-6 ${won ? "text-emerald-100" : "text-red-100"}`}>{nextAction}</p></div>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {isMissionCombat && won && <button className="primary-button justify-center" onClick={() => onNavigate?.("exploration")}>탐사로 돌아가 임무 완료</button>}
        {isMissionCombat && failed && <button className="primary-button justify-center" onClick={() => onOpenModal?.("missions")}>임무 게시판 열기</button>}
        <button className="secondary-button justify-center" onClick={onResetCombat}>브리핑 초기화</button>
      </div>
    </section>
  );
}

function CheckCircleIcon({ won }) {
  return <span className={`grid h-4 w-4 place-items-center rounded-full text-[10px] ${won ? "bg-emerald-300 text-emerald-950" : "bg-red-300 text-red-950"}`}>{won ? "✓" : "!"}</span>;
}

export default function Combat({ onNavigate, onOpenModal }) {
  const skillLevels = useSkillStore((state) => state.levels);
  const skillEffects = useMemo(() => getSkillEffects(skillLevels), [skillLevels]);
  const installedModules = useShipStore((state) => state.getInstalledModules());
  const activeVesselId = useShipStore((state) => state.activeVesselId);
  const crew = useCrewStore((state) => state.crew);
  const applyCrewOutcome = useCrewStore((state) => state.applyCrewOutcome);
  const activeTravel = useNavStore((state) => state.travel);
  const navSector = useNavStore((state) => state.sector);
  const sectorIndex = useNavStore((state) => state.sectorIndex ?? 0);
  const navDiscovered = useNavStore((state) => state.discovered ?? []);
  const pendingCombatEncounter = useExplorationStore((state) => state.pendingCombatEncounter);
  const clearPendingCombatEncounter = useExplorationStore((state) => state.clearPendingCombatEncounter);
  const currentMinute = useGameStore((state) => state.currentMinute);
  const resources = useGameStore((state) => state.resources);
  const shipName = useGameStore((state) => state.shipName);
  const setPaused = useGameStore((state) => state.setPaused);
  const addResources = useGameStore((state) => state.addResources);
  const addLog = useGameStore((state) => state.addLog);
  const cards = useInventoryStore((state) => state.cards);
  const activeCardIds = useInventoryStore((state) => state.activeCardIds);
  const addItem = useInventoryStore((state) => state.addItem);
  const addDust = useInventoryStore((state) => state.addDust);
  const failMission = useMissionStore((state) => state.failMission);
  const combat = useCombatStore((state) => state.combatByVesselId[activeVesselId] ?? null);
  const feed = useCombatStore((state) => state.feedByVesselId[activeVesselId] ?? DEFAULT_FEED);
  const targetId = useCombatStore((state) => state.targetByVesselId[activeVesselId] ?? "hull");
  const startCombatRecord = useCombatStore((state) => state.startCombat);
  const updateCombatRecord = useCombatStore((state) => state.updateCombat);
  const resetCombatRecord = useCombatStore((state) => state.resetCombat);
  const setTargetRecord = useCombatStore((state) => state.setTarget);
  const addCombatFeed = useCombatStore((state) => state.addFeed);
  const activeCrew = crew.filter((member) => member.alive !== false);
  const fallenCrew = crew.filter((member) => member.alive === false);
  const tacticalAssignments = useMemo(() => autoAssignTacticalCrew(activeCrew), [activeCrew]);
  const tacticalBonus = useMemo(() => calculateTacticalCrewBonus({ crew: activeCrew, assignments: tacticalAssignments }), [activeCrew, tacticalAssignments]);
  const activeCards = useMemo(() => cards.filter((card) => activeCardIds.includes(card.instanceId)), [cards, activeCardIds]);
  const power = calculateCombatPower({ modules: installedModules, crew, activeCards });
  // Live danger ceiling — see docs/NEXT_CHAT_HANDOFF.md "알려진 지뢰": the old
  // explorationStore.discoveredZoneIds is a dead field frozen at its initial
  // value (["anchor-station", "blue-drift"], danger 1/2) since Phase 18-C, so
  // this used to always feed pickEnemyFleet(danger) a fixed ceiling of 2
  // regardless of actual exploration progress. navStore's sector/discovered
  // reflect the real, currently-updating navigation state.
  const maxDanger = Math.max(1, ...(navSector?.nodes ?? []).filter((node) => navDiscovered.includes(node.id)).map((node) => node.danger));
  const sectorProfile = getSectorProfile(sectorIndex);
  const combatEngaged = combat?.status === "engaged";
  const combatTerminal = Boolean(combat && ["won", "retreated", "lost"].includes(combat.status));
  const travelLocked = Boolean(activeTravel && !pendingCombatEncounter && !combatEngaged);
  const selectedTarget = COMBAT_TARGETS[targetId] ?? COMBAT_TARGETS.hull;

  const pushFeed = (lines) => {
    addCombatFeed({ vesselId: activeVesselId, lines });
    lines.forEach((line) => addLog(`전투: ${line}`));
  };

  const startEncounter = () => {
    if (travelLocked) return pushFeed(["작전 제한: 항해 중에는 임의 교전을 시작할 수 없습니다."]);
    if (activeCrew.length === 0) return pushFeed(["출격 불가: 생존 승무원이 없습니다."]);
    const danger = pendingCombatEncounter?.danger ?? maxDanger;
    const enemy = pendingCombatEncounter?.enemyId
      ? resolveEnemyFleet(pendingCombatEncounter.enemyId, { danger, maxRisk: sectorProfile.enemyRiskCeiling, rewardMultiplier: sectorProfile.rewardMultiplier, seed: pendingCombatEncounter.id }).enemy
      : pickEnemyFleet(danger, { maxRisk: sectorProfile.enemyRiskCeiling, rewardMultiplier: sectorProfile.rewardMultiplier });
    const next = createCombatState(enemy);
    startCombatRecord({ vesselId: activeVesselId, combat: next, targetId: "hull" });
    if (pendingCombatEncounter) {
      clearPendingCombatEncounter();
      pushFeed([`긴급 항해 교전 대응: ${pendingCombatEncounter.title}`, `${enemy.name} 식별. 위협도 ${enemy.risk}, 교전력 ${enemy.power}.`, "타겟 서브시스템과 전술 지시를 함께 선택하세요."]);
    } else {
      pushFeed([`${enemy.name} 식별. 위협도 ${enemy.risk}, 교전력 ${enemy.power}.`, "타겟 서브시스템과 전술 지시를 함께 선택하세요."]);
    }
    return null;
  };

  const appendMissionCombatOutcome = (nextCombat, logs) => {
    const source = nextCombat?.source;
    if (source?.kind !== "missionEncounter" || !["won", "retreated", "lost"].includes(nextCombat.status)) return;
    const outcomeLabel = missionCombatOutcomeLabel(nextCombat.status);
    if (nextCombat.status === "won") {
      logs.push("임무 전투 승리: 탐사 화면에서 임무를 완료할 수 있습니다.");
      setPaused(false);
      return;
    }
    const failed = failMission({ vesselId: activeVesselId, currentMinute, reason: `missionCombat:${nextCombat.status}`, expectedMissionId: source.missionId });
    logs.push(failed.ok ? `임무 전투 ${outcomeLabel}: ${failed.mission.title} 계약이 실패 처리되었습니다.` : `임무 전투 ${outcomeLabel}: 임무 실패 처리 실패(${failed.reason}).`);
    setPaused(false);
  };

  const issueDirective = (directive) => {
    if (!combat || combat.status !== "engaged") return pushFeed([getCombatDirectiveResult(directive), travelLocked ? "항해 중이라 훈련 교전도 제한됩니다." : "교전이 없어 훈련 중계만 기록됩니다."]);
    if (activeCrew.length === 0) return pushFeed(["지시 불가: 생존 승무원이 없습니다."]);
    const result = resolveCombatRound({ directive, combat, power, targetId, tacticalCrewBonus: tacticalBonus, skillEffects });
    updateCombatRecord({ vesselId: activeVesselId, combat: result.combat });
    addResources(result.resourceChanges);
    if (result.loot) addItem(result.loot.itemId, result.loot.qty);
    const lead = activeCrew[Math.floor(Math.random() * activeCrew.length)];
    if (lead) applyCrewOutcome({ memberId: lead.id, fatigue: 6, experience: 5, morale: result.combat.status === "won" ? 1 : 0 });
    const casualty = rollCrewCasualty({ crew, enemy: combat.enemy, directive, hullDamage: Math.abs(result.resourceChanges.hull ?? 0), shipHull: resources.hull + (result.resourceChanges.hull ?? 0), casualtyRiskMul: tacticalBonus.casualtyRiskMul ?? 1 });
    const casualtyLogs = [];
    if (casualty) {
      applyCombatCasualtyWithJobs({ memberId: casualty.member.id, injury: casualty.injury, morale: casualty.injury === "전사" ? -3 : -1 });
      casualtyLogs.push(casualty.injury === "전사" ? `치명적 손실: ${casualty.member.name} 전사. 추정 사망 위험 ${casualty.risk}%.` : `승무원 피해: ${casualty.member.name} ${casualty.injury}. 추정 부상 위험 ${casualty.risk}%.`);
    }
    let dustGain = 0;
    if (result.combat.status === "won") {
      dustGain = Math.round(DUST.COMBAT_REWARD_PER_RISK * (combat.enemy?.risk ?? 1));
      addDust(dustGain);
      casualtyLogs.push(`전투 승리 보상: 먼지 +${dustGain}.`);
    }
    if (result.combat.status === "won" && activeTravel) {
      casualtyLogs.push("긴급 교전 종료. 항해를 계속 진행할 수 있습니다.");
      setPaused(false);
    }
    if (result.combat.status === "lost" && activeTravel) casualtyLogs.push("항해 중 교전 패배. 함선 피해가 누적되어 항해 지속이 매우 위험합니다.");
    appendMissionCombatOutcome(result.combat, casualtyLogs);
    pushFeed([...result.logs, ...casualtyLogs]);
    // Phase 20-B: combat's report is filed once, right at the engaged ->
    // won/lost/retreated transition — issueDirective only ever runs while
    // combat.status === "engaged" (see the guard at the top of this
    // function), so `["won","lost","retreated"].includes(result.combat.status)`
    // here is exactly that transition, not a re-fire on a later directive
    // against an already-terminal combat. Body is built from the same
    // structured fields already used above (combat.enemy, dustGain,
    // result.loot, casualty) — not by parsing pushFeed's log lines.
    const outcomeMeta = COMBAT_OUTCOME_META[result.combat.status];
    if (outcomeMeta) {
      const summaryParts = [`적 ${combat.enemy?.name ?? "미상 함선"}과의 교전이 ${missionCombatOutcomeLabel(result.combat.status)}(으)로 종료되었습니다.`];
      if (result.combat.status === "won") {
        const lootText = result.loot ? `, ${result.loot.itemId} x${result.loot.qty}` : "";
        summaryParts.push(`보상: 먼지 +${dustGain}${lootText}.`);
      }
      summaryParts.push(casualty ? (casualty.injury === "전사" ? `승무원 손실: ${casualty.member.name} 전사.` : `승무원 부상: ${casualty.member.name} ${casualty.injury}.`) : "승무원 피해 없음.");
      useReportStore.getState().addReport(
        buildCombatReport({
          title: `전투 결과: ${missionCombatOutcomeLabel(result.combat.status)}`,
          summary: summaryParts.join(" "),
          outcome: outcomeMeta.outcome,
          priority: outcomeMeta.priority,
          currentMinute,
        }),
      );
    }
    return null;
  };

  const resetCombat = () => {
    reconcileMissionCombatOutcome(currentMinute);
    const pendingMissionSettlement = useMissionStore.getState().pendingMissionEncountersByVesselId?.[activeVesselId]?.settlement;
    if (pendingMissionSettlement?.status === "waitingCombat") return pushFeed(["브리핑 초기화 보류: 임무 전투 결과 정산이 먼저 필요합니다."]);
    resetCombatRecord({ vesselId: activeVesselId });
    pushFeed(["전투 브리핑을 초기화했습니다."]);
  };

  const selectTarget = (nextTargetId) => setTargetRecord({ vesselId: activeVesselId, targetId: nextTargetId });

  const enemy = combat?.enemy;
  const enemyHull = enemy ? Math.round((enemy.hullNow / enemy.hull) * 100) : 0;
  const enemyShield = enemy ? Math.round((enemy.shieldNow / enemy.shield) * 100) : 0;
  const eventLine = feed[0] ?? "함교가 다음 지시를 기다립니다.";
  const canStart = activeCrew.length > 0 && !travelLocked && !combatEngaged;
  const canIssueDirective = activeCrew.length > 0 && combatEngaged;

  return (
    <div className="grid gap-6">
    <div className="grid gap-4 lg:h-full lg:grid-cols-[0.9fr_1.1fr]">
      <section>
        <div className="flex items-start justify-between gap-3"><div><div className="section-title"><Crosshair size={18} />전술 콘솔</div><p className="mt-2 text-sm text-slate-400">타겟 서브시스템과 전술 지시를 조합해 교전을 결재합니다.</p></div><span className="hud-chip hud-chip-accent">PWR {power}</span></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-[0.95fr_1.05fr]"><ThreatPoster enemy={enemy} pendingCombatEncounter={pendingCombatEncounter} combat={combat} travelLocked={travelLocked} /><div className="grid grid-cols-3 gap-2"><StatTile icon={Shield} label="선체" value={`${Math.round(resources.hull)}%`} /><StatTile icon={Zap} label="연료" value={`${Math.round(resources.fuel)}%`} /><StatTile icon={Skull} label="생존/전사" value={`${activeCrew.length}/${fallenCrew.length}`} /></div></div>
        {activeTravel && <div className={`mt-4 rounded-2xl border p-3 text-sm ${pendingCombatEncounter || combatEngaged ? "border-red-400/40 bg-red-400/10 text-red-100" : "border-amber-300/35 bg-amber-300/10 text-amber-100"}`}><div className="flex items-center gap-2 font-bold"><AlertTriangle size={16} />{pendingCombatEncounter || combatEngaged ? "항해 중 긴급 교전" : "항해 작전 진행 중"}</div></div>}
        <TacticalCrewPanel crew={activeCrew} assignments={tacticalAssignments} bonus={tacticalBonus} />
        <div className="mt-4 rounded-2xl border border-slate-700/70 bg-slate-950/60 p-4">
          <div className="flex items-center justify-between gap-2"><div><div className="hud-label">교전 대상</div><div className="font-black text-slate-100">{enemy?.name ?? (pendingCombatEncounter ? pendingCombatEncounter.title : "없음")}</div></div><span className={`hud-chip ${combatStatusChip(combat?.status, combatEngaged)}`}>{combat?.status ?? "대기"}</span></div>
          {enemy && <div className="mt-3 grid grid-cols-2 gap-2"><StatTile icon={Shield} label="적 선체" value={`${enemyHull}%`} /><StatTile icon={Zap} label="적 방어막" value={`${enemyShield}%`} /></div>}
          {enemy && <EnemySubsystemPanel enemy={enemy} />}
          <CombatOutcomeActions combat={combat} onNavigate={onNavigate} onOpenModal={onOpenModal} onResetCombat={resetCombat} />
          <button className="primary-button mt-4 w-full justify-center" disabled={!canStart} onClick={startEncounter}>{combatEngaged ? "교전 진행 중" : pendingCombatEncounter ? "긴급 교전 대응" : travelLocked ? "항해 중 수동 교전 불가" : "새 교전 생성"}</button>
          {combat && !combatTerminal && <button className="secondary-button mt-2 w-full justify-center" onClick={resetCombat}>브리핑 초기화</button>}
        </div>
        <section className="mt-4 rounded-2xl border border-cyan-300/25 bg-cyan-300/10 p-3"><div className="section-title"><Target size={16} />타겟 서브시스템</div><div className="mt-3 grid grid-cols-2 gap-2">{Object.values(COMBAT_TARGETS).map((target) => <TargetCard key={target.id} target={target} active={target.id === targetId} disabled={!combatEngaged} onSelect={selectTarget} />)}</div></section>
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
      <section className="rounded-2xl border border-red-400/25 bg-red-400/10 p-4">
        <Hunting />
      </section>
    </div>
  );
}
