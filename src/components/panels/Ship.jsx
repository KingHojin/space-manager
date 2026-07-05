import { Rocket } from "lucide-react";
import Badge from "../common/Badge";
import RoomCustomization from "../ship/RoomCustomization";
import { MODULE_SLOTS } from "../../data/constants";
import { formatMinutes, getModuleRule } from "../../data/moduleRecipes";
import { formatGameDate } from "../../systems/gameClock";
import { useGameStore } from "../../stores/gameStore";
import { useInventoryStore } from "../../stores/inventoryStore";
import { useShipStore } from "../../stores/shipStore";

const upgradeMaterialQty = { common: 2, uncommon: 3, rare: 5, epic: 8, legendary: 12 };

function getItemQty(items, itemId) {
  return items.find((item) => item.id === itemId)?.qty ?? 0;
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
    <div className="grid gap-4 xl:h-full xl:grid-cols-[0.9fr_1.1fr]">
      <section>
        <div className="section-title"><Rocket size={18} />함선 슬롯 도면</div>
        <div className="mt-4 rounded border border-slate-700/70 bg-slate-950/60 p-4 text-sm leading-6 text-slate-300">외부 모듈 장착과 개선은 기존처럼 시간이 필요합니다. 방별 내부 업그레이드는 아래 커스터마이즈 영역에서 즉시 결재됩니다.</div>
        <div className="ship-blueprint mt-5">{MODULE_SLOTS.map((slot) => { const module = modules.find((entry) => entry.id === installed[slot]); const task = slotTask(slot); return <div key={slot} className={`ship-slot ship-slot-${slot.replace("-", "")}`}><span className="hud-label">{slot}</span><strong>{task ? "장착 작업 중" : module?.name}</strong><small className="text-slate-400">{task ? formatGameDate(task.completeAt) : `Lv.${module?.level ?? 1}`}</small></div>; })}</div>
      </section>
      <section>
        <div className="section-title">외부 모듈 교체 & 개선</div>
        <div className="mt-4 space-y-4">{MODULE_SLOTS.map((slot) => { const slotModules = modules.filter((entry) => entry.slot === slot); const activeId = installed[slot]; const active = modules.find((entry) => entry.id === activeId); const currentSlotTask = slotTask(slot); return <div key={slot} className="rounded border border-slate-700/70 bg-slate-950/60 p-3"><div className="flex items-center justify-between gap-2"><div><div className="hud-label">{slot}</div><div className="font-semibold text-slate-100">현재: {active?.name ?? "미장착"}</div></div>{currentSlotTask ? <span className="hud-chip hud-chip-warn">작업 중</span> : active && <Badge rarity={active.rarity}>{active.rarity}</Badge>}</div>{currentSlotTask && <Progress task={currentSlotTask} currentMinute={currentMinute} />}<div className="mt-3 grid gap-2">{slotModules.map((module) => { const equipped = module.id === activeId; const owned = unlocked.includes(module.id); const rule = getModuleRule(module); const task = moduleTask(module.id); const materialQty = upgradeMaterialQty[module.rarity] ?? 2; const canUpgrade = owned && !task && resources.credits >= rule.upgradeCredits && getItemQty(items, "tritanium") >= materialQty; return <div key={module.id} className={`rounded border p-3 ${owned ? "border-slate-700/70 bg-slate-900/70" : "border-slate-800 bg-slate-950/40 opacity-70"}`}><div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><div className="font-semibold text-slate-100">{module.name} <span className="text-xs text-slate-500">Lv.{module.level}</span></div><div className="mt-1 flex flex-wrap gap-1.5">{Object.entries(module.stats).map(([key, value]) => <span key={key} className="hud-chip">{key} {value > 0 ? "+" : ""}{value}</span>)}</div><div className="mt-2 flex flex-wrap gap-1.5 text-xs"><span className="hud-chip">장착 ₢{rule.installCredits}</span><span className="hud-chip">{formatMinutes(rule.installMinutes)}</span><span className="hud-chip">개선 ₢{rule.upgradeCredits}</span><span className="hud-chip">트리타늄 {materialQty}</span></div></div><div className="flex flex-col items-end gap-1"><Badge rarity={module.rarity}>{module.rarity}</Badge><span className={`hud-chip ${owned ? "hud-chip-success" : ""}`}>{owned ? "보유" : "미보유"}</span>{task && <span className="hud-chip hud-chip-warn">작업 중</span>}</div></div>{task && <Progress task={task} currentMinute={currentMinute} />}<div className="mt-3 grid grid-cols-2 gap-2"><button className="secondary-button" disabled={equipped || !owned || Boolean(currentSlotTask) || resources.credits < rule.installCredits} onClick={() => equip(slot, module)}>{equipped ? "장착 중" : owned ? "장착 예약" : "구매 필요"}</button><button className="secondary-button" disabled={!canUpgrade} onClick={() => upgrade(module)}>개선 예약</button></div></div>; })}</div></div>; })}</div>
      </section>
      <RoomCustomization />
    </div>
  );
}

function Progress({ task, currentMinute }) {
  const progress = Math.max(0, Math.min(100, Math.round(((currentMinute - task.startedAt) / Math.max(1, task.duration)) * 100)));
  return <div className="mt-3 rounded border border-cyan-400/30 bg-cyan-400/10 p-3"><div className="mb-1 flex items-center justify-between text-xs"><span className="hud-label">작업 진행</span><span className="hud-value">{progress}%</span></div><div className="hud-gauge"><span className="hud-gauge-fill" style={{ width: `${progress}%` }} /></div><div className="mt-2 text-xs text-slate-400">완료: {formatGameDate(task.completeAt)}</div></div>;
}
