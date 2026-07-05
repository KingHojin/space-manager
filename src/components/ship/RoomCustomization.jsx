import { ROOM_MODULE_CATALOG, ROOM_TIER_CONFIG, calculateRoomModifiers, canInstallRoomModule, formatRoomEffect } from "../../data/roomModules";
import { ROOMS } from "../../data/shipRooms";
import { useGameStore } from "../../stores/gameStore";
import { useShipInteriorStore } from "../../stores/shipInteriorStore";

function ModifierChips({ modifiers }) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
      <span className="hud-chip">속도 x{modifiers.jobSpeedMul.toFixed(2)}</span>
      <span className="hud-chip">감소 x{modifiers.conditionDecayMul.toFixed(2)}</span>
      <span className="hud-chip">부하 x{modifiers.loadCapacityMul.toFixed(2)}</span>
      <span className="hud-chip">저항 {Math.round((modifiers.crisisResist ?? 0) * 100)}%</span>
      <span className="hud-chip hud-chip-accent">슬롯 {Math.round(modifiers.slots ?? 1)}</span>
    </div>
  );
}

export default function RoomCustomization() {
  const resources = useGameStore((state) => state.resources);
  const spendCredits = useGameStore((state) => state.spendCredits);
  const addLog = useGameStore((state) => state.addLog);
  const rooms = useShipInteriorStore((state) => state.rooms);
  const upgradeRoomTier = useShipInteriorStore((state) => state.upgradeRoomTier);
  const installModule = useShipInteriorStore((state) => state.installModule);
  const uninstallModule = useShipInteriorStore((state) => state.uninstallModule);

  const upgradeTier = (room) => {
    const nextTier = (room.tier ?? 1) + 1;
    const cost = ROOM_TIER_CONFIG[nextTier]?.upgradeCost ?? null;
    if (!cost) return addLog(`${room.id} 업그레이드 실패: 이미 최대 티어입니다.`);
    if (!spendCredits(cost)) return addLog(`${room.id} 업그레이드 실패: 크레딧 ${cost} 필요.`);
    const result = upgradeRoomTier(room.id);
    addLog(result.ok ? `${room.id} Tier ${nextTier} 업그레이드 완료: ₢${cost}.` : `${room.id} 업그레이드 실패: ${result.reason}`);
  };

  const install = (room, module) => {
    const cost = module.cost?.credits ?? 0;
    if (!canInstallRoomModule(room, module)) return addLog(`${module.name} 장착 불가: 조건을 확인하세요.`);
    if (!spendCredits(cost)) return addLog(`${module.name} 장착 실패: 크레딧 ${cost} 필요.`);
    const result = installModule(room.id, module.id);
    addLog(result.ok ? `${room.id}에 ${module.name} 장착 완료: ₢${cost}.` : `${module.name} 장착 실패: ${result.reason}`);
  };

  const uninstall = (room, moduleId) => {
    const result = uninstallModule(room.id, moduleId);
    addLog(result.ok ? `${room.id}에서 ${moduleId} 제거 완료.` : `${moduleId} 제거 실패: ${result.reason}`);
  };

  return (
    <section className="xl:col-span-2">
      <div className="section-title">방 업그레이드 & 내부 모듈</div>
      <p className="mt-2 text-sm leading-6 text-slate-400">방 티어와 내부 모듈은 작업 속도, 자연 감소율, 부하 처리, 위기 저항, 작업 슬롯에 즉시 반영됩니다.</p>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {ROOMS.map((roomDef) => {
          const room = rooms[roomDef.id];
          const modifiers = calculateRoomModifiers(room);
          const nextTier = (room?.tier ?? 1) + 1;
          const tierCost = ROOM_TIER_CONFIG[nextTier]?.upgradeCost ?? null;
          const roomModules = ROOM_MODULE_CATALOG.filter((module) => module.applicableRooms.includes(roomDef.id));
          return (
            <div key={roomDef.id} className="rounded border border-slate-700/70 bg-slate-950/60 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-bold text-slate-50">{roomDef.label}</div>
                  <div className="mt-1 text-xs text-slate-500">Tier {room?.tier ?? 1} · {room?.status ?? "안정"}</div>
                </div>
                <span className="hud-chip hud-chip-accent">S{Math.round(modifiers.slots ?? 1)}</span>
              </div>
              <ModifierChips modifiers={modifiers} />
              <button className="secondary-button mt-3 w-full" disabled={!tierCost || resources.credits < tierCost} onClick={() => upgradeTier(room)}>{tierCost ? `Tier ${nextTier} 업그레이드 ₢${tierCost}` : "최대 티어"}</button>
              <div className="mt-3 grid gap-2">
                {roomModules.map((module) => {
                  const installed = (room?.modules ?? []).includes(module.id);
                  const blocked = !canInstallRoomModule(room, module) && !installed;
                  return (
                    <div key={module.id} className={`rounded border p-2 ${installed ? "border-cyan-300/40 bg-cyan-300/10" : blocked ? "border-slate-800 bg-slate-950/30 opacity-70" : "border-slate-700/70 bg-slate-900/70"}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-semibold text-slate-100">{module.name}</div>
                          <div className="mt-1 text-xs leading-5 text-slate-400">{module.desc}</div>
                        </div>
                        <span className="hud-chip">T{module.tierRequired}</span>
                      </div>
                      <div className="mt-2 text-xs text-cyan-100">{formatRoomEffect(module.effect)}</div>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <button className="secondary-button min-h-8 text-xs" disabled={installed || blocked || resources.credits < (module.cost?.credits ?? 0)} onClick={() => install(room, module)}>장착 ₢{module.cost?.credits ?? 0}</button>
                        <button className="secondary-button min-h-8 text-xs" disabled={!installed} onClick={() => uninstall(room, module.id)}>제거</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
