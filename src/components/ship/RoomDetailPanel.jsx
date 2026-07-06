import { useMemo, useState } from "react";
import { ShieldCheck, Users, Wrench } from "lucide-react";
import Badge from "../common/Badge";
import { getRoomDef } from "../../data/shipRooms";
import { roomForCrewActivity } from "../../data/shipInteriorLayout";
import { ROOM_SLOTS } from "../../data/constants";
import { formatMinutes, getModuleRule } from "../../data/moduleRecipes";
import { formatGameDate } from "../../systems/gameClock";
import { computeJobRefund } from "../../systems/jobEconomy";
import { jobTypeLabel } from "../../systems/jobMigration";
import { canFitPower, modulePowerCost, reactorCapacity, totalPowerDraw } from "../../systems/powerSystem";
import { useCrewStore } from "../../stores/crewStore";
import { useGameStore } from "../../stores/gameStore";
import { useInventoryStore } from "../../stores/inventoryStore";
import { useJobStore } from "../../stores/jobStore";
import { useShipInteriorStore } from "../../stores/shipInteriorStore";
import { useShipStore } from "../../stores/shipStore";
import { RoomCustomizationCard } from "./RoomCustomization";

const upgradeMaterialQty = { common: 2, uncommon: 3, rare: 5, epic: 8, legendary: 12 };
const TABS = [
  { id: "equip", label: "장비", icon: Wrench },
  { id: "room", label: "방 개조", icon: ShieldCheck },
  { id: "crew", label: "근무", icon: Users },
];

function getItemQty(items, itemId) {
  return items.find((item) => item.id === itemId)?.qty ?? 0;
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

function EquipTab({ roomId }) {
  const slots = ROOM_SLOTS[roomId] ?? [];
  const shipGrade = useGameStore((state) => state.shipGrade);
  const resources = useGameStore((state) => state.resources);
  const currentMinute = useGameStore((state) => state.currentMinute);
  const spendCredits = useGameStore((state) => state.spendCredits);
  const addLog = useGameStore((state) => state.addLog);
  const modules = useShipStore((state) => state.modules);
  const installed = useShipStore((state) => state.installed);
  const unlockedModuleIds = useShipStore((state) => state.unlockedModuleIds) ?? [];
  const engineeringTier = useShipInteriorStore((state) => state.rooms.engineering?.tier ?? 1);
  const rawJobs = useJobStore((state) => state.jobs);
  const enqueueModuleWork = useJobStore((state) => state.enqueueModuleWork);
  const items = useInventoryStore((state) => state.items);
  const removeItem = useInventoryStore((state) => state.removeItem);

  const modulesById = useMemo(() => new Map(modules.map((module) => [module.id, module])), [modules]);
  const moduleWorkQueue = useMemo(() => rawJobs.filter((job) => job.type === "module_upgrade" && ["backlog", "assigned", "in_progress"].includes(job.status)), [rawJobs]);
  const slotTasks = useMemo(() => new Map(moduleWorkQueue.filter((job) => job.payload?.action === "equip").map((job) => [job.payload?.slot, job])), [moduleWorkQueue]);
  const moduleTasks = useMemo(() => new Map(moduleWorkQueue.map((job) => [job.payload?.moduleId, job])), [moduleWorkQueue]);

  if (slots.length === 0) return <p className="text-sm text-slate-400">이 구역에는 함선 장비 슬롯이 없습니다.</p>;

  // 대기/진행 중인 장착 job의 모듈을 해당 슬롯에 이미 있는 것처럼 계산해,
  // 여러 슬롯에 연달아 장착을 지시해도 합산 전력이 예산을 넘지 못하게 막는다.
  const effectiveInstalled = { ...installed };
  moduleWorkQueue.forEach((job) => {
    if (job.payload?.action === "equip" && job.payload?.slot && job.payload?.moduleId) effectiveInstalled[job.payload.slot] = job.payload.moduleId;
  });
  const installedModules = Object.values(effectiveInstalled).map((id) => modulesById.get(id)).filter(Boolean);
  const capacity = reactorCapacity(shipGrade, engineeringTier);
  const draw = totalPowerDraw(installedModules);

  const equip = (slot, module) => {
    if (!unlockedModuleIds.includes(module.id)) return addLog(`${module.name} 모듈은 아직 보유하지 않았습니다. 시장에서 구매하거나 제작하세요.`);
    if (slotTasks.get(slot)) return addLog(`${slot} 슬롯은 이미 장착 작업 중입니다.`);
    const currentModule = modulesById.get(effectiveInstalled[slot]);
    if (!canFitPower(installedModules, module, currentModule, capacity)) {
      const freed = currentModule ? modulePowerCost(currentModule) : 0;
      return addLog(`${module.name} 장착 실패: 동력 예산 초과 (필요 ${modulePowerCost(module)}, 여유 ${Math.max(0, capacity - draw + freed)}).`);
    }
    const rule = getModuleRule(module);
    if (!spendCredits(rule.installCredits)) return addLog(`${module.name} 장착 실패: 크레딧이 부족합니다.`);
    enqueueModuleWork({ action: "equip", slot, moduleId: module.id, cost: rule.installCredits, duration: rule.installMinutes, priority: "high", createdAt: currentMinute, payload: { creditCost: rule.installCredits } });
    return addLog(`${module.name} 장착 작업 대기열 등록: ${slot} 슬롯 · ₢${rule.installCredits} · ${formatMinutes(rule.installMinutes)}.`);
  };

  const upgrade = (module) => {
    if (!unlockedModuleIds.includes(module.id)) return addLog(`${module.name} 개선 실패: 보유하지 않은 모듈입니다.`);
    if (moduleTasks.get(module.id)) return addLog(`${module.name} 개선 실패: 이미 작업 중입니다.`);
    const rule = getModuleRule(module);
    const materialQty = upgradeMaterialQty[module.rarity] ?? 2;
    if (getItemQty(items, "tritanium") < materialQty) return addLog(`${module.name} 개선 실패: 트리타늄 ${materialQty}개가 필요합니다.`);
    if (!spendCredits(rule.upgradeCredits)) return addLog(`${module.name} 개선 실패: 크레딧이 부족합니다.`);
    removeItem("tritanium", materialQty);
    enqueueModuleWork({ action: "upgrade", slot: module.slot, moduleId: module.id, cost: rule.upgradeCredits, duration: rule.upgradeMinutes, priority: "normal", createdAt: currentMinute, payload: { creditCost: rule.upgradeCredits, inputItems: [{ itemId: "tritanium", qty: materialQty }] } });
    return addLog(`${module.name} 개선 작업 대기열 등록: 트리타늄 ${materialQty}개, ₢${rule.upgradeCredits}, ${formatMinutes(rule.upgradeMinutes)}.`);
  };

  return (
    <div className="grid gap-4">
      <div className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-3">
        <div className="flex items-center justify-between text-xs"><span className="hud-label">동력 예산</span><span className={`hud-value ${draw > capacity ? "text-red-300" : ""}`}>{draw} / {capacity}</span></div>
        <div className="hud-gauge mt-2"><span className={`hud-gauge-fill ${draw > capacity ? "bg-red-400" : ""}`} style={{ width: `${Math.min(100, Math.round((draw / Math.max(1, capacity)) * 100))}%` }} /></div>
      </div>
      {slots.map((slot) => {
        const slotModules = modules.filter((module) => module.slot === slot);
        const activeId = installed[slot];
        const active = modulesById.get(activeId);
        const currentSlotTask = slotTasks.get(slot);
        return (
          <div key={slot} className="rounded-2xl border border-slate-700/70 bg-slate-950/60 p-3">
            <div className="flex items-center justify-between gap-2">
              <div><div className="hud-label">{slot}</div><div className="font-black text-slate-100">현재: {active?.name ?? "미장착"}</div></div>
              {currentSlotTask ? <span className="hud-chip hud-chip-warn">작업 중</span> : active && <Badge rarity={active.rarity}>{active.rarity}</Badge>}
            </div>
            {currentSlotTask && <Progress task={currentSlotTask} currentMinute={currentMinute} />}
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {slotModules.map((module) => {
                const equipped = module.id === activeId;
                const owned = unlockedModuleIds.includes(module.id);
                const rule = getModuleRule(module);
                const task = moduleTasks.get(module.id);
                const materialQty = upgradeMaterialQty[module.rarity] ?? 2;
                const canUpgrade = owned && !task && resources.credits >= rule.upgradeCredits && getItemQty(items, "tritanium") >= materialQty;
                const powerOk = equipped || canFitPower(installedModules, module, modulesById.get(effectiveInstalled[slot]), capacity);
                return (
                  <article key={module.id} className={`rounded-2xl border p-3 ${owned ? "border-slate-700/70 bg-slate-950/60" : "border-slate-800 bg-slate-950/40 opacity-70"}`}>
                    <div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="truncate font-black text-slate-100">{module.name}</div><div className="mt-1 text-xs text-slate-400">Lv.{module.level} · 동력 {modulePowerCost(module)}</div></div><Badge rarity={module.rarity}>{module.rarity}</Badge></div>
                    <div className="mt-3 grid grid-cols-3 gap-1.5">{Object.entries(module.stats).slice(0, 6).map(([key, value]) => <span key={key} className="mission-stat-tile text-[11px]">{key} {value > 0 ? "+" : ""}{value}</span>)}</div>
                    <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
                      <span className={`hud-chip ${owned ? "hud-chip-success" : ""}`}>{owned ? "보유" : "미보유"}</span>
                      {equipped && <span className="hud-chip hud-chip-accent">장착 중</span>}
                      {!powerOk && <span className="hud-chip hud-chip-danger">동력 부족</span>}
                      <span className="hud-chip">₢{rule.installCredits}</span>
                      <span className="hud-chip">{formatMinutes(rule.installMinutes)}</span>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <button className="secondary-button justify-center" disabled={equipped || !owned || Boolean(currentSlotTask) || Boolean(task) || !powerOk} onClick={() => equip(slot, module)}>{equipped ? "장착 중" : !owned ? "구매 필요" : powerOk ? "장착 지시" : "동력 부족"}</button>
                      <button className="secondary-button justify-center" disabled={!canUpgrade} onClick={() => upgrade(module)}>개선 지시</button>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CrewTab({ roomId }) {
  const crew = useCrewStore((state) => state.crew);
  const crewActivities = useCrewStore((state) => state.crewActivities ?? []);
  const jobs = useJobStore((state) => state.jobs);
  const rooms = useJobStore((state) => state.rooms);
  const nudgeJobPriority = useJobStore((state) => state.nudgeJobPriority);
  const cancelJob = useJobStore((state) => state.cancelJob);
  const addLog = useGameStore((state) => state.addLog);
  const addResources = useGameStore((state) => state.addResources);
  const addItem = useInventoryStore((state) => state.addItem);

  const activityByMember = useMemo(() => new Map(crewActivities.map((activity) => [activity.memberId, activity])), [crewActivities]);
  const assignedCrew = crew.filter((member) => member.alive && roomForCrewActivity(member, activityByMember.get(member.id)) === roomId);
  const roomJobs = jobs.filter((job) => job.roomId === roomId && ["backlog", "assigned", "in_progress"].includes(job.status));
  const roomState = rooms[roomId];

  const cancel = (job) => {
    const result = cancelJob(job.id);
    if (!result.ok) return addLog("작업 취소 실패: 진행 중 작업은 취소할 수 없습니다.");
    const { items: refundItems, credits } = computeJobRefund(result.job ?? job);
    const refunded = refundItems.map(({ itemId, qty }) => {
      addItem(itemId, qty);
      return `${itemId} +${qty}`;
    });
    if (credits > 0) {
      addResources({ credits });
      refunded.push(`₢${credits}`);
    }
    return addLog(refunded.length > 0 ? `작업 취소: 진행 전 작업 취소, 환급 ${refunded.join(", ")}.` : "작업 취소: 진행 전 작업을 취소했습니다.");
  };

  return (
    <div className="grid gap-3">
      <div className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-3">
        <div className="hud-label">슬롯 부하</div>
        <div className="mt-2 hud-gauge"><span className="hud-gauge-fill" style={{ width: `${Math.min(100, Math.round(((roomState?.currentLoad ?? 0) / Math.max(1, roomState?.loadThreshold ?? 1)) * 100))}%` }} /></div>
        <div className="mt-2 text-xs text-slate-400">부하 {roomState?.currentLoad ?? 0}/{roomState?.loadThreshold ?? 0}</div>
      </div>
      <div className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-3">
        <div className="hud-label">현재 근무 승무원</div>
        <div className="mt-2 flex flex-wrap gap-1.5">{assignedCrew.length === 0 ? <span className="text-xs text-slate-500">없음</span> : assignedCrew.map((member) => <span key={member.id} className="hud-chip hud-chip-accent">{member.name}</span>)}</div>
      </div>
      <div className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-3">
        <div className="hud-label">이 방의 작업</div>
        <div className="mt-2 grid gap-2">
          {roomJobs.length === 0 && <span className="text-xs text-slate-500">진행/대기 중 작업 없음</span>}
          {roomJobs.map((job) => (
            <div key={job.id} className="rounded-lg border border-cyan-300/25 bg-cyan-300/10 px-2 py-1.5 text-xs text-cyan-100">
              <div className="flex items-center justify-between gap-2"><span>{jobTypeLabel(job.type)} · {job.status}</span><span>{Math.round((job.progress ?? 0) * 100)}%</span></div>
              {job.status === "backlog" && (
                <div className="mt-1 flex gap-1">
                  <button className="secondary-button min-h-6 px-2 text-[10px]" onClick={() => nudgeJobPriority(job.id, -1)}>▲</button>
                  <button className="secondary-button min-h-6 px-2 text-[10px]" onClick={() => nudgeJobPriority(job.id, 1)}>▼</button>
                  <button className="secondary-button min-h-6 px-2 text-[10px]" onClick={() => cancel(job)}>취소</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function RoomDetailPanel({ roomId, onClose }) {
  const [tab, setTab] = useState("equip");
  const roomDef = roomId ? getRoomDef(roomId) : null;
  if (!roomDef) return null;

  return (
    <div className="fixed inset-0 z-40 grid place-items-end bg-black/55 p-4" onClick={onClose}>
      <div className="modal-panel" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-700 px-5 py-4">
          <h2 className="text-lg font-bold text-slate-50">{roomDef.label}</h2>
          <button className="icon-button" onClick={onClose}>닫기</button>
        </div>
        <div className="flex gap-1 border-b border-slate-700/70 px-5 pt-3">
          {TABS.map((entry) => {
            const Icon = entry.icon;
            return (
              <button key={entry.id} className={`dock-button ${tab === entry.id ? "border-cyan-300/60 bg-cyan-300/10 text-cyan-100" : ""}`} onClick={() => setTab(entry.id)}>
                <Icon size={16} />{entry.label}
              </button>
            );
          })}
        </div>
        <div className="max-h-[70vh] overflow-auto p-5">
          {tab === "equip" && <EquipTab roomId={roomId} />}
          {tab === "room" && <RoomCustomizationCard roomDef={roomDef} />}
          {tab === "crew" && <CrewTab roomId={roomId} />}
        </div>
      </div>
    </div>
  );
}
