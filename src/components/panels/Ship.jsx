import { useMemo, useState } from "react";
import { Cpu, Hammer, Rocket, Wrench, Zap } from "lucide-react";
import ShipInterior from "../ship/ShipInterior";
import RoomDetailPanel from "../ship/RoomDetailPanel";
import { JOB_DURATION, JOB_ECONOMY } from "../../data/constants";
import { formatMinutes } from "../../data/moduleRecipes";
import { formatGameDate } from "../../systems/gameClock";
import { computeJobRefund } from "../../systems/jobEconomy";
import { explainBacklogReason } from "../../systems/jobScheduler";
import { jobTypeLabel } from "../../systems/jobMigration";
import { reactorCapacity, totalPowerDraw } from "../../systems/powerSystem";
import { useCrewStore } from "../../stores/crewStore";
import { useGameStore } from "../../stores/gameStore";
import { useInventoryStore } from "../../stores/inventoryStore";
import { useEquipmentStore } from "../../stores/equipmentStore";
import { useIncidentStore } from "../../stores/incidentStore";
import { useJobStore } from "../../stores/jobStore";
import { useShipInteriorStore } from "../../stores/shipInteriorStore";
import { useShipStore } from "../../stores/shipStore";
import { useSkillStore } from "../../stores/skillStore";
import { useNavStore } from "../../stores/navStore";
import { applyHullRepair, getSkillEffects } from "../../systems/skillEffects";
import { crewWorkPreviewLabel, getCrewWorkCandidates, prepareCrewWorkSnapshot } from "../../systems/crewWorkProjection";
import { cancelEventChainJob } from "../../orchestration/eventChainOrchestrator";
import IncidentWorkTracker from "../ui/IncidentWorkTracker";

const activeJobStatuses = new Set(["backlog", "assigned", "in_progress"]);
const SCRAP_REPAIR_COST = JOB_ECONOMY.hullRepair.salvageScrapCost;
const SCRAP_REPAIR_HULL = JOB_ECONOMY.hullRepair.hullDelta;
const SCRAP_REPAIR_MINUTES = JOB_DURATION.hull_repair;
const SALVAGE_PROCESS_COST = JOB_ECONOMY.salvageProcessing.salvageScrapCost;
const SALVAGE_PROCESS_TRITANIUM = JOB_ECONOMY.salvageProcessing.tritaniumReward;
const SALVAGE_PROCESS_MINUTES = JOB_DURATION.salvage;

function getItemQty(items, itemId) {
  return items.find((item) => item.id === itemId)?.qty ?? 0;
}

export function Progress({ task, currentMinute, label = "작업 진행" }) {
  const duration = task.effectiveDuration ?? task.duration ?? 1;
  const rawProgress = task.progress !== undefined ? task.progress * 100 : ((currentMinute - (task.startedAt ?? currentMinute)) / Math.max(1, duration)) * 100;
  const progress = Math.max(0, Math.min(100, Math.round(rawProgress)));
  const remaining = Math.max(0, Math.round(duration * (1 - progress / 100)));
  const completeAt = task.startedAt !== null && task.startedAt !== undefined ? task.startedAt + duration : task.completeAt;
  return (
    <div className="mt-3 rounded-xl border border-cyan-400/30 bg-cyan-400/10 p-3">
      <div className="mb-1 flex items-center justify-between text-xs"><span className="hud-label">{label}</span><span className="hud-value">{progress}%</span></div>
      <div className="hud-gauge"><span className="hud-gauge-fill" style={{ width: `${progress}%` }} /></div>
      <div className="mt-2 text-xs text-slate-400">남은 시간 {formatMinutes(remaining)} · 예상 완료 {completeAt ? formatGameDate(completeAt) : "대기 중"}</div>
    </div>
  );
}

function CrewWorkAssignment({ jobType, crew, equipmentInstances, sectorId, duration, workerId, setWorkerId, useSpecialty, setUseSpecialty }) {
  const candidates = useMemo(() => getCrewWorkCandidates({ jobType, crew, equipmentInstances }), [jobType, crew, equipmentInstances]);
  const member = crew.find((entry) => entry.id === workerId);
  const normal = member ? prepareCrewWorkSnapshot({ jobType, member, equipmentInstances, sectorId }) : null;
  const specialty = member ? prepareCrewWorkSnapshot({ jobType, member, equipmentInstances, sectorId, useSpecialty: true }) : null;
  return <div className="mt-3 rounded-xl border border-slate-700/70 bg-slate-950/60 p-3 text-xs"><div className="font-black text-slate-100">담당 승무원 · 결재 시 실효수치/ETA 고정</div><select className="mt-2 w-full rounded-lg border border-slate-600 bg-slate-950 px-2 py-1.5 text-slate-100" value={workerId} onChange={(event) => { setWorkerId(event.target.value); setUseSpecialty(false); }}><option value="">직접 지정</option>{candidates.map((candidate) => <option key={candidate.leadCrewId} value={candidate.leadCrewId}>{crew.find((entry) => entry.id === candidate.leadCrewId)?.name ?? candidate.leadCrewId} · {candidate.profile.base}→{candidate.profile.effective} · {candidate.tier === "expert" ? "전문" : candidate.tier === "assist" ? "지원" : candidate.tier === "below" ? "미달" : "표준"}</option>)}</select>{normal?.ok && <div className="mt-2 text-cyan-100">{crewWorkPreviewLabel(normal, duration)}{normal.lead.profile.gearDescription ? ` · ${normal.lead.profile.gearDescription}` : ""}</div>}{workerId && !normal?.ok && <div className="mt-2 text-red-200">지정 불가: {normal?.reason ?? "승무원 상태"}</div>}{specialty?.ok && <label className="mt-2 flex items-center gap-2 text-violet-100"><input type="checkbox" checked={useSpecialty} onChange={(event) => setUseSpecialty(event.target.checked)} />{specialty.specialty.id === "signal-separation" ? "신호 분리 사용 · -60분" : "우회 배선 사용 · -30분"} · 이번 구역 1회</label>}{useSpecialty && specialty?.ok && <div className="mt-1 text-violet-200">특기 적용 ETA: {crewWorkPreviewLabel(specialty, duration)}</div>}</div>;
}

function ScrapRepairCard({ hull, scrap, task, currentMinute, onRepair, repairAmount = SCRAP_REPAIR_HULL, assignment }) {
  const canRepair = hull < 100 && scrap >= SCRAP_REPAIR_COST && !task && Boolean(assignment?.workerId);
  return (
    <section className="mt-4 rounded-2xl border border-amber-300/35 bg-amber-300/10 p-4">
      <div className="flex items-start justify-between gap-3"><div><div className="section-title"><Hammer size={18} />캠페인 응급 정비</div><p className="mt-2 text-sm leading-6 text-slate-300">폐자재로 선체 정비 작업을 대기열에 올립니다. 기관실 슬롯이 비어야 시작됩니다.</p></div><span className="hud-chip hud-chip-warn">Scrap {scrap}</span></div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-sm"><div className="mission-stat-tile"><span>Hull</span><span>{Math.round(hull)}%</span></div><div className="mission-stat-tile"><span>비용</span><span>Scrap {SCRAP_REPAIR_COST}</span></div><div className="mission-stat-tile"><span>복구</span><span>+{repairAmount}% / {formatMinutes(SCRAP_REPAIR_MINUTES)}</span></div></div>
      {assignment?.control}
      {task && <Progress task={task} currentMinute={currentMinute} label="선체 정비 진행" />}
      <button className="primary-button mt-4 w-full justify-center" disabled={!canRepair} onClick={onRepair}>{task ? "정비 대기/진행 중" : hull >= 100 ? "선체 양호" : scrap < SCRAP_REPAIR_COST ? "폐자재 부족" : "선체 정비 지시"}</button>
    </section>
  );
}

function SalvageProcessingCard({ scrap, tritanium, task, currentMinute, onProcess, assignment }) {
  const canProcess = scrap >= SALVAGE_PROCESS_COST && !task && Boolean(assignment?.workerId);
  return (
    <section className="mt-4 rounded-2xl border border-cyan-300/30 bg-cyan-300/10 p-4">
      <div className="flex items-start justify-between gap-3"><div><div className="section-title"><Cpu size={18} />잔해 분해 작업</div><p className="mt-2 text-sm leading-6 text-slate-300">폐자재를 창고 작업으로 분해합니다. 창고 슬롯과 기관실 크루가 필요합니다.</p></div><span className="hud-chip hud-chip-accent">Ti {tritanium}</span></div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-sm"><div className="mission-stat-tile"><span>입력</span><span>Scrap {SALVAGE_PROCESS_COST}</span></div><div className="mission-stat-tile"><span>출력</span><span>Ti +{SALVAGE_PROCESS_TRITANIUM + Number(assignment?.preview?.outcome?.outputBonus ?? 0)}</span></div><div className="mission-stat-tile"><span>시간</span><span>{formatMinutes(SALVAGE_PROCESS_MINUTES)}</span></div></div>
      {assignment?.control}
      {task && <Progress task={task} currentMinute={currentMinute} label="잔해 분해 진행" />}
      <button className="secondary-button mt-4 w-full justify-center" disabled={!canProcess} onClick={onProcess}>{task ? "분해 대기/진행 중" : scrap < SALVAGE_PROCESS_COST ? "폐자재 부족" : "잔해 분해 지시"}</button>
    </section>
  );
}

function RoomSlotPanel({ rooms, jobs }) {
  return (
    <section className="rounded-2xl border border-slate-700/70 bg-slate-950/60 p-4">
      <div className="section-title"><Wrench size={18} />방 슬롯 & 부하</div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {Object.values(rooms).map((room) => {
          const active = jobs.filter((job) => ["assigned", "in_progress"].includes(job.status) && job.roomId === room.id);
          const full = active.length >= room.slotCapacity;
          const loadPct = Math.min(100, Math.round((room.currentLoad / Math.max(1, room.loadThreshold)) * 100));
          return <div key={room.id} className={`rounded-xl border p-3 ${full ? "border-amber-300/50 bg-amber-300/10" : "border-slate-700/70 bg-slate-900/70"}`}><div className="flex items-center justify-between gap-2"><div className="font-black text-slate-100">{room.label}</div><span className="hud-chip">슬롯 {active.length}/{room.slotCapacity}</span></div><div className="mt-2 hud-gauge"><span className="hud-gauge-fill" style={{ width: `${loadPct}%` }} /></div><div className="mt-2 text-xs text-slate-400">부하 {room.currentLoad}/{room.loadThreshold}</div><div className="mt-2 grid gap-1.5">{active.map((job) => <div key={job.id} className="rounded-lg border border-cyan-300/25 bg-cyan-300/10 px-2 py-1 text-xs text-cyan-100">{jobTypeLabel(job.type)} · {job.status} · {Math.round((job.progress ?? 0) * 100)}%</div>)}{active.length === 0 && <div className="text-xs text-slate-500">진행 중 작업 없음</div>}</div></div>;
        })}
      </div>
    </section>
  );
}

function BacklogPanel({ jobs, rooms, crew, onUp, onDown, onCancel }) {
  const backlog = [...jobs].filter((job) => job.status === "backlog").sort((a, b) => a.priority - b.priority || a.createdAt - b.createdAt);
  return (
    <section className="rounded-2xl border border-slate-700/70 bg-slate-950/60 p-4">
      <div className="section-title">Backlog 큐</div>
      <div className="mt-3 grid gap-2">
        {backlog.map((job) => {
          const reason = explainBacklogReason(job, jobs, rooms, crew);
          return <div key={job.id} className="rounded-xl border border-slate-700/70 bg-slate-900/70 p-3"><div className="flex items-start justify-between gap-2"><div><div className="font-black text-slate-100">{jobTypeLabel(job.type)}</div><div className="mt-1 text-xs text-slate-400">{rooms[job.roomId]?.label ?? job.roomId} · 우선순위 {job.priority}</div></div><span className={`hud-chip ${reason === "슬롯 대기" ? "hud-chip-warn" : reason === "크루 대기" ? "hud-chip-danger" : "hud-chip-accent"}`}>{reason}</span></div><div className="mt-3 grid grid-cols-3 gap-2"><button className="secondary-button justify-center" onClick={() => onUp(job.id)}>▲</button><button className="secondary-button justify-center" onClick={() => onDown(job.id)}>▼</button><button className="secondary-button justify-center" onClick={() => onCancel(job)}>취소</button></div></div>;
        })}
        {backlog.length === 0 && <div className="text-sm text-slate-500">대기 중인 작업이 없습니다.</div>}
      </div>
    </section>
  );
}

export default function Ship() {
  const skillLevels = useSkillStore((state) => state.levels);
  const { modules, installed } = useShipStore();
  const shipGrade = useGameStore((state) => state.shipGrade);
  const crewInterior = useCrewStore((state) => state.crew);
  const crewActivities = useCrewStore((state) => state.crewActivities ?? []);
  const interiorRooms = useShipInteriorStore((state) => state.rooms);
  const activeCrises = useShipInteriorStore((state) => state.activeCrises ?? []);
  const activeVesselId = useShipStore((state) => state.activeVesselId);
  const incidentRuntimesById = useIncidentStore((state) => state.runtimesById);
  const engineeringTier = interiorRooms.engineering?.tier ?? 1;
  const rawJobs = useJobStore((state) => state.jobs);
  const jobs = useMemo(() => rawJobs.filter((job) => activeJobStatuses.has(job.status)), [rawJobs]);
  const rooms = useJobStore((state) => state.rooms);
  const startShipWork = useJobStore((state) => state.enqueueShipWork);
  const nudgeJobPriority = useJobStore((state) => state.nudgeJobPriority);
  const cancelJob = useJobStore((state) => state.cancelJob);
  const crew = useCrewStore((state) => state.crew);
  const claimSpecialtyUse = useCrewStore((state) => state.claimSpecialtyUse);
  const equipmentInstances = useEquipmentStore((state) => state.instances);
  const sectorIndex = useNavStore((state) => state.sectorIndex ?? 0);
  const resources = useGameStore((state) => state.resources);
  const currentMinute = useGameStore((state) => state.currentMinute);
  const addResources = useGameStore((state) => state.addResources);
  const addLog = useGameStore((state) => state.addLog);
  const items = useInventoryStore((state) => state.items);
  const addItem = useInventoryStore((state) => state.addItem);
  const removeItem = useInventoryStore((state) => state.removeItem);
  const [selectedRoomId, setSelectedRoomId] = useState(null);
  const [repairWorkerId, setRepairWorkerId] = useState("");
  const [salvageWorkerId, setSalvageWorkerId] = useState("");
  const [repairSpecialty, setRepairSpecialty] = useState(false);
  const [salvageSpecialty, setSalvageSpecialty] = useState(false);
  const activeIncidents = useMemo(() => Object.values(incidentRuntimesById).filter((runtime) => runtime.vesselId === activeVesselId && ["queued", "pending", "settling", "waitingJob", "monitoring"].includes(runtime.status)), [incidentRuntimesById, activeVesselId]);

  const tritanium = getItemQty(items, "tritanium");
  const salvageScrap = getItemQty(items, "salvage-scrap");
  const modulesById = useMemo(() => new Map(modules.map((module) => [module.id, module])), [modules]);
  const installedModules = useMemo(() => Object.values(installed).map((id) => modulesById.get(id)).filter(Boolean), [installed, modulesById]);
  const powerCapacity = reactorCapacity(shipGrade, engineeringTier);
  const powerDraw = totalPowerDraw(installedModules);
  const hullRepairTask = jobs.find((task) => task.type === "hull_repair") ?? null;
  const salvageProcessingTask = jobs.find((task) => task.type === "salvage") ?? null;
  const sectorId = `sector:${sectorIndex}`;

  const prepareAssignment = (jobType, workerId, useSpecialty) => {
    const member = crew.find((entry) => entry.id === workerId);
    return prepareCrewWorkSnapshot({ jobType, member, equipmentInstances, sectorId, useSpecialty });
  };
  const repairPreview = repairWorkerId ? prepareAssignment("hull_repair", repairWorkerId, repairSpecialty) : null;
  const salvagePreview = salvageWorkerId ? prepareAssignment("salvage", salvageWorkerId, salvageSpecialty) : null;
  // Completion deliberately uses the live repair doctrine, but it applies that
  // doctrine to the entire snapped base+crew result. Mirror that composition
  // here; a later doctrine change is still called out as a live modifier.
  const repairPreviewAmount = applyHullRepair(SCRAP_REPAIR_HULL + Number(repairPreview?.outcome?.hullDelta ?? 0), getSkillEffects(skillLevels).repair);

  const repairWithScrap = () => {
    if (resources.hull >= 100) return addLog("선체 정비 불필요: 이미 선체 상태가 양호합니다.");
    if (hullRepairTask) return addLog("선체 정비 실패: 이미 정비 작업이 대기/진행 중입니다.");
    if (salvageScrap < SCRAP_REPAIR_COST) return addLog(`선체 정비 실패: 폐자재 ${SCRAP_REPAIR_COST}개가 필요합니다.`);
    const snapshot = prepareAssignment("hull_repair", repairWorkerId, repairSpecialty);
    if (!snapshot.ok) return addLog(`선체 정비 실패: ${snapshot.reason ?? "담당 승무원 지정 필요"}.`);
    if (snapshot.specialty) { const claimed = claimSpecialtyUse({ crewId: snapshot.specialty.crewId, sectorId, claimId: `job:${currentMinute}:hull_repair:${snapshot.workerCrewId}` }); if (!claimed.ok) return addLog(`선체 정비 특기 실패: ${claimed.reason}.`); }
    removeItem("salvage-scrap", SCRAP_REPAIR_COST);
    startShipWork({ type: "hullRepair", roomId: "engineering", cost: SCRAP_REPAIR_COST, duration: SCRAP_REPAIR_MINUTES, priority: "high", createdAt: currentMinute, workerCrewId: snapshot.workerCrewId, workerSnapshot: snapshot, payload: { hullDelta: SCRAP_REPAIR_HULL, inputItems: [{ itemId: "salvage-scrap", qty: SCRAP_REPAIR_COST }] } });
    return addLog(`선체 정비 대기열 등록: ${crewWorkPreviewLabel(snapshot, SCRAP_REPAIR_MINUTES)} · ${crew.find((entry) => entry.id === snapshot.workerCrewId)?.name ?? snapshot.workerCrewId} 지정.`);
  };

  const processSalvage = () => {
    if (salvageProcessingTask) return addLog("잔해 분해 실패: 이미 분해 작업이 대기/진행 중입니다.");
    if (salvageScrap < SALVAGE_PROCESS_COST) return addLog(`잔해 분해 실패: 폐자재 ${SALVAGE_PROCESS_COST}개가 필요합니다.`);
    const snapshot = prepareAssignment("salvage", salvageWorkerId, salvageSpecialty);
    if (!snapshot.ok) return addLog(`잔해 분해 실패: ${snapshot.reason ?? "담당 승무원 지정 필요"}.`);
    removeItem("salvage-scrap", SALVAGE_PROCESS_COST);
    startShipWork({ type: "salvageProcessing", roomId: "cargo", cost: SALVAGE_PROCESS_COST, duration: SALVAGE_PROCESS_MINUTES, priority: "normal", createdAt: currentMinute, workerCrewId: snapshot.workerCrewId, workerSnapshot: snapshot, payload: { inputItems: [{ itemId: "salvage-scrap", qty: SALVAGE_PROCESS_COST }], outputItems: [{ itemId: "tritanium", qty: SALVAGE_PROCESS_TRITANIUM }] } });
    return addLog(`잔해 분해 대기열 등록: ${crewWorkPreviewLabel(snapshot, SALVAGE_PROCESS_MINUTES)} · ${crew.find((entry) => entry.id === snapshot.workerCrewId)?.name ?? snapshot.workerCrewId} 지정.`);
  };

  const refundCancelledJob = (job) => {
    const { items: refundItems, credits } = computeJobRefund(job);
    const refundedItems = [];
    refundItems.forEach(({ itemId, qty }) => {
      addItem(itemId, qty);
      refundedItems.push(`${itemId} +${qty}`);
    });
    if (credits > 0) {
      addResources({ credits });
      refundedItems.push(`₢${credits}`);
    }
    return refundedItems;
  };

  const cancelQueuedJob = (job) => {
    if (job.payload?.story) {
      const storyResult = cancelEventChainJob({ jobId: job.id, currentMinute });
      return addLog(storyResult.ok ? (storyResult.refunded ? "연속 사건 작업 취소: 시작 전 소모품을 환급했습니다." : "연속 사건 작업 취소: 선택 단계로 돌아갑니다.") : "작업 취소 실패: 진행 중 작업은 취소할 수 없습니다.");
    }
    const result = cancelJob(job.id);
    if (!result.ok) return addLog("작업 취소 실패: 진행 중 작업은 취소할 수 없습니다.");
    const refunds = refundCancelledJob(result.job ?? job);
    return addLog(refunds.length > 0 ? `작업 취소: 진행 전 작업 취소, 환급 ${refunds.join(", ")}.` : "작업 취소: 진행 전 작업을 취소했습니다.");
  };

  return (
    <div className="grid gap-4">
      <IncidentWorkTracker vesselId={activeVesselId} />
      <section>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="section-title"><Rocket size={18} />함선 도면</div>
            <p className="mt-2 text-sm text-slate-400">방을 클릭하면 장비·방 개조·근무 현황을 확인할 수 있습니다. 장비는 소속된 방의 전력 예산을 함께 사용합니다.</p>
          </div>
          <div className="flex flex-wrap justify-end gap-1.5">
            <span className="hud-chip hud-chip-accent">Ti {tritanium}</span>
            <span className="hud-chip hud-chip-warn">Scrap {salvageScrap}</span>
            <span className={`hud-chip ${powerDraw > powerCapacity ? "hud-chip-danger" : ""}`}><Zap size={12} className="mr-1 inline" />동력 {powerDraw}/{powerCapacity}</span>
            <span className="hud-chip">작업 {jobs.length}</span>
          </div>
        </div>
        <div className="mt-4">
          <ShipInterior crew={crewInterior} activities={crewActivities} rooms={interiorRooms} activeCrises={activeCrises} incidents={activeIncidents} showEquipment onRoomClick={setSelectedRoomId} />
        </div>
        <ScrapRepairCard hull={resources.hull} scrap={salvageScrap} task={hullRepairTask} currentMinute={currentMinute} onRepair={repairWithScrap} repairAmount={repairPreviewAmount} assignment={{ workerId: repairWorkerId, preview: repairPreview, control: <CrewWorkAssignment jobType="hull_repair" crew={crew} equipmentInstances={equipmentInstances} sectorId={sectorId} duration={SCRAP_REPAIR_MINUTES} workerId={repairWorkerId} setWorkerId={setRepairWorkerId} useSpecialty={repairSpecialty} setUseSpecialty={setRepairSpecialty} /> }} />
        <SalvageProcessingCard scrap={salvageScrap} tritanium={tritanium} task={salvageProcessingTask} currentMinute={currentMinute} onProcess={processSalvage} assignment={{ workerId: salvageWorkerId, preview: salvagePreview, control: <CrewWorkAssignment jobType="salvage" crew={crew} equipmentInstances={equipmentInstances} sectorId={sectorId} duration={SALVAGE_PROCESS_MINUTES} workerId={salvageWorkerId} setWorkerId={setSalvageWorkerId} useSpecialty={salvageSpecialty} setUseSpecialty={setSalvageSpecialty} /> }} />
      </section>
      <section className="grid gap-4">
        <RoomSlotPanel rooms={rooms} jobs={jobs} />
        <BacklogPanel jobs={jobs} rooms={rooms} crew={crew} onUp={(id) => nudgeJobPriority(id, -1)} onDown={(id) => nudgeJobPriority(id, 1)} onCancel={cancelQueuedJob} />
      </section>
      <RoomDetailPanel roomId={selectedRoomId} onClose={() => setSelectedRoomId(null)} />
    </div>
  );
}
