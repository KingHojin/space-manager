import { Rocket } from "lucide-react";
import Badge from "../common/Badge";
import { MODULE_SLOTS } from "../../data/constants";
import { useShipStore } from "../../stores/shipStore";

export default function Ship() {
  const { modules, installed } = useShipStore();
  return (
    <div className="grid gap-4 xl:h-full xl:grid-cols-[1fr_1fr]">
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
                <span>{slot}</span>
                <strong>{module?.name}</strong>
              </div>
            );
          })}
        </div>
      </section>
      <section>
        <div className="section-title">장착 모듈</div>
        <div className="mt-4 space-y-2">
          {MODULE_SLOTS.map((slot) => {
            const module = modules.find((entry) => entry.id === installed[slot]);
            return (
              <div key={slot} className="flex items-center justify-between rounded border border-slate-700/70 bg-slate-950/60 p-3">
                <div>
                  <div className="text-sm text-slate-500">{slot}</div>
                  <div className="font-semibold text-slate-100">{module?.name}</div>
                </div>
                <Badge rarity={module?.rarity}>{module?.rarity}</Badge>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
