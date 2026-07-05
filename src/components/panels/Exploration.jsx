import { AlertTriangle, Briefcase, Clock3, Fuel, MapPin, Radar, Rocket, Route } from "lucide-react";
import { formatMinutes } from "../../data/moduleRecipes";
import { NODE_TYPE_ICONS, NODE_TYPE_LABELS } from "../../data/navEncounters";
import { useGameStore } from "../../stores/gameStore";
import { useMissionStore } from "../../stores/missionStore";
import { useNavStore } from "../../stores/navStore";
import { useShipStore } from "../../stores/shipStore";
import { applyNavigationEncounter, formatGameDate } from "../../systems/gameClock";
import { nodeToZone, routeDistance } from "../../systems/navigationSystem";
import StarMap from "../exploration/StarMap";

function dangerChipClass(danger) {
  if (danger >= 5) return "hud-chip-danger";
  if (danger >= 3) return "hud-chip-warn";
  return "";
}

function Info({ label, value, tone = "" }) {
  return <div className="rounded border border-slate-700/70 bg-slate-950/70 px-3 py-2"><div className="hud-label">{label}</div><div className={`hud-value mt-1 ${tone}`}>{value}</div></div>;
}

function EncounterCard({ encounter, onResolve }) {
  if (!encounter) return null;
  return (
    <section className="rounded border border-red-400/45 bg-red-400/10 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="section-title"><AlertTriangle size={18} />조우 결재</div>
          <h3 className="mt-3 text-lg font-black text-red-100">{encounter.icon} {encounter.title}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-300">{encounter.description}</p>
        </div>
        <span className="hud-chip hud-chip-danger">{encounter.typeLabel}</span>
      </div>
      <div className="mt-4 grid gap-2">
        {encounter.options.map((option) => <button key={option.id} className="secondary-button justify-between text-left" onClick={() => onResolve(option.id)}><span>{option.label}</span><span className="text-xs text-cyan-200">결재</span></button>)}
      </div>
    </section>
  );
}

function ActiveMissionPanel({ mission, currentNodeId, travel, onPlan }) {
  if (!mission) return null;
  const arrived = currentNodeId === mission.destinationNodeId;
  const travelingThisMission = travel?.missionId === mission.id;
  return (
    <section className="rounded border border-cyan-300/35 bg-cyan-300/10 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="section-title"><Briefcase size={18} />활성 임무</div>
          <h3 className="mt-3 text-lg font-black text-slate-50">{mission.title}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-300">{mission.summary}</p>
        </div>
        <span className="hud-chip hud-chip-accent">{arrived ? "목적지" : travelingThisMission ? "항해 중" : "대기"}</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <Info label="목적지" value={mission.destinationName} />
        <Info label="위험" value={mission.riskLabel} />
      </div>
      {arrived ? <p className="mt-3 text-sm leading-6 text-cyan-100">목적지에 도착했습니다. PR D에서 조우 처리 후 완료/보상 지급을 연결합니다.</p> : <button className="primary-button mt-4 w-full" disabled={Boolean(travel)} onClick={() => onPlan(mission)}><MapPin size={16} />임무 목적지 항로 결재</button>}
    </section>
  );
}

export default function Exploration() {
  const currentMinute = useGameStore((state) => state.currentMinute);
  const setPaused = useGameStore((state) => state.setPaused);
  const addLog = useGameStore((state) => state.addLog);
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

  const nodes = sector.nodes ?? [];
  const zones = nodes.map(nodeToZone);
  const current = nodes.find((node) => node.id === currentNodeId) ?? nodes[0];
  const selected = nodes.find((node) => node.id === selectedNodeId) ?? current;
  const discoveredSet = new Set(discovered);
  const isCurrent = selected?.id === current?.id;
  const plannedRoute = selected && !isCurrent ? route : [current?.id].filter(Boolean);
  const plannedDistance = selected && !isCurrent ? routeDistance(sector, plannedRoute.length > 1 ? plannedRoute : [current.id, selected.id]) : 0;
  const travelFrom = nodes.find((node) => node.id === travel?.fromId);
  const travelTo = nodes.find((node) => node.id === travel?.toId);
  const travelProgress = travel ? Math.max(0, Math.min(100, ((currentMinute - travel.startedAt) / Math.max(1, travel.duration)) * 100)) : 0;

  const handleSelect = (zone) => {
    if (!discoveredSet.has(zone.id)) return;
    selectNode(zone.id === currentNodeId ? null : zone.id);
  };

  const handlePlan = () => {
    if (!selected || isCurrent) return;
    const result = planRoute(selected.id, currentMinute);
    if (!result.ok) {
      addLog(`항로 설정 실패: ${result.reason}`);
      return;
    }
    setPaused(false);
    addLog(`${selected.name} 항로 결재 완료: ${formatMinutes(result.travel.duration)}, 연료 ${result.travel.fuelCost.toFixed(1)} 예상.`);
  };

  const handlePlanMission = (mission) => {
    const result = planRoute(mission.destinationNodeId, currentMinute, { missionId: mission.id, missionTitle: mission.title, missionDestinationName: mission.destinationName });
    if (!result.ok) return addLog(`임무 항로 설정 실패: ${result.reason}`);
    setPaused(false);
    return addLog(`임무 항로 결재: ${mission.title}. 목적지 ${mission.destinationName}, 예상 ${formatMinutes(result.travel.duration)}.`);
  };

  const handleResolve = (optionId) => {
    applyNavigationEncounter(optionId, currentMinute);
  };

  const handleEmergencyRefuel = () => {
    refuel(25);
    addLog("긴급 구조 보급 수신: 항해 연료 +25.");
  };

  return (
    <div className="grid grid-cols-1 gap-4 xl:h-full xl:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)]">
      <section className="xl:overflow-y-auto">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="section-title"><Radar size={18} />{sector.name} 노드 지도</div>
            <p className="mt-2 text-sm leading-6 text-slate-400">노드 선택 → 항로 결재 → 시간 경과 → 도착 조우 결재로 이어지는 항해 루프입니다.</p>
          </div>
          <span className="hud-chip hud-chip-accent">Fuel {Math.round(fuel)}%</span>
        </div>
        <div className="mt-3">
          <StarMap zones={zones} currentZoneId={currentNodeId} selectedZoneId={selectedNodeId} discoveredZoneIds={discovered} route={route} activeTravel={travel ? { ...travel, fromZoneId: travel.fromId, toZoneId: travel.toId } : null} currentMinute={currentMinute} onSelect={handleSelect} sectorName={sector.name} exploredCount={discovered.length} totalCount={nodes.length} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Info label="현재 노드" value={current?.name ?? "-"} />
          <Info label="발견" value={`${discovered.length}/${nodes.length}`} />
          <Info label="영입 후보" value={`${recruitCandidates.length}명`} />
          <Info label="상태" value={pendingEncounter ? "조우 대기" : travel ? travel.missionId ? "임무 항해" : "항해 중" : driftState ? "표류" : "정박"} tone={pendingEncounter || driftState ? "text-red-300" : travel ? "text-amber-300" : ""} />
        </div>
      </section>

      <aside className="space-y-4">
        <EncounterCard encounter={pendingEncounter} onResolve={handleResolve} />
        <ActiveMissionPanel mission={activeMission} currentNodeId={currentNodeId} travel={travel} onPlan={handlePlanMission} />

        {travel && (
          <section>
            <div className="section-title"><Clock3 size={18} />{travel.missionId ? "임무 항해 상황판" : "항해 상황판"}</div>
            <div className="mt-4 rounded border border-amber-300/35 bg-amber-300/10 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  {travel.missionTitle && <div className="mb-1 text-xs font-bold text-cyan-200">{travel.missionTitle}</div>}
                  <div className="font-semibold text-amber-100">{travelFrom?.name} → {travelTo?.name}</div>
                  <div className="mt-1 text-xs text-slate-400">도착 {formatGameDate(travel.completeAt)}</div>
                </div>
                <span className="hud-chip hud-chip-warn">{Math.round(travelProgress)}%</span>
              </div>
              <div className="hud-gauge mt-3"><span className="hud-gauge-fill" style={{ width: `${travelProgress}%` }} /></div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm"><Info label="남은 시간" value={formatMinutes(Math.max(0, Math.ceil(travel.completeAt - currentMinute)))} /><Info label="예상 연료" value={`${travel.fuelCost.toFixed(1)}`} /></div>
            </div>
          </section>
        )}

        {driftState && <section className="rounded border border-red-400/45 bg-red-400/10 p-4"><div className="section-title"><Fuel size={18} />표류 상태</div><p className="mt-2 text-sm leading-6 text-slate-300">연료가 고갈되어 이동이 정지했습니다. 데드락 방지를 위해 긴급 구조 보급을 받을 수 있습니다.</p><button className="primary-button mt-4 w-full" onClick={handleEmergencyRefuel}>긴급 보급 수신</button></section>}

        {!pendingEncounter && !travel && !driftState && selected && (
          <section>
            <div className="section-title"><Route size={18} />목적지 결재</div>
            <div className="mt-4 rounded border border-cyan-400/30 bg-cyan-400/10 p-4">
              <div className="flex items-start justify-between gap-3"><div><div className="text-lg font-black text-slate-50">{NODE_TYPE_ICONS[selected.type]} {selected.name}</div><div className="mt-1 text-sm text-slate-400">{NODE_TYPE_LABELS[selected.type]} · 위험 {selected.danger} · 자원 {selected.richness}</div></div><span className={`hud-chip ${dangerChipClass(selected.danger)}`}>위험 {selected.danger}</span></div>
              {isCurrent ? <p className="mt-3 text-sm text-slate-400">현재 위치입니다. 연결된 노드를 선택해 다음 항로를 결재하세요.</p> : <div className="mt-3 grid grid-cols-2 gap-2 text-sm"><Info label="거리" value={`${plannedDistance.toFixed(1)}u`} /><Info label="예상 시간" value={formatMinutes(Math.max(18, Math.round(plannedDistance * 11)))} /></div>}
              <button className="primary-button mt-4 w-full" disabled={isCurrent || fuel <= 0} onClick={handlePlan}><Rocket size={16} />이 경로로 항해</button>
            </div>
          </section>
        )}

        <section><div className="section-title">항해 로그</div><div className="mt-3 grid gap-2">{navLog.slice(0, 8).map((entry, index) => <div key={`${entry}-${index}`} className="rounded border border-slate-700/70 bg-slate-950/60 px-3 py-2 text-xs leading-5 text-slate-300">{entry}</div>)}</div></section>
      </aside>
    </div>
  );
}
