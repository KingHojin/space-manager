import { AlertTriangle, Briefcase, CheckCircle2, Clock3, LockKeyhole, MapPin, RefreshCw, Sparkles } from "lucide-react";
import { useEffect, useMemo } from "react";
import { formatMinutes } from "../../data/moduleRecipes";
import { useGameStore } from "../../stores/gameStore";
import { useInventoryStore } from "../../stores/inventoryStore";
import { useMissionStore } from "../../stores/missionStore";
import { useNavStore } from "../../stores/navStore";
import { useShipStore } from "../../stores/shipStore";
import { MissionPoster, MissionStatStrip, RewardIconRow } from "../ui/MissionVisuals";

function Info({ label, value, tone = "" }) {
  return <div className="rounded border border-slate-700/70 bg-slate-950/60 px-3 py-2"><div className="hud-label">{label}</div><div className={`mt-1 truncate font-bold text-slate-100 ${tone}`}>{value}</div></div>;
}

function getItemQty(items, itemId) {
  return items.find((item) => item.id === itemId)?.qty ?? 0;
}

function ActiveMissionCard({ mission, vesselName, onAbandon, onOpenMap }) {
  if (!mission) return null;
  return (
    <section className="rounded border border-cyan-300/35 bg-cyan-300/10 p-4">
      <div className="grid gap-4 md:grid-cols-[14rem_minmax(0,1fr)]">
        <MissionPoster mission={mission} compact />
        <div className="min-w-0">
          <div className="flex items-start justify-between gap-3"><div><div className="section-title"><CheckCircle2 size={18} />진행 중 임무</div><h3 className="mt-2 text-xl font-black text-slate-50">{mission.title}</h3></div><span className="hud-chip hud-chip-accent shrink-0">{vesselName}</span></div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4"><Info label="의뢰인" value={mission.client} /><Info label="목적지" value={mission.destinationName} /><Info label="위험" value={mission.riskLabel} /><Info label="거리" value={mission.distanceLabel} /></div>
          <div className="mt-3"><RewardIconRow reward={mission.reward} /></div>
          <div className="mt-3 grid grid-cols-2 gap-2"><button className="secondary-button w-full justify-center" onClick={onOpenMap}>지도 보기</button><button className="secondary-button w-full justify-center" onClick={onAbandon}>임무 포기</button></div>
        </div>
      </div>
    </section>
  );
}

function MissionCard({ mission, disabled, routePreview, reputation, onAccept }) {
  const reputationRequired = mission.reputationRequired ?? 0;
  const reputationLocked = reputationRequired > reputation;
  const routeBlocked = !routePreview?.ok;
  const blocked = disabled || routeBlocked || reputationLocked;
  const buttonText = disabled ? "함선 임무 진행 중" : reputationLocked ? `평판 ${reputationRequired} 필요` : routePreview?.ok ? "수락하고 항해 시작" : "항로 불가";
  return (
    <article className={`mission-contract-card overflow-hidden rounded-2xl border p-3 ${reputationLocked ? "border-amber-300/45 bg-amber-300/10" : "border-slate-700/80 bg-slate-950/70"}`}>
      <MissionPoster mission={mission} routePreview={routePreview} />
      <div className="mt-3 flex items-start justify-between gap-3">
        <div className="min-w-0"><div className="flex flex-wrap gap-1.5"><span className="hud-chip bg-slate-950/60">{mission.client}</span><span className="hud-chip bg-slate-950/60">{mission.category}</span>{reputationRequired > 0 && <span className={`hud-chip ${reputationLocked ? "hud-chip-warn" : "hud-chip-success"}`}><LockKeyhole size={12} />평판 {reputationRequired}</span>}</div><h3 className="mt-2 truncate text-lg font-black text-slate-50">{mission.title}</h3></div>
        <span className="hud-chip hud-chip-accent shrink-0">{mission.riskLabel}</span>
      </div>
      <p className="mt-2 line-clamp-2 min-h-10 text-sm leading-5 text-slate-300">{mission.summary}</p>
      {reputationLocked && <p className="mt-2 rounded-xl border border-amber-300/35 bg-amber-300/10 px-3 py-2 text-xs leading-5 text-amber-100">이 의뢰인은 평판 {reputationRequired} 이상인 함대에게만 계약을 공개합니다. 평판은 소모되지 않습니다.</p>}
      <div className="mt-3"><MissionStatStrip mission={mission} routePreview={routePreview} /></div>
      <div className="mt-3"><RewardIconRow reward={mission.reward} /></div>
      <button className="primary-button mt-4 w-full justify-center" disabled={blocked} onClick={() => onAccept(mission.id)}>{buttonText}</button>
    </article>
  );
}

export default function MissionBoardModal({ onNavigate }) {
  const currentMinute = useGameStore((state) => state.currentMinute);
  const addLog = useGameStore((state) => state.addLog);
  const setPaused = useGameStore((state) => state.setPaused);
  const items = useInventoryStore((state) => state.items);
  const sector = useNavStore((state) => state.sector);
  const currentNodeId = useNavStore((state) => state.currentNodeId);
  const previewRoute = useNavStore((state) => state.previewRoute);
  const planRoute = useNavStore((state) => state.planRoute);
  const activeVesselId = useShipStore((state) => state.activeVesselId);
  const vessel = useShipStore((state) => state.vesselsById?.[state.activeVesselId]);
  const scopeId = `node:${currentNodeId ?? "unknown"}`;
  const board = useMissionStore((state) => state.boardsByScopeId[scopeId]);
  const activeMission = useMissionStore((state) => state.activeByVesselId[activeVesselId]);
  const missionLog = useMissionStore((state) => state.missionLog ?? []);
  const refreshBoard = useMissionStore((state) => state.refreshBoard);
  const acceptMission = useMissionStore((state) => state.acceptMission);
  const abandonMission = useMissionStore((state) => state.abandonMission);
  const currentNode = useMemo(() => sector?.nodes?.find((node) => node.id === currentNodeId), [sector, currentNodeId]);
  const expiresIn = Math.max(0, Math.ceil(((board?.expiresAt ?? currentMinute) - currentMinute) / 60));
  const reputation = getItemQty(items, "reputation-token");

  useEffect(() => {
    if (!sector || !currentNodeId) return;
    if (board && currentMinute < (board.expiresAt ?? 0)) return;
    refreshBoard({ scopeId, sector, currentNodeId, currentMinute, seed: `${sector.seed ?? sector.name}:${currentNodeId}`, force: !board });
  }, [board, currentMinute, currentNodeId, refreshBoard, scopeId, sector]);

  const handleRefresh = () => {
    const result = refreshBoard({ scopeId, sector, currentNodeId, currentMinute, seed: `${sector?.seed ?? sector?.name}:${currentNodeId}:manual`, force: true });
    addLog(result.ok ? "임무 게시판을 새로 갱신했습니다." : `임무 게시판 갱신 실패: ${result.reason}`);
  };

  const handleAccept = (missionId) => {
    const mission = (board?.missions ?? []).find((entry) => entry.id === missionId);
    if (!mission) return addLog("임무 수락 실패: 임무 정보를 찾을 수 없습니다.");
    if ((mission.reputationRequired ?? 0) > reputation) return addLog(`임무 수락 실패: 평판 ${mission.reputationRequired} 이상이 필요합니다. 현재 ${reputation}.`);
    const preview = previewRoute(mission.destinationNodeId, currentMinute);
    if (!preview.ok) return addLog(`임무 항로 설정 실패: ${preview.reason}`);
    const accepted = acceptMission({ scopeId, missionId, vesselId: activeVesselId, currentMinute, availableReputation: reputation });
    if (!accepted.ok) return addLog(accepted.reason === "reputationLocked" ? `임무 수락 실패: 평판 ${accepted.required} 필요, 현재 ${accepted.available}.` : `임무 수락 실패: ${accepted.reason}`);
    const planned = planRoute(mission.destinationNodeId, currentMinute, { missionId: accepted.mission.id, missionTitle: accepted.mission.title, missionDestinationName: accepted.mission.destinationName });
    if (!planned.ok) {
      abandonMission({ vesselId: activeVesselId, currentMinute });
      return addLog(`임무 항로 결재 실패: ${planned.reason}. 임무 수락을 취소했습니다.`);
    }
    setPaused(false);
    addLog(`임무 수락 및 항해 시작: ${accepted.mission.title}. 목적지 ${accepted.mission.destinationName}, 예상 ${formatMinutes(planned.travel.duration)}.`);
    return onNavigate?.("exploration");
  };

  const handleAbandon = () => {
    const result = abandonMission({ vesselId: activeVesselId, currentMinute });
    addLog(result.ok ? `임무 포기: ${result.mission.title}.` : `임무 포기 실패: ${result.reason}`);
  };

  const missions = board?.missions ?? [];
  const vesselName = vessel?.name ?? activeVesselId ?? "선택 함선";

  return (
    <div className="grid gap-4">
      <section className="rounded border border-slate-700/80 bg-slate-950/50 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="section-title"><Briefcase size={18} />계약 임무 게시판</div><p className="mt-2 text-sm leading-6 text-slate-400">임무를 포스터 카드로 고르고, 위험도·항로·보상만 빠르게 확인합니다.</p></div><button className="secondary-button" onClick={handleRefresh}><RefreshCw size={15} />새로고침</button></div><div className="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4"><Info label="현재 위치" value={currentNode?.name ?? "미확인"} /><Info label="게시판" value={scopeId} /><Info label="평판" value={`${reputation}`} tone="text-cyan-200" /><Info label="함선" value={vesselName} /></div><p className="mt-3 text-xs leading-5 text-slate-400">평판은 고위험 계약 접근권입니다. 수락할 때 소모되지 않습니다.</p></section>
      <ActiveMissionCard mission={activeMission} vesselName={vesselName} onAbandon={handleAbandon} onOpenMap={() => onNavigate?.("exploration")} />
      {!activeMission && missions.length === 0 && <section className="rounded border border-amber-300/35 bg-amber-300/10 p-4"><div className="section-title"><AlertTriangle size={18} />임무 없음</div><p className="mt-2 text-sm leading-6 text-slate-300">현재 게시판에서 표시할 임무가 없습니다. 새로고침을 시도하세요.</p></section>}
      <section><div className="flex items-center justify-between gap-2"><div className="section-title"><MapPin size={18} />수락 가능 임무</div><span className="hud-chip hud-chip-accent">{missions.length}건</span></div><div className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{missions.map((mission) => <MissionCard key={mission.id} mission={mission} routePreview={previewRoute(mission.destinationNodeId, currentMinute)} reputation={reputation} disabled={Boolean(activeMission)} onAccept={handleAccept} />)}</div></section>
      <section><div className="section-title"><Clock3 size={18} />임무 로그</div><div className="mt-3 grid gap-2">{missionLog.slice(0, 4).map((entry, index) => <div key={`${entry}-${index}`} className="rounded border border-slate-700/70 bg-slate-950/60 px-3 py-2 text-xs leading-5 text-slate-300">{entry}</div>)}{missionLog.length === 0 && <div className="rounded border border-slate-700/70 bg-slate-950/60 px-3 py-2 text-xs leading-5 text-slate-500">아직 임무 기록이 없습니다.</div>}</div></section>
      <section className="rounded border border-violet-300/30 bg-violet-300/10 p-4"><div className="section-title"><Sparkles size={18} />다음 개선 방향</div><p className="mt-2 text-sm leading-6 text-slate-300">다음 단계는 전투 연출보다 먼저, 전투 중 의미 있는 선택 구조와 함대 운영 연결을 설계하는 것입니다.</p></section>
    </div>
  );
}
