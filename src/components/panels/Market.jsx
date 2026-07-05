import { Briefcase, Cpu, Fuel, Store, Wind, Wrench } from "lucide-react";
import Badge from "../common/Badge";
import { contracts } from "../../data/contracts";
import { getFactionById, factions } from "../../data/factions";
import { formatMinutes, getModuleRule, hasRequiredItems } from "../../data/moduleRecipes";
import { formatGameDate } from "../../systems/gameClock";
import { useContractStore } from "../../stores/contractStore";
import { useExplorationStore } from "../../stores/explorationStore";
import { useFactionStore } from "../../stores/factionStore";
import { useGameStore } from "../../stores/gameStore";
import { useInventoryStore } from "../../stores/inventoryStore";
import { useShipStore } from "../../stores/shipStore";

const SERVICE_ZONES = new Set(["anchor-station", "eos-harbor", "umbra-relay", "sable-point", "last-market"]);

const services = [
  { id: "fuel", label: "연료 보급", desc: "항해 가능 거리를 회복합니다.", icon: Fuel, cost: 280, changes: { fuel: 35 } },
  { id: "oxygen", label: "산소 충전", desc: "장거리 항해 안정성을 올립니다.", icon: Wind, cost: 220, changes: { oxygen: 30 } },
  { id: "hull", label: "선체 정비", desc: "외부 장갑과 내부 격벽을 보수합니다.", icon: Wrench, cost: 360, changes: { hull: 28 } },
  { id: "full", label: "종합 출항 패키지", desc: "연료, 산소, 선체를 한 번에 정비합니다.", icon: Store, cost: 720, changes: { fuel: 45, oxygen: 35, hull: 32 } },
];

export default function Market() {
  const currentZoneId = useExplorationStore((state) => state.currentZoneId);
  const scannedZoneIds = useExplorationStore((state) => state.scannedZoneIds);
  const docked = SERVICE_ZONES.has(currentZoneId);
  const resources = useGameStore((state) => state.resources);
  const currentMinute = useGameStore((state) => state.currentMinute);
  const spendCredits = useGameStore((state) => state.spendCredits);
  const addResources = useGameStore((state) => state.addResources);
  const advanceMinutes = useGameStore((state) => state.advanceMinutes);
  const addLog = useGameStore((state) => state.addLog);
  const items = useInventoryStore((state) => state.items);
  const removeItem = useInventoryStore((state) => state.removeItem);
  const modules = useShipStore((state) => state.modules);
  const unlockedModuleIds = useShipStore((state) => state.unlockedModuleIds ?? []);
  const unlockModule = useShipStore((state) => state.unlockModule);
  const acceptedIds = useContractStore((state) => state.acceptedIds);
  const completedIds = useContractStore((state) => state.completedIds);
  const acceptContract = useContractStore((state) => state.acceptContract);
  const completeContract = useContractStore((state) => state.completeContract);
  const reputation = useFactionStore((state) => state.reputation);
  const addReputation = useFactionStore((state) => state.addReputation);

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

  const buyModule = (module) => {
    if (!docked) {
      addLog("모듈 제작 실패: 시장 구역에 도킹해야 합니다.");
      return;
    }
    const rule = getModuleRule(module);
    if (!hasRequiredItems(items, rule.items)) {
      addLog(`${module.name} 제작 실패: 전리품/재료가 부족합니다.`);
      return;
    }
    if (!spendCredits(rule.purchaseCredits)) {
      addLog(`${module.name} 제작 실패: 크레딧이 부족합니다.`);
      return;
    }
    rule.items.forEach((requirement) => removeItem(requirement.id, requirement.qty));
    advanceMinutes(rule.craftMinutes);
    unlockModule(module.id);
    addLog(`모듈 제작 완료: ${module.name}. 비용 ₢${rule.purchaseCredits}, 소요 ${formatMinutes(rule.craftMinutes)}, 완료 ${formatGameDate(currentMinute + rule.craftMinutes)}.`);
  };

  const accept = (contract) => {
    if (!docked) {
      addLog("의뢰 수락 실패: 시장 또는 정거장 구역에 도킹해야 합니다.");
      return;
    }
    acceptContract(contract.id);
    addLog(`의뢰 수락: ${contract.title}`);
  };

  const canCompleteContract = (contract) => {
    if (!acceptedIds.includes(contract.id)) return false;
    if (contract.type === "survey") return scannedZoneIds.includes(contract.targetZoneId);
    if (!contract.itemId) return true;
    return (items.find((item) => item.id === contract.itemId)?.qty ?? 0) >= (contract.itemQty ?? 1);
  };

  const complete = (contract) => {
    if (!canCompleteContract(contract)) {
      addLog(`${contract.title} 완료 실패: 조건을 충족하지 못했습니다.`);
      return;
    }
    if (contract.itemId) removeItem(contract.itemId, contract.itemQty ?? 1);
    addResources({ credits: contract.rewardCredits });
    useInventoryStore.getState().addDust(contract.rewardDust ?? 0);
    addReputation(contract.factionId, contract.rep ?? 1);
    completeContract(contract.id);
    addLog(`의뢰 완료: ${contract.title}. 크레딧 +${contract.rewardCredits}, 평판 +${contract.rep}.`);
  };

  const moduleShop = modules.filter((module) => !unlockedModuleIds.includes(module.id)).slice(0, 12);

  return (
    <section className="space-y-5">
      <div>
        <div className="section-title">
          <Store size={18} />
          정거장 시장
        </div>
        <div className="mt-5 rounded border border-slate-700/70 bg-slate-950/60 p-5">
          <span className={`hud-chip ${docked ? "hud-chip-success" : "hud-chip-warn"}`}>{docked ? "도킹 중" : "도킹 필요"}</span>
          <div className="mt-3 text-xl font-bold text-slate-50">{docked ? "보급·정비·의뢰·모듈 제작 가능" : "정거장 도킹 필요"}</div>
          <p className="mt-2 text-sm text-slate-400">
            {docked ? "크레딧과 전리품을 사용해 출항 전 핵심 자원을 회복하고, 의뢰와 모듈 제작을 진행할 수 있습니다." : "앵커 정거장, 에오스 항구, 세이블 포인트, 마지막 시장 같은 구역으로 이동하면 시장 기능이 활성화됩니다."}
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <Status label="크레딧" value={`₢ ${resources.credits}`} />
            <Status label="연료" value={`${Math.round(resources.fuel)}%`} />
            <Status label="산소" value={`${Math.round(resources.oxygen)}%`} />
          </div>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {services.map((service) => {
          const Icon = service.icon;
          const disabled = !docked || resources.credits < service.cost;
          return (
            <div key={service.id} className="rounded border border-slate-700/70 bg-slate-950/60 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded border border-cyan-400/30 bg-cyan-400/10 text-cyan-200"><Icon size={18} /></div>
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-100">{service.label}</div>
                    <p className="mt-1 text-sm text-slate-400">{service.desc}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {Object.entries(service.changes).map(([key, value]) => <span key={key} className="hud-chip hud-chip-success">{key} +{value}</span>)}
                    </div>
                  </div>
                </div>
                <span className="hud-chip">₢ {service.cost}</span>
              </div>
              <button className="primary-button mt-4 w-full" disabled={disabled} onClick={() => buyService(service)}>구매</button>
            </div>
          );
        })}
      </div>

      <section>
        <div className="section-title"><Briefcase size={18} />계약 의뢰</div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {contracts.map((contract) => {
            const faction = getFactionById(contract.factionId);
            const accepted = acceptedIds.includes(contract.id);
            const completed = completedIds.includes(contract.id);
            const ready = canCompleteContract(contract);
            return (
              <div key={contract.id} className="rounded border border-slate-700/70 bg-slate-950/60 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-slate-100">{contract.title}</div>
                    <p className="mt-1 text-sm text-slate-400">{contract.desc}</p>
                  </div>
                  <span className={`hud-chip ${completed ? "hud-chip-success" : accepted ? "hud-chip-accent" : ""}`}>{completed ? "완료" : accepted ? "진행" : "신규"}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <span className="hud-chip">{faction?.name}</span>
                  <span className="hud-chip">조건: {contract.requirement}</span>
                  <span className="hud-chip hud-chip-success">₢ {contract.rewardCredits}</span>
                  <span className="hud-chip">먼지 +{contract.rewardDust}</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button className="secondary-button" disabled={accepted || completed || !docked} onClick={() => accept(contract)}>수락</button>
                  <button className="primary-button" disabled={!ready || completed} onClick={() => complete(contract)}>완료 보고</button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <div className="section-title"><Cpu size={18} />모듈 제작소</div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {moduleShop.length === 0 ? (
            <div className="rounded border border-slate-700/70 bg-slate-950/60 p-4 text-sm text-slate-400">제작 가능한 신규 모듈이 없습니다.</div>
          ) : (
            moduleShop.map((module) => {
              const rule = getModuleRule(module);
              const hasItems = hasRequiredItems(items, rule.items);
              const disabled = !docked || resources.credits < rule.purchaseCredits || !hasItems;
              return (
                <div key={module.id} className="rounded border border-slate-700/70 bg-slate-950/60 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-slate-100">{module.name}</div>
                      <div className="mt-1 text-xs text-slate-500">{module.slot} · Lv.{module.level}</div>
                    </div>
                    <Badge rarity={module.rarity}>{module.rarity}</Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {Object.entries(module.stats).map(([key, value]) => <span key={key} className="hud-chip">{key} {value > 0 ? "+" : ""}{value}</span>)}
                  </div>
                  <div className="mt-3 rounded border border-slate-700/70 bg-slate-900/60 p-3 text-xs leading-5 text-slate-300">
                    <div className="font-semibold text-slate-100">제작 조건</div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <span className="hud-chip">₢ {rule.purchaseCredits}</span>
                      <span className="hud-chip">{formatMinutes(rule.craftMinutes)}</span>
                      {rule.items.length === 0 ? <span className="hud-chip hud-chip-success">재료 없음</span> : rule.items.map((req) => {
                        const owned = items.find((item) => item.id === req.id)?.qty ?? 0;
                        return <span key={req.id} className={`hud-chip ${owned >= req.qty ? "hud-chip-success" : "hud-chip-danger"}`}>{req.id} {owned}/{req.qty}</span>;
                      })}
                    </div>
                  </div>
                  <button className="primary-button mt-4 w-full" disabled={disabled} onClick={() => buyModule(module)}>제작/해금</button>
                </div>
              );
            })
          )}
        </div>
      </section>

      <section>
        <div className="section-title">세력 평판</div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {factions.map((faction) => <Status key={faction.id} label={faction.name} value={reputation[faction.id] ?? 0} />)}
        </div>
      </section>
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
