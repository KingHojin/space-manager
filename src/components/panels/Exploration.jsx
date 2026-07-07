import { useEffect } from "react";
import { AlertTriangle, Briefcase, CheckCircle2, Clock3, Fuel, MapPin, Radar, Rocket, Route } from "lucide-react";
import { DUST, NAVIGATION_TRAVEL } from "../../data/constants";
import { formatMinutes } from "../../data/moduleRecipes";
import { NODE_TYPE_ICONS, NODE_TYPE_LABELS } from "../../data/navEncounters";
import { useCombatStore } from "../../stores/combatStore";
import { useCrewStore } from "../../stores/crewStore";
import { useExplorationStore } from "../../stores/explorationStore";
import { useGameStore } from "../../stores/gameStore";
import { useInventoryStore } from "../../stores/inventoryStore";
import { useMissionStore } from "../../stores/missionStore";
import { useNavStore } from "../../stores/navStore";
import { useShipStore } from "../../stores/shipStore";
import { createCombatState, pickEnemyFleet } from "../../systems/combatEngine";
import { explorationBlockLabel, explorationFuelCost } from "../../systems/explorationRules";
import { applyNavigationEncounter, formatGameDate } from "../../systems/gameClock";
import { applyMissionRewards } from "../../systems/missionRewards";
import { nodeToZone, routeDistance } from "../../systems/navigationSystem";
import ExplorationRewardPanel from "../exploration/ExplorationRewardPanel";
import StarMap from "../exploration/StarMap";
import MissionEncounterCard from "../ui/MissionEncounterCard";
import { MissionPoster, MissionProgressSteps, RewardIconRow } from "../ui/MissionVisuals";

function dangerChipClass(danger) {
  if (danger >= 5) return "hud-chip-danger";
  if (danger >= 3) return "hud-chip-warn";
  return "";
}

function Info({ label, value, tone = "" }) {
  return <div className="rounded border border-slate-700/70 bg-slate-950/70 px-3 py-2"><div className="hud-label">{label}</div><div className={`hud-value mt-1 ${tone}`}>{value}</div></div>;
}

function hasEntries(record = {}) {
  return Object.keys(record ?? {}).length > 0;
}

function formatSigned(value) {
  if (typeof value !== "number") return value;
  return value > 0 ? `+${value}` : `${value}`;
}

function formatRewardItems(items = []) {
  if (items.length === 0) return "아이템 없음";
  return items.map((item) => `${item.id} x${item.qty}`).join(", ");
}

function injuryFromCrewRisk(crewRisk) {
  if (!crewRisk) return "경상";
  if (crewRisk.severity === "critical" || crewRisk.severity === "serious") return "중상";
  return "경상";
}

function missionCombatDanger(node, combatEffect) {
  return Math.max(1, Math.round((node?.danger ?? 2) + (combatEffect?.dangerBonus ?? 0)));
}

function EncounterCard({ encounter, onResolve }) {
  if (!encounter) return null;
  return (
    <section className="rounded border border-red-400/45 bg-red-400/10 p-4">
      <div className="grid gap-3 md:grid-cols-[6rem_minmax(0,1fr)]">
        <div className="grid h-24 place-items-center rounded-xl border border-red-300/30 bg-red-400/10 text-4xl">{encounter.icon}</div>
        <div>
          <div className="flex items-start justify-between gap-3"><div><div className="section-title"><AlertTriangle size={18} />조우 결재</div><h3 className="mt-2 text-lg font-black text-red-100">{encounter.title}</h3></div><span className="hud-chip hud-chip-danger shrink-0">{encounter.typeLabel}</span></div>
          <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-300">{encounter.description}</p>
        </div>
      </div>
      <div className="mt-4 grid gap-2">
        {encounter.options.map((option) => <button key={option.id} className="secondary-button justify-between text-left" onClick={() => onResolve(option.id)}><span>{option.label}</span><span className="text-xs text-cyan-200">결재</span></button>)}
      </div>
    </section>
  );
}

function ActiveMissionPanel({ mission, currentNodeId, travel, pendingEncounter, pendingMissionEncounter, activeCombat, onPlan, onComplete }) {
  if (!mission) return null;
  const arrived = currentNodeId === mission.destinationNodeId;
  const travelingThisMission = travel?.missionId === mission.id;
  const combatEngaged = activeCombat?.status === "engaged";
  const hasBlockingEncounter = Boolean(pendingEncounter || pendingMissionEncounter || combatEngaged);
  const canComplete = arrived && !travel && !hasBlockingEncounter;
  const statusLabel = canComplete ? "완료 가능" : combatEngaged ? "전투 중" : arrived ? pendingMissionEncounter ? "임무 카드" : "조우 처리" : travelingThisMission ? "항해 중" : "대기";
  return (
    <section className="rounded border border-cyan-300/35 bg-cyan-300/10 p-4">
      <div className="grid gap-4 md:grid-cols-[11rem_minmax(0,1fr)]">
        <MissionPoster mission={mission} compact />
        <div className="min-w-0">
          <div className="flex items-start justify-between gap-3"><div><div className="section-title"><Briefcase size={18} />활성 임무</div><h3 className="mt-2 truncate text-xl font-black text-slate-50">{mission.title}</h3></div><span className="hud-chip hud-chip-accent shrink-0">{statusLabel}</span></div>
          <MissionProgressSteps arrived={arrived} pendingEncounter={hasBlockingEncounter} />
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm"><Info label="목적지" value={mission.destinationName} /><Info label="위험" value={mission.riskLabel} /></div>
          <div className="mt-3"><RewardIconRow reward={mission.reward} /></div>
        </div>
      </div>
      {canComplete && <button className="primary-button mt-4 w-full" onClick={() => onComplete(mission)}><CheckCircle2 size={16} />임무 완료하고 보상 수령</button>}
      {arrived && pendingEncounter && <p className="mt-3 text-sm leading-6 text-amber-100">목적지 조우를 먼저 결재해야 임무를 완료할 수 있습니다.</p>}
      {arrived && pendingMissionEncounter && <p className="mt-3 text-sm leading-6 text-amber-100">임무 조우 카드를 먼저 선택해야 임무를 완료할 수 있습니다.</p>}
      {arrived && combatEngaged && <p className="mt-3 text-sm leading-6 text-red-100">임무 조우에서 발생한 전투를 먼저 끝내야 임무를 완료할 수 있습니다.</p>}
      {!arrived && <button className="primary-button mt-4 w-full" disabled={Boolean(travel)} onClick={() => onPlan(mission)}><MapPin size={16} />임무 목적지 항로 결재</button>}
    </section>
  );
}

export default function Exploration({ onNavigate }) {
  const currentMinute = useGameStore((state) => state.currentMinute);
  const setPaused = useGameStore((state) => state.setPaused);
  const addResources = useGameStore((state) => state.addResources);
  const addLog = useGameStore((state) => state.addLog);
  const addItem = useInventoryStore((state) => state.addItem);
  const addDust = useInventoryStore((state) => state.addDust);
  const crew = useCrewStore((state) => state.crew);
  const applyCombatCasualty = useCrewStore((state) => state.applyCombatCasualty);
  const zoneRuntime = useExplorationStore((state) => state.zoneRuntime ?? {});
  const exploreZone = useExplorationStore((state) => state.exploreZone);
  const sector = useNavStore((state) => state.sector);
  const currentNodeId = useNavStore((state) => state.currentNodeId);
  const selectedNodeId = useNavStore((state) => state.selectedNodeId);
  const route = useNavStore((state) => state.route ?? []);
  const travel = useNavStore((state) => state.travel);
  const fuel = useNavStore((state) => state.fuel);
  const discovered = useNavStore((state) => state.discovered ?? []);
  const pendingEncounter = useNavStore((state) => state.pendingEncounter);
  const driftState = useNavStore((state) => state.driftState);
  const recruitCandidates = useNavStore((state) => state.recruitCandidates ?? []);
  const navLog = useNavStore((state) => state.navLog ?? []);
  const selectNode = useNavStore((state) => state.selectNode);
  const planRoute = useNavStore((state) => state.planRoute);
  const refuel = useNavStore((state) => state.refuel);
  const activeVesselId = useShipStore((state) => state.activeVesselId);
  const activeMission = useMissionStore((state) => state.activeByVesselId?.[activeVesselId]);
  const pendingMissionEncounter = useMissionStore((state) => state.pendingMissionEncountersByVesselId?.[activeVesselId]);
  const resolvedMissionEncounters = useMissionStore((state) => state.resolvedMissionEncounters ?? []);
  const completeMission = useMissionStore((state) => state.completeMission);
  const generateMissionEncounterForVessel = useMissionStore((state) => state.generateMissionEncounterForVessel);
  const resolveMissionEncounter = useMissionStore((state) => state.resolveMissionEncounter);
  const activeCombat = useCombatStore((state) => state.combatByVesselId[activeVesselId] ?? null);
  const startCombatRecord = useCombatStore((state) => state.startCombat);

  const nodes = sector.nodes ?? [];
  const zones = nodes.map(nodeToZone);
  const current = nodes.find((node) => node.id === currentNodeId) ?? nodes[0];
  const selected = nodes.find((node) => node.id === selectedNodeId) ?? current;
  const discoveredSet = new Set(discovered);
  const isCurrent = selected?.id === current?.id;
  const plannedRoute = selected && !isCurrent ? route : [current?.id].filter(Boolean);
  const plannedDistance = selected && !isCurrent ? routeDistance(sector, plannedRoute.length > 1 ? plannedRoute : [current.id, selected.id]) : 0;
  const plannedMinutes = Math.max(18, Math.round(plannedDistance * NAVIGATION_TRAVEL.minutesPerDistance));
  const travelFrom = nodes.find((node) => node.id === travel?.fromId);
  const travelTo = nodes.find((node) => node.id === travel?.toId);
  const travelProgress = travel ? Math.max(0, Math.min(100, ((currentMinute - travel.startedAt) / Math.max(1, travel.duration)) * 100)) : 0;
  const activeMissionArrived = Boolean(activeMission && currentNodeId === activeMission.destinationNodeId);
  const missionAlreadyResolved = Boolean(activeMission && resolvedMissionEncounters.some((encounter) => encounter.missionId === activeMission.id));
  const combatEngaged = activeCombat?.status === "engaged";

  useEffect(() => {
    if (!activeVesselId || !activeMission || !activeMissionArrived) return;
    if (travel || pendingEncounter || pendingMissionEncounter || missionAlreadyResolved || combatEngaged) return;
    const result = generateMissionEncounterForVessel({ vesselId: activeVesselId, timing: "arrival", currentMinute });
    if (result.ok && result.generated) addLog(`임무 조우 카드 발생: ${result.encounter.title}`);
  }, [activeVesselId, activeMission?.id, activeMissionArrived, travel, pendingEncounter, pendingMissionEncounter, missionAlreadyResolved, combatEngaged, currentMinute, generateMissionEncounterForVessel, addLog]);

  const handleSelect = (zone) => {
    if (!discoveredSet.has(zone.id)) return;
    selectNode(zone.id === currentNodeId ? null : zone.id);
  };

  const handlePlan = () => {
    if (!selected || isCurrent) return;
    const result = planRoute(selected.id, currentMinute);
    if (!result.ok) return addLog(`항로 설정 실패: ${result.reason}`);
    setPaused(false);
    return addLog(`${selected.name} 항로 결재 완료: ${formatMinutes(result.travel.duration)}, 연료 ${result.travel.fuelCost.toFixed(1)} 예상.`);
  };

  const handleExplore = () => {
    if (!current || selected?.id !== current.id) return addLog("탐험 실패: 현재 위치에서만 수거할 수 있습니다.");
    const fuelCost = explorationFuelCost(current);
    if (fuel < fuelCost) return addLog(`탐험 실패: 연료가 부족합니다. 필요 ${fuelCost.toFixed(1)}, 보유 ${fuel.toFixed(1)}.`);
    const result = exploreZone(current, currentMinute);
    if (!result.ok) return addLog(`탐험 실패: ${explorationBlockLabel(result.reason)}.`);
    if (result.fuelCost > 0) refuel(-result.fuelCost);
    result.items.forEach((item) => addItem(item.id, item.qty));
    if (result.creditGain > 0) addResources({ credits: result.creditGain });
    if (result.hullDamage > 0) addResources({ hull: -result.hullDamage });
    const dustGain = Math.round(DUST.EXPLORE_PER_DANGER * Math.max(1, current.danger ?? 1));
    addDust(dustGain);
    const rewardText = formatRewardItems(result.items);
    const creditText = result.creditGain > 0 ? ` · ₢${result.creditGain}` : "";
    const damageText = result.hullDamage > 0 ? ` · 선체 -${result.hullDamage}` : "";
    const fuelText = result.fuelCost > 0 ? ` · 연료 -${result.fuelCost.toFixed(1)}` : "";
    const dustText = ` · 먼지 +${dustGain}`;
    return addLog(`탐험 완료: ${current.name} · ${rewardText}${creditText}${damageText}${fuelText}${dustText}. 창고에서 폐자재를 분해 작업으로 등록할 수 있습니다.`);
  };

  const handlePlanMission = (mission) => {
    const result = planRoute(mission.destinationNodeId, currentMinute, { missionId: mission.id, missionTitle: mission.title, missionDestinationName: mission.destinationName });
    if (!result.ok) return addLog(`임무 항로 설정 실패: ${result.reason}`);
    setPaused(false);
    return addLog(`임무 항로 결재: ${mission.title}. 목적지 ${mission.destinationName}, 예상 ${formatMinutes(result.travel.duration)}.`);
  };

  const handleCompleteMission = (mission) => {
    if (currentNodeId !== mission.destinationNodeId) return addLog("임무 완료 실패: 목적지에 도착하지 않았습니다.");
    if (pendingEncounter) return addLog("임무 완료 실패: 목적지 조우를 먼저 결재해야 합니다.");
    if (pendingMissionEncounter) return addLog("임무 완료 실패: 임무 조우 카드를 먼저 선택해야 합니다.");
    if (combatEngaged) return addLog("임무 완료 실패: 임무 조우 전투를 먼저 끝내야 합니다.");
    const result = completeMission({ vesselId: activeVesselId, currentMinute });
    if (!result.ok) return addLog(`임무 완료 실패: ${result.reason}`);
    const payout = applyMissionRewards(result.reward);
    addLog(`임무 완료: ${result.mission.title}.`);
    payout.logs.forEach((message) => addLog(`임무 보상: ${message}`));
    return null;
  };

  const applyCrewRisk = (crewRisk) => {
    if (!crewRisk) return;
    const chance = Math.max(0, Math.min(1, crewRisk.chance ?? 0));
    if (chance <= 0) return;
    const livingCrew = crew.filter((member) => member.alive !== false);
    if (livingCrew.length === 0) return addLog("임무 조우 승무원 위험: 적용 가능한 승무원이 없습니다.");
    if (Math.random() >= chance) return addLog(`임무 조우 승무원 위험 회피: 위험률 ${Math.round(chance * 100)}%.`);
    const target = livingCrew[Math.floor(Math.random() * livingCrew.length)];
    const injury = injuryFromCrewRisk(crewRisk);
    applyCombatCasualty({ memberId: target.id, injury, morale: -1 });
    return addLog(`임무 조우 승무원 피해: ${target.name} ${injury}. 위험률 ${Math.round(chance * 100)}%.`);
  };

  const startMissionCombat = (result) => {
    if (!result.combat) return null;
    if (combatEngaged) {
      addLog("임무 조우 전투 시작 실패: 이미 전투 중입니다.");
      return null;
    }
    const danger = missionCombatDanger(current, result.combat);
    const enemy = pickEnemyFleet(danger);
    const combat = { ...createCombatState(enemy), source: { kind: "missionEncounter", encounterId: result.encounter.id, missionId: result.encounter.missionId, optionId: result.option.id, danger } };
    const started = startCombatRecord({
      vesselId: activeVesselId,
      combat,
      targetId: "hull",
      feed: [
        `임무 조우 전투 발생: ${result.encounter.title} / ${result.option.label}`,
        `${enemy.name} 식별. 위험 보정 ${danger}, 교전력 ${enemy.power}.`,
        "전투 패널에서 타겟 서브시스템과 전술 지시를 결재하세요.",
      ],
    });
    if (!started.ok) return addLog(`임무 조우 전투 시작 실패: ${started.reason}`);
    setPaused(true);
    addLog(`임무 조우 전투 시작: ${enemy.name}. 전투 패널로 이동합니다.`);
    onNavigate?.("combat");
    return started;
  };

  const handleResolve = (optionId) => applyNavigationEncounter(optionId, currentMinute);
  const handleResolveMissionEncounter = (optionId) => {
    if (combatEngaged) return addLog("임무 조우 선택 실패: 진행 중인 전투를 먼저 끝내야 합니다.");
    const result = resolveMissionEncounter({ vesselId: activeVesselId, optionId, currentMinute });
    if (!result.ok) return addLog(`임무 조우 선택 실패: ${result.reason}`);
    addLog(`임무 조우 선택: ${result.encounter.title} / ${result.option.label}.`);
    result.logs.forEach((message) => addLog(`임무 조우: ${message}`));
    if (hasEntries(result.resourceDelta)) {
      addResources(result.resourceDelta);
      Object.entries(result.resourceDelta).forEach(([key, value]) => addLog(`임무 조우 자원 변화: ${key} ${formatSigned(value)}.`));
    }
    if (hasEntries(result.reward)) {
      const payout = applyMissionRewards(result.reward);
      payout.logs.forEach((message) => addLog(`임무 조우 보상: ${message}`));
    }
    applyCrewRisk(result.crewRisk);
    startMissionCombat(result);
    return null;
  };

  const handleEmergencyRefuel = () => {
    refuel(25);
    addLog("긴급 구조 보급 수신: 항해 연료 +25.");
  };

  return (
    <div className="grid grid-cols-1 gap-4 xl:h-full xl:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)]">
      <section className="xl:overflow-y-auto">
        <div className="flex items-start justify-between gap-3"><div><div className="section-title"><Radar size={18} />{sector.name} 노드 지도</div><p className="mt-2 text-sm leading-6 text-slate-400">노드를 고르고, 항로와 조우를 시각적으로 확인합니다.</p></div><span className="hud-chip hud-chip-accent">Fuel {Math.round(fuel)}%</span></div>
        <div className="mt-3"><StarMap zones={zones} currentZoneId={currentNodeId} selectedZoneId={selectedNodeId} discoveredZoneIds={discovered} route={route} activeTravel={travel ? { ...travel, fromZoneId: travel.fromId, toZoneId: travel.toId } : null} currentMinute={currentMinute} onSelect={handleSelect} sectorName={sector.name} exploredCount={discovered.length} totalCount={nodes.length} /></div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4"><Info label="현재 노드" value={current?.name ?? "-"} /><Info label="발견" value={`${discovered.length}/${nodes.length}`} /><Info label="영입 후보" value={`${recruitCandidates.length}명`} /><Info label="상태" value={pendingEncounter ? "조우 대기" : pendingMissionEncounter ? "임무 카드" : combatEngaged ? "전투 중" : travel ? travel.missionId ? "임무 항해" : "항해 중" : driftState ? "표류" : "정박"} tone={pendingEncounter || driftState || combatEngaged ? "text-red-300" : pendingMissionEncounter || travel ? "text-amber-300" : ""} /></div>
      </section>
      <aside className="space-y-4">
        <EncounterCard encounter={pendingEncounter} onResolve={handleResolve} />
        {pendingMissionEncounter && <MissionEncounterCard encounter={pendingMissionEncounter} disabled={Boolean(pendingEncounter) || combatEngaged} onSelectOption={handleResolveMissionEncounter} />}
        <ActiveMissionPanel mission={activeMission} currentNodeId={currentNodeId} travel={travel} pendingEncounter={pendingEncounter} pendingMissionEncounter={pendingMissionEncounter} activeCombat={activeCombat} onPlan={handlePlanMission} onComplete={handleCompleteMission} />
        {travel && <section><div className="section-title"><Clock3 size={18} />{travel.missionId ? "임무 항해 상황판" : "항해 상황판"}</div><div className="mission-travel-card mt-4 rounded-2xl border border-amber-300/35 bg-amber-300/10 p-4"><div className="flex items-start justify-between gap-3"><div>{travel.missionTitle && <div className="mb-1 text-xs font-bold text-cyan-200">{travel.missionTitle}</div>}<div className="font-semibold text-amber-100">{travelFrom?.name} → {travelTo?.name}</div><div className="mt-1 text-xs text-slate-400">도착 {formatGameDate(travel.completeAt)}</div></div><span className="hud-chip hud-chip-warn">{Math.round(travelProgress)}%</span></div><div className="hud-gauge mt-3"><span className="hud-gauge-fill" style={{ width: `${travelProgress}%` }} /></div><div className="mt-3 grid grid-cols-2 gap-2 text-sm"><Info label="남은 시간" value={formatMinutes(Math.max(0, Math.ceil(travel.completeAt - currentMinute)))} /><Info label="예상 연료" value={`${travel.fuelCost.toFixed(1)}`} /></div></div></section>}
        {driftState && <section className="rounded border border-red-400/45 bg-red-400/10 p-4"><div className="section-title"><Fuel size={18} />표류 상태</div><p className="mt-2 text-sm leading-6 text-slate-300">연료가 고갈되어 이동이 정지했습니다.</p><button className="primary-button mt-4 w-full" onClick={handleEmergencyRefuel}>긴급 보급 수신</button></section>}
        {!pendingEncounter && !pendingMissionEncounter && !travel && !driftState && !combatEngaged && selected && <section><div className="section-title"><Route size={18} />목적지 결재</div><div className="mt-4 rounded border border-cyan-400/30 bg-cyan-400/10 p-4"><div className="flex items-start justify-between gap-3"><div><div className="text-lg font-black text-slate-50">{NODE_TYPE_ICONS[selected.type] ?? "❔"} {selected.name}</div><div className="mt-1 text-sm text-slate-400">{NODE_TYPE_LABELS[selected.type] ?? selected.type} · 위험 {selected.danger} · 자원 {selected.richness}</div></div><span className={`hud-chip ${dangerChipClass(selected.danger)}`}>위험 {selected.danger}</span></div>{isCurrent ? <p className="mt-3 text-sm text-slate-400">현재 위치입니다. 연결된 노드를 선택하거나 주변 잔해를 수거하세요.</p> : <div className="mt-3 grid grid-cols-2 gap-2 text-sm"><Info label="거리" value={`${plannedDistance.toFixed(1)}u`} /><Info label="예상 시간" value={formatMinutes(plannedMinutes)} /></div>}<button className="primary-button mt-4 w-full" disabled={isCurrent || fuel <= 0} onClick={handlePlan}><Rocket size={16} />이 경로로 항해</button><ExplorationRewardPanel zone={selected} runtime={zoneRuntime[selected.id]} currentMinute={currentMinute} fuel={fuel} isCurrent={isCurrent} onExplore={handleExplore} /></div></section>}
        <section><div className="section-title">항해 로그</div><div className="mt-3 grid gap-2">{navLog.slice(0, 5).map((entry, index) => <div key={`${entry}-${index}`} className="rounded border border-slate-700/70 bg-slate-950/70 px-3 py-2 text-xs text-slate-300">{entry}</div>)}</div></section>
      </aside>
    </div>
  );
}
