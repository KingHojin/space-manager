import { Rocket } from "lucide-react";
import Badge from "../common/Badge";
import { MODULE_SLOTS } from "../../data/constants";
import { useGameStore } from "../../stores/gameStore";
import { useShipStore } from "../../stores/shipStore";

export default function Ship() {
  const { modules, installed, unlockedModuleIds, equipModule, upgradeModule } = useShipStore();
  const addLog = useGameStore((state) => state.addLog);
  const unlocked = unlockedModuleIds ?? [];

  const equip = (slot, module) => {
    if (!unlocked.includes(module.id)) {
      addLog(`${module.name} 모듈은 아직 보유하지 않았습니다. 시장에서 구매하세요.`);
      return;
    }
    equipModule(slot, module.id);
    addLog(`${slot} 슬롯에 ${module.name} 장착.`);
  };

  const upgrade = (module) => {
    if (!unlocked.includes(module.id)) {
      addLog(`${module.name} 개선 실패: 보유하지 않은 모듈입니다.`);
      return;
    }
    upgradeModule(module.id);
    addLog(`${module.name} 모듈을 Lv.${module.level + 1}로 개선했습니다.`);
  };

  return (
    <div className="grid gap-4 xl:h-full xl:grid-cols-[0.9fr_1.1fr]">
      <section>
        <div className="section-title">
          <Rocket size={18} />
          함선 슬롯 도면
        </div>
        <div className="ship-blueprint mt-5">
          {MODULE_SLOTS.map((slot) => {
            const module = modules.find((entry) => entry.id === installed[slot]);
            return (
              <div key={slot} className={`ship-slot ship-slot-${slot.replace("-", "")}`}>
                <span className="hud-label">{slot}</span>
                <strong>{module?.name}</strong>
                <small className="text-slate-400">Lv.{module?.level ?? 1}</small>
              </div>
            );
          })}
        </div>
      </section>
      <section>
        <div className="section-title">모듈 교체 & 개선</div>
        <div className="mt-4 space-y-4">
          {MODULE_SLOTS.map((slot) => {
            const slotModules = modules.filter((entry) => entry.slot === slot);
            const activeId = installed[slot];
            const active = modules.find((entry) => entry.id === activeId);
            return (
              <div key={slot} className="rounded border border-slate-700/70 bg-slate-950/60 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="hud-label">{slot}</div>
                    <div className="font-semibold text-slate-100">현재: {active?.name ?? "미장착"}</div>
                  </div>
                  {active && <Badge rarity={active.rarity}>{active.rarity}</Badge>}
                </div>
                <div className="mt-3 grid gap-2">
                  {slotModules.map((module) => {
                    const equipped = module.id === activeId;
                    const owned = unlocked.includes(module.id);
                    return (
                      <div key={module.id} className={`rounded border p-3 ${owned ? "border-slate-700/70 bg-slate-900/70" : "border-slate-800 bg-slate-950/40 opacity-70"}`}>
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-100">
                              {module.name} <span className="text-xs text-slate-500">Lv.{module.level}</span>
                            </div>
                            <div className="mt-1 flex flex-wrap gap-1.5">
                              {Object.entries(module.stats).map(([key, value]) => (
                                <span key={key} className="hud-chip">
                                  {key} {value > 0 ? "+" : ""}{value}
                                </span>
                              ))}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <Badge rarity={module.rarity}>{module.rarity}</Badge>
                            <span className={`hud-chip ${owned ? "hud-chip-success" : ""}`}>{owned ? "보유" : "미보유"}</span>
                          </div>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <button className="secondary-button" disabled={equipped || !owned} onClick={() => equip(slot, module)}>
                            {equipped ? "장착 중" : owned ? "장착" : "구매 필요"}
                          </button>
                          <button className="secondary-button" disabled={!owned} onClick={() => upgrade(module)}>
                            개선
                          </button>
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
    </div>
  );
}
