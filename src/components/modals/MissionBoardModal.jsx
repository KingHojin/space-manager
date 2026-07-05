import { AlertTriangle, Briefcase, CheckCircle2, Clock3, MapPin, RefreshCw, ShieldAlert, Sparkles } from "lucide-react";
import { useEffect, useMemo } from "react";
import { useGameStore } from "../../stores/gameStore";
import { useMissionStore } from "../../stores/missionStore";
import { useNavStore } from "../../stores/navStore";
import { useShipStore } from "../../stores/shipStore";

function riskTone(risk) {
  if (risk === "extreme") return "border-red-400/60 bg-red-400/15 text-red-100";
  if (risk === "high") return "border-amber-300/55 bg-amber-300/15 text-amber-100";
  if (risk === "medium") return "border-cyan-300/45 bg-cyan-300/12 text-cyan-100";
  return "border-emerald-300/40 bg-emerald-300/10 text-emerald-100";
}

function rewardLabel(key, value) {
  const labels = {
    dust: "Dust",
    scrap: "Scrap",
    reputation: "평판",
    chartData: "항로 데이터",
    oreSample: "광석 샘플",
    researchData: "연구 데이터",
    tradeVoucher: "거래권",
    blueprintChance: "설계도 확률",
    recruitChance: "영입 확률",
    artifactChance: "유물 확률",
  };
  const label = labels[key] ?? key;
  if (/Chance$/.test(key)) return `${label} ${Math.round((value ?? 0) * 100)}%`;
  return `${label} ${value}`;
}

function MissionRewardList({ reward = {} }) {
  const entries = Object.entries(reward).filter(([, value]) => value !== null && value !== undefined && value !== 0);
  if (entries.length === 0) return <span className="text-xs text-slate-500">보상 미정</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {entries.map(([key, value]) => <span key={key} className="hud-chip bg-slate-950/50">{rewardLabel(key, value)}</span>)}
    </div>
  );
}

function ActiveMissionCard({ mission, vesselName, onAbandon }) {
  if (!mission) return null;
  return (
    <section className="rounded border border-cyan-300/35 bg-cyan-300/10 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="section-title"><CheckCircle2 size={18} />진행 중 임무</div>
          <h3 className="mt-3 text-lg font-black text-slate-50">{mission.title}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-300">{mission.summary}</p>
        </div>
        <span className="hud-chip hud-chip-accent shrink-0">{vesselName}</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <Info label="의뢰인" value={mission.client} />
        <Info label="목적지" value={mission.destinationName} />
        <Info label="위험" value={mission.riskLabel} />
        <Info label="거리" value={mission.distanceLabel} />
      </div>
      <div className="mt-3"><MissionRewardList reward={mission.reward} /></div>
      <p className="mt-3 text-xs leading-5 text-slate-400">PR B에서는 수락 상태만 기록합니다. 실제 항로 연결과 보상 지급은 다음 PR에서 붙입니다.</p>
      <button className="secondary-button mt-3 w-full justify-center" onClick={onAbandon}>임무 포기</button>
    </section>
  );
}

function MissionCard({ mission, disabled, onAccept }) {
  const tone = riskTone(mission.risk);
  return (
    <article className={`rounded border p-4 ${tone}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap gap-1.5">
            <span className="hud-chip bg-slate-950/45">{mission.client}</span>
            <span className="hud-chip bg-slate-950/45">{mission.category}</span>
          </div>
          <h3 className="mt-3 text-lg font-black text-slate-50">{mission.title}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-300">{mission.summary}</p>
        </div>
        <ShieldAlert className="shrink-0" size={22} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <Info label="위험도" value={mission.riskLabel} />
        <Info label="거리" value={mission.distanceLabel} />
        <Info label="목적지" value={mission.destinationName} />
        <Info label="위험 수치" value={mission.destinationDanger ?? "?"} />
      </div>
      <div className="mt-3">
        <div className="hud-label mb-1.5">보상 미리보기</div>
        <MissionRewardList reward={mission.reward} />
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {(mission.tags ?? []).slice(0, 4).map((tag) => <span key={tag} className="rounded border border-slate-600/70 bg-slate-950/45 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-300">{tag}</span>)}
      </div>
      <button className="primary-button mt-4 w-full justify-center" disabled={disabled} onClick={() => onAccept(mission.id)}>{disabled ? "함선 임무 진행 중" : "임무 수락"}</button>
    </article>
  );
}

function Info({ label, value }) {
  return <div className="rounded border border-slate-700/70 bg-slate-950/60 px-3 py-2"><div className="hud-label">{label}</div><div className="mt-1 truncate font-bold text-slate-100">{value}</div></div>;
}

export default function MissionBoardModal() {
  const currentMinute = useGameStore((state) => state.currentMinute);
  const addLog = useGameStore((state) => state.addLog);
  const sector = useNavStore((state) => state.sector);
  const currentNodeId = useNavStore((state) => state.currentNodeId);
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
    const result = acceptMission({ scopeId, missionId, vesselId: activeVesselId, currentMinute });
    if (!result.ok) {
      addLog(`임무 수락 실패: ${result.reason}`);
      return;
    }
    addLog(`임무 수락: ${result.mission.title}. 목적지 ${result.mission.destinationName}.`);
  };

  const handleAbandon = () => {
    const result = abandonMission({ vesselId: activeVesselId, currentMinute });
    addLog(result.ok ? `임무 포기: ${result.mission.title}.` : `임무 포기 실패: ${result.reason}`);
  };

  const missions = board?.missions ?? [];
  const vesselName = vessel?.name ?? activeVesselId ?? "선택 함선";

  return (
    <div className="grid gap-4">
      <section className="rounded border border-slate-700/80 bg-slate-950/50 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="section-title"><Briefcase size={18} />계약 임무 게시판</div>
            <p className="mt-2 text-sm leading-6 text-slate-400">현재 노드 주변에서 수락 가능한 임무입니다. PR B에서는 수락 상태까지만 연결하고, 항해 자동 시작은 다음 PR에서 붙입니다.</p>
          </div>
          <button className="secondary-button" onClick={handleRefresh}><RefreshCw size={15} />새로고침</button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          <Info label="현재 위치" value={currentNode?.name ?? "미확인"} />
          <Info label="게시판" value={scopeId} />
          <Info label="갱신" value={board ? `${expiresIn}시간 후` : "생성 중"} />
          <Info label="함선" value={vesselName} />
        </div>
      </section>

      <ActiveMissionCard mission={activeMission} vesselName={vesselName} onAbandon={handleAbandon} />

      {!activeMission && missions.length === 0 && (
        <section className="rounded border border-amber-300/35 bg-amber-300/10 p-4">
          <div className="section-title"><AlertTriangle size={18} />임무 없음</div>
          <p className="mt-2 text-sm leading-6 text-slate-300">현재 게시판에서 표시할 임무가 없습니다. 새로고침을 시도하세요.</p>
        </section>
      )}

      <section>
        <div className="flex items-center justify-between gap-2">
          <div className="section-title"><MapPin size={18} />수락 가능 임무</div>
          <span className="hud-chip hud-chip-accent">{missions.length}건</span>
        </div>
        <div className="mt-3 grid gap-3 xl:grid-cols-3">
          {missions.map((mission) => <MissionCard key={mission.id} mission={mission} disabled={Boolean(activeMission)} onAccept={handleAccept} />)}
        </div>
      </section>

      <section>
        <div className="section-title"><Clock3 size={18} />임무 로그</div>
        <div className="mt-3 grid gap-2">
          {missionLog.slice(0, 5).map((entry, index) => <div key={`${entry}-${index}`} className="rounded border border-slate-700/70 bg-slate-950/60 px-3 py-2 text-xs leading-5 text-slate-300">{entry}</div>)}
          {missionLog.length === 0 && <div className="rounded border border-slate-700/70 bg-slate-950/60 px-3 py-2 text-xs leading-5 text-slate-500">아직 임무 기록이 없습니다.</div>}
        </div>
      </section>

      <section className="rounded border border-violet-300/30 bg-violet-300/10 p-4">
        <div className="section-title"><Sparkles size={18} />다음 PR 연결 예정</div>
        <p className="mt-2 text-sm leading-6 text-slate-300">임무 수락 후 목적지 자동 선택, 항로 결재, 도착 시 임무 완료/실패 판정, 실제 보상 지급은 PR C/D에서 단계적으로 연결합니다.</p>
      </section>
    </div>
  );
}
