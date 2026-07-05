import { Fuel, Store, Wind, Wrench } from "lucide-react";
import { useExplorationStore } from "../../stores/explorationStore";
import { useGameStore } from "../../stores/gameStore";

const SERVICE_ZONES = new Set(["anchor-station", "eos-harbor", "umbra-relay", "sable-point", "last-market"]);

const services = [
  { id: "fuel", label: "연료 보급", desc: "항해 가능 거리를 회복합니다.", icon: Fuel, cost: 280, changes: { fuel: 35 } },
  { id: "oxygen", label: "산소 충전", desc: "장거리 항해 안정성을 올립니다.", icon: Wind, cost: 220, changes: { oxygen: 30 } },
  { id: "hull", label: "선체 정비", desc: "외부 장갑과 내부 격벽을 보수합니다.", icon: Wrench, cost: 360, changes: { hull: 28 } },
  { id: "full", label: "종합 출항 패키지", desc: "연료, 산소, 선체를 한 번에 정비합니다.", icon: Store, cost: 720, changes: { fuel: 45, oxygen: 35, hull: 32 } },
];

export default function Market() {
  const currentZoneId = useExplorationStore((state) => state.currentZoneId);
  const docked = SERVICE_ZONES.has(currentZoneId);
  const resources = useGameStore((state) => state.resources);
  const spendCredits = useGameStore((state) => state.spendCredits);
  const addResources = useGameStore((state) => state.addResources);
  const addLog = useGameStore((state) => state.addLog);

  const buyService = (service) => {
    if (!docked) {
      addLog("시장 안내: 정거장 또는 시장 구역에 도킹해야 합니다.");
      return;
    }
    if (!spendCredits(service.cost)) {
      addLog(`${service.label}: 크레딧이 부족합니다.`);
      return;
    }
    addResources(service.changes);
    addLog(`${service.label} 완료. 크레딧 ${service.cost} 사용.`);
  };

  return (
    <section>
      <div className="section-title">
        <Store size={18} />
        정거장 시장
      </div>
      <div className="mt-5 rounded border border-slate-700/70 bg-slate-950/60 p-5">
        <span className={`hud-chip ${docked ? "hud-chip-success" : "hud-chip-warn"}`}>{docked ? "도킹 중" : "도킹 필요"}</span>
        <div className="mt-3 text-xl font-bold text-slate-50">{docked ? "보급·정비 서비스 이용 가능" : "정거장 도킹 필요"}</div>
        <p className="mt-2 text-sm text-slate-400">
          {docked ? "크레딧을 사용해 출항 전 핵심 자원을 회복할 수 있습니다." : "앵커 정거장, 에오스 항구, 세이블 포인트, 마지막 시장 같은 구역으로 이동하면 시장 기능이 활성화됩니다."}
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <Status label="크레딧" value={`₢ ${resources.credits}`} />
          <Status label="연료" value={`${Math.round(resources.fuel)}%`} />
          <Status label="산소" value={`${Math.round(resources.oxygen)}%`} />
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {services.map((service) => {
          const Icon = service.icon;
          const disabled = !docked || resources.credits < service.cost;
          return (
            <div key={service.id} className="rounded border border-slate-700/70 bg-slate-950/60 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded border border-cyan-400/30 bg-cyan-400/10 text-cyan-200">
                    <Icon size={18} />
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-100">{service.label}</div>
                    <p className="mt-1 text-sm text-slate-400">{service.desc}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {Object.entries(service.changes).map(([key, value]) => (
                        <span key={key} className="hud-chip hud-chip-success">
                          {key} +{value}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <span className="hud-chip">₢ {service.cost}</span>
              </div>
              <button className="primary-button mt-4 w-full" disabled={disabled} onClick={() => buyService(service)}>
                구매
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Status({ label, value }) {
  return (
    <div className="rounded border border-slate-700/70 bg-slate-900/70 px-3 py-2">
      <div className="hud-label">{label}</div>
      <div className="hud-value mt-1">{value}</div>
    </div>
  );
}
