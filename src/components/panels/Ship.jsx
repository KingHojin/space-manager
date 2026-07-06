import { useMemo } from "react";
import { Cpu, Hammer, Rocket, Shield, Sparkles, Wrench, Zap } from "lucide-react";
import Badge from "../common/Badge";
import RoomCustomization from "../ship/RoomCustomization";
import { JOB_DURATION, JOB_ECONOMY, MODULE_SLOTS } from "../../data/constants";
import { formatMinutes, getModuleRule } from "../../data/moduleRecipes";
import { formatGameDate } from "../../systems/gameClock";
import { explainBacklogReason } from "../../systems/jobScheduler";
import { jobTypeLabel } from "../../systems/jobMigration";
import { useCrewStore } from "../../stores/crewStore";
import { useGameStore } from "../../stores/gameStore";
import { useInventoryStore } from "../../stores/inventoryStore";
import { useJobStore } from "../../stores/jobStore";
import { useShipStore } from "../../stores/shipStore";

const activeJobStatuses = new Set(["backlog", "assigned", "in_progress"]);
const upgradeMaterialQty = { common: 2, uncommon: 3, rare: 5, epic: 8, legendary: 12 };
const slotIcon = { engine: Rocket, "weapon-a": Zap, "weapon-b": Zap, shield: Shield, cargo: Cpu, special: Sparkles };
const SCRAP_REPAIR_COST = JOB_ECONOMY.hullRepair.salvageScrapCost;
const SCRAP_REPAIR_HULL = JOB_ECONOMY.hullRepair.hullDelta;
const SCRAP_REPAIR_MINUTES = JOB_DURATION.hull_repair;
const SALVAGE_PROCESS_COST = JOB_ECONOMY.salvageProcessing.salvageScrapCost;
const SALVAGE_PROCESS_TRITANIUM = JOB_ECONOMY.salvageProcessing.tritaniumReward;
const SALVAGE_PROCESS_MINUTES = JOB_DURATION.salvage;

function getItemQty(items, itemId) {
  return items.find((item) => item.id === itemId)?.qty ?? 0;
}

function moduleTone(module) {
  if (!module) return "border-slate-700/70 bg-slate-950/60";
  if (module.rarity === "legendary") return "border-amber-300/55 bg-amber-300/10";
  if (module.rarity === "epic") return "border-violet-300/55 bg-violet-300/10";
  if (module.rarity === "rare") return "border-sky-300/45 bg-sky-300/10";
  if (module.rarity === "uncommon") return "border-emerald-300/40 bg-emerald-300/10";
  return "border-slate-700/70 bg-slate-950/60";
}

function Progress({ task, currentMinute, label = "작업 진행" }) {
  const rawProgress = task.progress !== undefined ? task.progress * 100 : ((currentMinute - (task.startedAt ?? currentMinute)) / Math.max(1, task.duration ?? 1)) * 100;
  const progress = Math.max(0, Math.min(100, Math.round(rawProgress)));
  const remaining = Math.max(0, Math.round((task.duration ?? 0) * (1 - progress / 100)));
  const completeAt = task.startedAt !== null && task.startedAt !== undefined ? task.startedAt + task.duration : task.completeAt;
  return (
    <div className="mt-3 rounded-xl border border-cyan-400/30 bg-cyan-400/10 p-3">
      <div className="mb-1 flex items-center justify-between text-xs"><span className="hud-label">{label}</span><span className="hud-value">{progress}%</span></div>
      <div className="hud-gauge"><span className="hud-gauge-fill" style={{ width: `${progress}%` }} /></div>
      <div className="mt-2 text-xs text-slate-400">남은 시간 {formatMinutes(remaining)} · 예상 완료 {completeAt ? formatGameDate(completeAt) : "대기 중"}</div>
    </div>
  );
}

function SlotCard({ slot, module, task }) {
  const Icon = slotIcon[slot] ?? Cpu;
  return (
    <div className={`rounded-2xl border p-3 ${moduleTone(module)} ${task ? "ring-1 ring-amber-300/40" : ""}`}>
      <div className="relative grid h-28 place-items-center overflow-hidden rounded-xl border border-slate-600/40 bg-slate-950/60">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(125,211,252,0.18),transparent_55%)]" />
        <Icon size={36} className="relative text-cyan-100" />
        <span className="absolute left-2 top-2 hud-chip bg-slate-950/70">{slot}</span>
        <span className="absolute right-2 top-2 hud-chip bg-slate-950/70">{task ? "작업" : `Lv.${module?.level ?? 1}`}</span>
      </div>
      <div className="mt-3 truncate font-black text-slate-50">{task ? "현장 작업 중" : module?.name ?? "미장착"}</div>
      <div className="mt-2 flex flex-wrap gap-1.5">{module && Object.entries(module.stats).slice(0, 3).map(([key, value]) => <span key={key} className="mission-reward-icon">{key} {value > 0 ? "+" : ""}{value}</span>)}</div>
      {task && <div className="mt-2 text-xs text-amber-100">완료 {task.completeAt ? formatGameDate(task.completeAt) : "대기 중"}</div>}
    </div>
  );
}

function ModuleCard({ slot, module, activeId, owned, equipped, rule, task, currentSlotTask, materialQty, canUpgrade, onEquip, onUpgrade, currentMinute }) {
  return (
    <article className={`mission-contract-card rounded-2xl border p-3 ${owned ? moduleTone(module) : "border-slate-800 bg-slate-950/40 opacity-70"}`}>
      <div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="truncate font-black text-slate-100">{module.name}</div><div className="mt-1 text-xs text-slate-400">{slot} · Lv.{module.level}</div></div><Badge rarity={module.rarity}>{module.rarity}</Badge></div>
      <div className="mt-3 grid grid-cols-3 gap-1.5">{Object.entries(module.stats).slice(0, 6).map(([key, value]) => <span key={key} className="mission-stat-tile text-[11px]">{key} {value > 0 ? "+" : ""}{value}</span>)}</div>
      <div className="mt-3 flex flex-wrap gap-1.5 text-xs"><span className={`hud-chip ${owned ? "hud-chip-success" : ""}`}>{owned ? "보유" : "미보유"}</span>{equipped && <span className="hud-chip hud-chip-accent">장착 중</span>}{task && <span className="hud-chip hud-chip-warn">작업 중</span>}<span className="hud-chip">₢{rule.installCredits}</span><span className="hud-chip">{formatMinutes(rule.installMinutes)}</span><span className="hud-chip">Ti {materialQty}</span></div>
      {task && <Progress task={task} currentMinute={currentMinute} />}
      <div className="mt-4 grid grid-cols-2 gap-2"><button className="secondary-button justify-center" disabled={equipped || !owned || Boolean(currentSlotTask) || task || activeId === module.id} onClick={onEquip}>{equipped ? "장착 중" : owned ? "장착 지시" : "구매 필요"}</button><button className="secondary-button justify-center" disabled={!canUpgrade} onClick={onUpgrade}>개선 지시</button></div>
    </article>
  );
}

function ScrapRepairCard({ hull, scrap, task, currentMinute, onRepair }) {
  const canRepair = hull < 100 && scrap >= SCRAP_REPAIR_COST && !task;
  return (
    <section className="mt-4 rounded-2xl border border-amber-300/35 bg-amber-300/10 p-4">
      <div className="flex items-start justify-between gap-3"><div><div className="section-title"><Hammer size={18} />캠페인 응급 정비</div><p className="mt-2 text-sm leading-6 text-slate-300">폐자재로 선체 정비 작업을 대기열에 올립니다. 기관실 슬롯이 비어야 시작됩니다.</p></div><span className="hud-chip hud-chip-warn">Scrap {scrap}</span></div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-sm"><div className="mission-stat-tile"><span>Hull</span><span>{Math.round(hull)}%</span></div><div className="mission-stat-tile"><span>비용</span><span>Scrap {SCRAP_REPAIR_COST}</span></div><div className="mission-stat-tile"><span>복구</span><span>+{SCRAP_REPAIR_HULL}% / {formatMinutes(SCRAP_REPAIR_MINUTES)}</span></div></div>
      {task && <Progress task={task} currentMinute={currentMinute} label="선체 정비 진행" />}
      <button className="primary-button mt-4 w-full justify-center" disabled={!canRepair} onClick={onRepair}>{task ? "정비 대기/진행 중" : hull >= 100 ? "선체 양호" : scrap < SCRAP_REPAIR_COST ? "폐자재 부족" : "선체 정비 지시"}</button>
    </section>
  );
}

function SalvageProcessingCard({ scrap, tritanium, task, currentMinute, onProcess }) {
  const canProcess = scrap >= SALVAGE_PROCESS_COST && !task;
  return (
    <section className="mt-4 rounded-2xl border border-cyan-300/30 bg-cyan-300/10 p-4">
      <div className="flex items-start justify-between gap-3"><div><div className="section-title"><Cpu size={18} />잔해 분해 작업</div><p className="mt-2 text-sm leading-6 text-slate-300">폐자재를 창고 작업으로 분해합니다. 창고 슬롯과 기관실 크루가 필요합니다.</p></div><span className="hud-chip hud-chip-accent">Ti {tritanium}</span></div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-sm"><div className="mission-stat-tile"><span>입력</span><span>Scrap {SALVAGE_PROCESS_COST}</span></div><div className="mission-stat-tile"><span>출력</span><span>Ti +{SALVAGE_PROCESS_TRITANIUM}</span></div><div className="mission-stat-tile"><span>시간</span><span>{formatMinutes(SALVAGE_PROCESS_MINUTES)}</span></div></div>
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
  const { modules, installed, unlockedModuleIds, installationQueue, startInstallation, startUpgrade } = useShipStore();
  const rawJobs = useJobStore((state) => state.jobs);
  const jobs = useMemo(() => rawJobs.filter((job) => activeJobStatuses.has(job.status)), [rawJobs]);
  const rooms = useJobStore((state) => state.rooms);
  const startShipWork = useJobStore((state) => state.enqueueShipWork);
  const nudgeJobPriority = useJobStore((state) => state.nudgeJobPriority);
  const cancelJob = useJobStore((state) => state.cancelJob);
  const crew = useCrewStore((state) => state.crew);
  const resources = useGameStore((state) => state.resources);
  const currentMinute = useGameStore((state) => state.currentMinute);
  const spendCredits = useGameStore((state) => state.spendCredits);
  const addResources = useGameStore((state) => state.addResources);
  const addLog = useGameStore((state) => state.addLog);
  const items = useInventoryStore((state) => state.items);
  const addItem = useInventoryStore((state) => state.addItem);
  const removeItem = useInventoryStore((state) => state.removeItem);

  const unlocked = unlockedModuleIds ?? [];
  const tritanium = getItemQty(items, "tritanium");
  const salvageScrap = getItemQty(items, "salvage-scrap");
  const modulesById = useMemo(() => new Map(modules.map((module) => [module.id, module])), [modules]);
  const modulesBySlot = useMemo(() => MODULE_SLOTS.reduce((acc, slot) => ({ ...acc, [slot]: modules.filter((module) => module.slot === slot) }), {}), [modules]);
  const slotTasks = useMemo(() => new Map(installationQueue.filter((task) => task.type === "equip").map((task) => [task.slot, task])), [installationQueue]);
  const moduleTasks = useMemo(() => new Map(installationQueue.map((task) => [task.moduleId, task])), [installationQueue]);
  const hullRepairTask = jobs.find((task) => task.type === "hull_repair") ?? null;
  const salvageProcessingTask = jobs.find((task) => task.type === "salvage") ?? null;
  const slotTask = (slot) => slotTasks.get(slot);
  const moduleTask = (moduleId) => moduleTasks.get(moduleId);

  const repairWithScrap = () => {
    if (resources.hull >= 100) return addLog("선체 정비 불필요: 이미 선체 상태가 양호합니다.");
    if (hullRepairTask) return addLog("선체 정비 실패: 이미 정비 작업이 대기/진행 중입니다.");
    if (salvageScrap < SCRAP_REPAIR_COST) return addLog(`선체 정비 실패: 폐자재 ${SCRAP_REPAIR_COST}개가 필요합니다.`);
    removeItem("salvage-scrap", SCRAP_REPAIR_COST);
    startShipWork({ type: "hullRepair", roomId: "engineering", cost: SCRAP_REPAIR_COST, duration: SCRAP_REPAIR_MINUTES, priority: "high", createdAt: currentMinute, payload: { hullDelta: SCRAP_REPAIR_HULL, inputItems: [{ itemId: "salvage-scrap", qty: SCRAP_REPAIR_COST }] } });
    return addLog(`선체 정비 대기열 등록: 기관실 슬롯 필요 · 폐자재 ${SCRAP_REPAIR_COST}개 · ${formatMinutes(SCRAP_REPAIR_MINUTES)}.`);
  };

  const processSalvage = () => {
    if (salvageProcessingTask) return addLog("잔해 분해 실패: 이미 분해 작업이 대기/진행 중입니다.");
    if (salvageScrap < SALVAGE_PROCESS_COST) return addLog(`잔해 분해 실패: 폐자재 ${SALVAGE_PROCESS_COST}개가 필요합니다.`);
    removeItem("salvage-scrap", SALVAGE_PROCESS_COST);
    startShipWork({ type: "salvageProcessing", roomId: "cargo", cost: SALVAGE_PROCESS_COST, duration: SALVAGE_PROCESS_MINUTES, priority: "normal", createdAt: currentMinute, payload: { inputItems: [{ itemId: "salvage-scrap", qty: SALVAGE_PROCESS_COST }], outputItems: [{ itemId: "tritanium", qty: SALVAGE_PROCESS_TRITANIUM }] } });
    return addLog(`잔해 분해 대기열 등록: 창고 슬롯 필요 · 폐자재 ${SALVAGE_PROCESS_COST}개 · ${formatMinutes(SALVAGE_PROCESS_MINUTES)}.`);
  };

  const equip = (slot, module) => {
    if (!unlocked.includes(module.id)) return addLog(`${module.name} 모듈은 아직 보유하지 않았습니다. 시장에서 구매하거나 제작하세요.`);
    if (slotTask(slot)) return addLog(`${slot} 슬롯은 이미 장착 작업 중입니다.`);
    const rule = getModuleRule(module);
    if (!spendCredits(rule.installCredits)) return addLog(`${module.name} 장착 실패: 크레딧이 부족합니다.`);
    const completeAt = currentMinute + rule.installMinutes;
    startInstallation({ slot, moduleId: module.id, completeAt, cost: rule.installCredits, duration: rule.installMinutes });
    return addLog(`${module.name} 장착 작업 지시: 비용 ₢${rule.installCredits}, 소요 ${formatMinutes(rule.installMinutes)}, 완료 ${formatGameDate(completeAt)}.`);
  };

  const upgrade = (module) => {
    if (!unlocked.includes(module.id)) return addLog(`${module.name} 개선 실패: 보유하지 않은 모듈입니다.`);
    if (moduleTask(module.id)) return addLog(`${module.name} 개선 실패: 이미 작업 중입니다.`);
    const rule = getModuleRule(module);
    const materialQty = upgradeMaterialQty[module.rarity] ?? 2;
    if (getItemQty(items, "tritanium") < materialQty) return addLog(`${module.name} 개선 실패: 트리타늄 ${materialQty}개가 필요합니다.`);
    if (!spendCredits(rule.upgradeCredits)) return addLog(`${module.name} 개선 실패: 크레딧이 부족합니다.`);
    removeItem("tritanium", materialQty);
    startUpgrade({ moduleId: module.id, slot: module.slot, completeAt: currentMinute + rule.upgradeMinutes, cost: rule.upgradeCredits, duration: rule.upgradeMinutes });
    return addLog(`${module.name} 개선 작업 지시: 트리타늄 ${materialQty}개, ₢${rule.upgradeCredits}, 소요 ${formatMinutes(rule.upgradeMinutes)}.`);
  };

  const refundCancelledJob = (job) => {
    const ratio = JOB_ECONOMY.cancelRefundRatio ?? 0.5;
    const refundedItems = [];
    (job.payload?.inputItems ?? []).forEach(({ itemId, qty }) => {
      const refundQty = Math.max(1, Math.floor((qty ?? 0) * ratio));
      if (!itemId || refundQty <= 0) return;
      addItem(itemId, refundQty);
      refundedItems.push(`${itemId} +${refundQty}`);
    });
    if (job.type === "recovery" && job.cost > 0) {
      const credits = Math.floor(job.cost * ratio);
      if (credits > 0) {
        addResources({ credits });
        refundedItems.push(`₢${credits}`);
      }
    }
    return refundedItems;
  };

  const cancelQueuedJob = (job) => {
    const result = cancelJob(job.id);
    if (!result.ok) return addLog("작업 취소 실패: 진행 중 작업은 취소할 수 없습니다.");
    const refunds = refundCancelledJob(result.job ?? job);
    return addLog(refunds.length > 0 ? `작업 취소: 진행 전 작업 취소, 환급 ${refunds.join(", ")}.` : "작업 취소: 진행 전 작업을 취소했습니다.");
  };

  return (
    <div className="grid gap-4 xl:h-full xl:grid-cols-[0.95fr_1.05fr]">
      <section>
        <div className="flex items-start justify-between gap-3"><div><div className="section-title"><Rocket size={18} />함선 슬롯 도면</div><p className="mt-2 text-sm text-slate-400">작업은 이제 방 슬롯을 차지합니다. 동시에 다 못 하므로 backlog 우선순위를 조정해야 합니다.</p></div><div className="flex flex-wrap justify-end gap-1.5"><span className="hud-chip hud-chip-accent">Ti {tritanium}</span><span className="hud-chip hud-chip-warn">Scrap {salvageScrap}</span><span className="hud-chip">작업 {jobs.length + installationQueue.length}</span></div></div>
        <ScrapRepairCard hull={resources.hull} scrap={salvageScrap} task={hullRepairTask} currentMinute={currentMinute} onRepair={repairWithScrap} />
        <SalvageProcessingCard scrap={salvageScrap} tritanium={tritanium} task={salvageProcessingTask} currentMinute={currentMinute} onProcess={processSalvage} />
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-3">{MODULE_SLOTS.map((slot) => { const module = modulesById.get(installed[slot]); const task = slotTask(slot); return <SlotCard key={slot} slot={slot} module={module} task={task} />; })}</div>
      </section>
      <section className="grid gap-4">
        <RoomSlotPanel rooms={rooms} jobs={jobs} />
        <BacklogPanel jobs={jobs} rooms={rooms} crew={crew} onUp={(id) => nudgeJobPriority(id, -1)} onDown={(id) => nudgeJobPriority(id, 1)} onCancel={cancelQueuedJob} />
        <div>
          <div className="section-title"><Wrench size={18} />외부 모듈 교체 & 개선</div>
          <div className="mt-4 grid gap-4">
            {MODULE_SLOTS.map((slot) => {
              const slotModules = modulesBySlot[slot] ?? [];
              const activeId = installed[slot];
              const active = modulesById.get(activeId);
              const currentSlotTask = slotTask(slot);
              return <div key={slot} className="rounded-2xl border border-slate-700/70 bg-slate-950/60 p-3"><div className="flex items-center justify-between gap-2"><div><div className="hud-label">{slot}</div><div className="font-black text-slate-100">현재: {active?.name ?? "미장착"}</div></div>{currentSlotTask ? <span className="hud-chip hud-chip-warn">작업 중</span> : active && <Badge rarity={active.rarity}>{active.rarity}</Badge>}</div>{currentSlotTask && <Progress task={currentSlotTask} currentMinute={currentMinute} />}<div className="mt-3 grid gap-3 md:grid-cols-2">{slotModules.map((module) => { const equipped = module.id === activeId; const owned = unlocked.includes(module.id); const rule = getModuleRule(module); const task = moduleTask(module.id); const materialQty = upgradeMaterialQty[module.rarity] ?? 2; const canUpgrade = owned && !task && resources.credits >= rule.upgradeCredits && getItemQty(items, "tritanium") >= materialQty; return <ModuleCard key={module.id} slot={slot} module={module} activeId={activeId} owned={owned} equipped={equipped} rule={rule} task={task} currentSlotTask={currentSlotTask} materialQty={materialQty} canUpgrade={canUpgrade} currentMinute={currentMinute} onEquip={() => equip(slot, module)} onUpgrade={() => upgrade(module)} />; })}</div></div>;
            })}
          </div>
        </div>
      </section>
      <RoomCustomization />
    </div>
  );
}
