import { useMemo } from "react";
import { Cpu, Hammer, Rocket, Shield, Sparkles, Wrench, Zap } from "lucide-react";
import Badge from "../common/Badge";
import RoomCustomization from "../ship/RoomCustomization";
import { MODULE_SLOTS } from "../../data/constants";
import { formatMinutes, getModuleRule } from "../../data/moduleRecipes";
import { formatGameDate } from "../../systems/gameClock";
import { useGameStore } from "../../stores/gameStore";
import { useInventoryStore } from "../../stores/inventoryStore";
import { useShipStore } from "../../stores/shipStore";

const upgradeMaterialQty = { common: 2, uncommon: 3, rare: 5, epic: 8, legendary: 12 };
const slotIcon = { engine: Rocket, "weapon-a": Zap, "weapon-b": Zap, shield: Shield, cargo: Cpu, special: Sparkles };
const SCRAP_REPAIR_COST = 6;
const SCRAP_REPAIR_HULL = 8;
const SCRAP_REPAIR_MINUTES = 120;

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
  const progress = Math.max(0, Math.min(100, Math.round(((currentMinute - task.startedAt) / Math.max(1, task.duration)) * 100)));
  return <div className="mt-3 rounded-xl border border-cyan-400/30 bg-cyan-400/10 p-3"><div className="mb-1 flex items-center justify-between text-xs"><span className="hud-label">{label}</span><span className="hud-value">{progress}%</span></div><div className="hud-gauge"><span className="hud-gauge-fill" style={{ width: `${progress}%` }} /></div><div className="mt-2 text-xs text-slate-400">완료: {formatGameDate(task.completeAt)}</div></div>;
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
      {task && <div className="mt-2 text-xs text-amber-100">완료 {formatGameDate(task.completeAt)}</div>}
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
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="section-title"><Hammer size={18} />캠페인 응급 정비</div>
          <p className="mt-2 text-sm leading-6 text-slate-300">임무에서 얻은 폐자재로 선체 정비 작업을 지시합니다. 기관실 승무원이 이동해 정비 시간을 소모합니다.</p>
        </div>
        <span className="hud-chip hud-chip-warn">Scrap {scrap}</span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
        <div className="mission-stat-tile"><span>Hull</span><span>{Math.round(hull)}%</span></div>
        <div className="mission-stat-tile"><span>비용</span><span>Scrap {SCRAP_REPAIR_COST}</span></div>
        <div className="mission-stat-tile"><span>복구</span><span>+{SCRAP_REPAIR_HULL}% / {formatMinutes(SCRAP_REPAIR_MINUTES)}</span></div>
      </div>
      {task && <Progress task={task} currentMinute={currentMinute} label="선체 정비 진행" />}
      <button className="primary-button mt-4 w-full justify-center" disabled={!canRepair} onClick={onRepair}>{task ? "선체 정비 중" : hull >= 100 ? "선체 양호" : scrap < SCRAP_REPAIR_COST ? "폐자재 부족" : "선체 정비 지시"}</button>
    </section>
  );
}

export default function Ship() {
  const { modules, installed, unlockedModuleIds, installationQueue, shipWorkQueue, startInstallation, startUpgrade, startShipWork } = useShipStore();
  const resources = useGameStore((state) => state.resources);
  const currentMinute = useGameStore((state) => state.currentMinute);
  const spendCredits = useGameStore((state) => state.spendCredits);
  const addLog = useGameStore((state) => state.addLog);
  const items = useInventoryStore((state) => state.items);
  const removeItem = useInventoryStore((state) => state.removeItem);
  const unlocked = unlockedModuleIds ?? [];
  const tritanium = getItemQty(items, "tritanium");
  const salvageScrap = getItemQty(items, "salvage-scrap");
  const modulesById = useMemo(() => new Map(modules.map((module) => [module.id, module])), [modules]);
  const modulesBySlot = useMemo(() => MODULE_SLOTS.reduce((acc, slot) => ({ ...acc, [slot]: modules.filter((module) => module.slot === slot) }), {}), [modules]);
  const slotTasks = useMemo(() => new Map(installationQueue.filter((task) => task.type === "equip").map((task) => [task.slot, task])), [installationQueue]);
  const moduleTasks = useMemo(() => new Map(installationQueue.map((task) => [task.moduleId, task])), [installationQueue]);
  const hullRepairTask = useMemo(() => shipWorkQueue.find((task) => task.type === "hullRepair") ?? null, [shipWorkQueue]);

  const slotTask = (slot) => slotTasks.get(slot);
  const moduleTask = (moduleId) => moduleTasks.get(moduleId);

  const repairWithScrap = () => {
    if (resources.hull >= 100) return addLog("선체 정비 불필요: 이미 선체 상태가 양호합니다.");
    if (hullRepairTask) return addLog("선체 정비 실패: 이미 기관실 정비 작업이 진행 중입니다.");
    if (salvageScrap < SCRAP_REPAIR_COST) return addLog(`선체 정비 실패: 폐자재 ${SCRAP_REPAIR_COST}개가 필요합니다.`);
    removeItem("salvage-scrap", SCRAP_REPAIR_COST);
    const completeAt = currentMinute + SCRAP_REPAIR_MINUTES;
    startShipWork({ type: "hullRepair", roomId: "engineering", completeAt, cost: SCRAP_REPAIR_COST, duration: SCRAP_REPAIR_MINUTES, priority: "high", payload: { hullDelta: SCRAP_REPAIR_HULL } });
    addLog(`선체 정비 지시: 기관실 승무원이 현장으로 이동합니다. 폐자재 ${SCRAP_REPAIR_COST}개, 소요 ${formatMinutes(SCRAP_REPAIR_MINUTES)}, 완료 ${formatGameDate(completeAt)}.`);
    return null;
  };

  const equip = (slot, module) => {
    if (!unlocked.includes(module.id)) return addLog(`${module.name} 모듈은 아직 보유하지 않았습니다. 시장에서 구매하거나 제작하세요.`);
    if (slotTask(slot)) return addLog(`${slot} 슬롯은 이미 장착 작업 중입니다.`);
    const rule = getModuleRule(module);
    if (!spendCredits(rule.installCredits)) return addLog(`${module.name} 장착 실패: 크레딧이 부족합니다.`);
    const completeAt = currentMinute + rule.installMinutes;
    startInstallation({ slot, moduleId: module.id, completeAt, cost: rule.installCredits, duration: rule.installMinutes });
    addLog(`${module.name} 장착 작업 지시: 기관실 승무원이 현장으로 이동합니다. 비용 ₢${rule.installCredits}, 소요 ${formatMinutes(rule.installMinutes)}, 완료 ${formatGameDate(completeAt)}.`);
  };

  const upgrade = (module) => {
    if (!unlocked.includes(module.id)) return addLog(`${module.name} 개선 실패: 보유하지 않은 모듈입니다.`);
    if (moduleTask(module.id)) return addLog(`${module.name} 개선 실패: 이미 작업 중입니다.`);
    const rule = getModuleRule(module);
    const materialQty = upgradeMaterialQty[module.rarity] ?? 2;
    if (getItemQty(items, "tritanium") < materialQty) return addLog(`${module.name} 개선 실패: 트리타늄 ${materialQty}개가 필요합니다.`);
    if (!spendCredits(rule.upgradeCredits)) return addLog(`${module.name} 개선 실패: 크레딧이 부족합니다.`);
    removeItem("tritanium", materialQty);
    const completeAt = currentMinute + rule.upgradeMinutes;
    startUpgrade({ moduleId: module.id, slot: module.slot, completeAt, cost: rule.upgradeCredits, duration: rule.upgradeMinutes });
    addLog(`${module.name} 개선 작업 지시: 기관실 승무원이 ${module.slot} 현장으로 이동합니다. 트리타늄 ${materialQty}개, ₢${rule.upgradeCredits}, 소요 ${formatMinutes(rule.upgradeMinutes)}.`);
  };

  return (
    <div className="grid gap-4 xl:h-full xl:grid-cols-[0.95fr_1.05fr]">
      <section>
        <div className="flex items-start justify-between gap-3"><div><div className="section-title"><Rocket size={18} />함선 슬롯 도면</div><p className="mt-2 text-sm text-slate-400">슬롯별 장착 모듈과 진행 작업을 카드로 확인합니다.</p></div><div className="flex flex-wrap justify-end gap-1.5"><span className="hud-chip hud-chip-accent">Ti {tritanium}</span><span className="hud-chip hud-chip-warn">Scrap {salvageScrap}</span><span className="hud-chip">작업 {installationQueue.length + shipWorkQueue.length}</span></div></div>
        <ScrapRepairCard hull={resources.hull} scrap={salvageScrap} task={hullRepairTask} currentMinute={currentMinute} onRepair={repairWithScrap} />
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-3">{MODULE_SLOTS.map((slot) => { const module = modulesById.get(installed[slot]); const task = slotTask(slot); return <SlotCard key={slot} slot={slot} module={module} task={task} />; })}</div>
      </section>
      <section>
        <div className="section-title"><Wrench size={18} />외부 모듈 교체 & 개선</div>
        <div className="mt-4 grid gap-4">{MODULE_SLOTS.map((slot) => { const slotModules = modulesBySlot[slot] ?? []; const activeId = installed[slot]; const active = modulesById.get(activeId); const currentSlotTask = slotTask(slot); return <div key={slot} className="rounded-2xl border border-slate-700/70 bg-slate-950/60 p-3"><div className="flex items-center justify-between gap-2"><div><div className="hud-label">{slot}</div><div className="font-black text-slate-100">현재: {active?.name ?? "미장착"}</div></div>{currentSlotTask ? <span className="hud-chip hud-chip-warn">작업 중</span> : active && <Badge rarity={active.rarity}>{active.rarity}</Badge>}</div>{currentSlotTask && <Progress task={currentSlotTask} currentMinute={currentMinute} />}<div className="mt-3 grid gap-3 md:grid-cols-2">{slotModules.map((module) => { const equipped = module.id === activeId; const owned = unlocked.includes(module.id); const rule = getModuleRule(module); const task = moduleTask(module.id); const materialQty = upgradeMaterialQty[module.rarity] ?? 2; const canUpgrade = owned && !task && resources.credits >= rule.upgradeCredits && getItemQty(items, "tritanium") >= materialQty; return <ModuleCard key={module.id} slot={slot} module={module} activeId={activeId} owned={owned} equipped={equipped} rule={rule} task={task} currentSlotTask={currentSlotTask} materialQty={materialQty} canUpgrade={canUpgrade} currentMinute={currentMinute} onEquip={() => equip(slot, module)} onUpgrade={() => upgrade(module)} />; })}</div></div>; })}</div>
      </section>
      <RoomCustomization />
    </div>
  );
}
