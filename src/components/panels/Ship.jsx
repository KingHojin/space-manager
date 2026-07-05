import { Cpu, Rocket, Shield, Sparkles, Wrench, Zap } from "lucide-react";
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

function Progress({ task, currentMinute }) {
  const progress = Math.max(0, Math.min(100, Math.round(((currentMinute - task.startedAt) / Math.max(1, task.duration)) * 100)));
  return <div className="mt-3 rounded-xl border border-cyan-400/30 bg-cyan-400/10 p-3"><div className="mb-1 flex items-center justify-between text-xs"><span className="hud-label">작업 진행</span><span className="hud-value">{progress}%</span></div><div className="hud-gauge"><span className="hud-gauge-fill" style={{ width: `${progress}%` }} /></div><div className="mt-2 text-xs text-slate-400">완료: {formatGameDate(task.completeAt)}</div></div>;
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
      <div className="mt-3 truncate font-black text-slate-50">{task ? "장착 작업 중" : module?.name ?? "미장착"}</div>
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
      <div className="mt-4 grid grid-cols-2 gap-2"><button className="secondary-button justify-center" disabled={equipped || !owned || Boolean(currentSlotTask) || task || activeId === module.id} onClick={onEquip}>{equipped ? "장착 중" : owned ? "장착 예약" : "구매 필요"}</button><button className="secondary-button justify-center" disabled={!canUpgrade} onClick={onUpgrade}>개선 예약</button></div>
    </article>
  );
}

export default function Ship() {
  const { modules, installed, unlockedModuleIds, installationQueue, startInstallation, startUpgrade } = useShipStore();
  const resources = useGameStore((state) => state.resources);
  const currentMinute = useGameStore((state) => state.currentMinute);
  const spendCredits = useGameStore((state) => state.spendCredits);
  const addLog = useGameStore((state) => state.addLog);
  const items = useInventoryStore((state) => state.items);
  const removeItem = useInventoryStore((state) => state.removeItem);
  const unlocked = unlockedModuleIds ?? [];
  const tritanium = getItemQty(items, "tritanium");

  const slotTask = (slot) => installationQueue.find((task) => task.type === "equip" && task.slot === slot);
  const moduleTask = (moduleId) => installationQueue.find((task) => task.moduleId === moduleId);

  const equip = (slot, module) => {
    if (!unlocked.includes(module.id)) return addLog(`${module.name} 모듈은 아직 보유하지 않았습니다. 시장에서 구매하거나 제작하세요.`);
    if (slotTask(slot)) return addLog(`${slot} 슬롯은 이미 장착 작업 중입니다.`);
    const rule = getModuleRule(module);
    if (!spendCredits(rule.installCredits)) return addLog(`${module.name} 장착 실패: 크레딧이 부족합니다.`);
    const completeAt = currentMinute + rule.installMinutes;
    startInstallation({ slot, moduleId: module.id, completeAt, cost: rule.installCredits, duration: rule.installMinutes });
    addLog(`${module.name} 장착 작업 시작: 비용 ₢${rule.installCredits}, 소요 ${formatMinutes(rule.installMinutes)}, 완료 ${formatGameDate(completeAt)}.`);
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
    startUpgrade({ moduleId: module.id, completeAt, cost: rule.upgradeCredits, duration: rule.upgradeMinutes });
    addLog(`${module.name} 개선 작업 시작: 트리타늄 ${materialQty}개, ₢${rule.upgradeCredits}, 소요 ${formatMinutes(rule.upgradeMinutes)}.`);
  };

  return (
    <div className="grid gap-4 xl:h-full xl:grid-cols-[0.95fr_1.05fr]">
      <section>
        <div className="flex items-start justify-between gap-3"><div><div className="section-title"><Rocket size={18} />함선 슬롯 도면</div><p className="mt-2 text-sm text-slate-400">슬롯별 장착 모듈과 진행 작업을 카드로 확인합니다.</p></div><div className="flex flex-wrap justify-end gap-1.5"><span className="hud-chip hud-chip-accent">Ti {tritanium}</span><span className="hud-chip">작업 {installationQueue.length}</span></div></div>
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-3">{MODULE_SLOTS.map((slot) => { const module = modules.find((entry) => entry.id === installed[slot]); const task = slotTask(slot); return <SlotCard key={slot} slot={slot} module={module} task={task} />; })}</div>
      </section>
      <section>
        <div className="section-title"><Wrench size={18} />외부 모듈 교체 & 개선</div>
        <div className="mt-4 grid gap-4">{MODULE_SLOTS.map((slot) => { const slotModules = modules.filter((entry) => entry.slot === slot); const activeId = installed[slot]; const active = modules.find((entry) => entry.id === activeId); const currentSlotTask = slotTask(slot); return <div key={slot} className="rounded-2xl border border-slate-700/70 bg-slate-950/60 p-3"><div className="flex items-center justify-between gap-2"><div><div className="hud-label">{slot}</div><div className="font-black text-slate-100">현재: {active?.name ?? "미장착"}</div></div>{currentSlotTask ? <span className="hud-chip hud-chip-warn">작업 중</span> : active && <Badge rarity={active.rarity}>{active.rarity}</Badge>}</div>{currentSlotTask && <Progress task={currentSlotTask} currentMinute={currentMinute} />}<div className="mt-3 grid gap-3 md:grid-cols-2">{slotModules.map((module) => { const equipped = module.id === activeId; const owned = unlocked.includes(module.id); const rule = getModuleRule(module); const task = moduleTask(module.id); const materialQty = upgradeMaterialQty[module.rarity] ?? 2; const canUpgrade = owned && !task && resources.credits >= rule.upgradeCredits && getItemQty(items, "tritanium") >= materialQty; return <ModuleCard key={module.id} slot={slot} module={module} activeId={activeId} owned={owned} equipped={equipped} rule={rule} task={task} currentSlotTask={currentSlotTask} materialQty={materialQty} canUpgrade={canUpgrade} currentMinute={currentMinute} onEquip={() => equip(slot, module)} onUpgrade={() => upgrade(module)} />; })}</div></div>; })}</div>
      </section>
      <RoomCustomization />
    </div>
  );
}
