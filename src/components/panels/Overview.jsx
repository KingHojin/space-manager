import { AlertTriangle, Archive, Bell, Briefcase, ChevronRight, Clock3, Compass, Crosshair, GitBranch, Package, Radar, Rocket, Sparkles, Users, Wrench } from "lucide-react";
import { RESOURCES } from "../../data/constants";
import { contracts } from "../../data/contracts";
import { getAllZones, getZoneById, sectors } from "../../data/sectors";
import { formatMinutes } from "../../data/moduleRecipes";
import { useContractStore } from "../../stores/contractStore";
import { useCrewStore } from "../../stores/crewStore";
import { useExplorationStore } from "../../stores/explorationStore";
import { useGameStore } from "../../stores/gameStore";
import { useInventoryStore } from "../../stores/inventoryStore";
import { useShipStore } from "../../stores/shipStore";
import { useSkillStore } from "../../stores/skillStore";
import { getCrewActivity, getFrontierSignals, getShipStatus } from "../../systems/commandCenter";
import { formatGameDate } from "../../systems/gameClock";
import { getTravelProgress } from "../../systems/travelSystem";
import PlanetCanvas from "../three/PlanetCanvas";
import StarMap from "../exploration/StarMap";
import TaskQueuePanel from "../common/TaskQueuePanel";
import { number } from "../../utils/format";

function gaugeTone(value) {
  if (value < RESOURCES.LOW_RESOURCE_WARNING) return "hud-gauge-danger";
  if (value < 50) return "hud-gauge-warn";
  return "hud-gauge-success";
}

const ROLE_ICON_LABEL = {
  함교: "🧭",
  기관실: "🛠",
  포탑: "🎯",
  의무실: "✚",
};

export default function Overview({ onNavigate, onOpenModal }) {
  const zones = getAllZones();
  const sector = sectors[0];
  const {
    currentZoneId,
    selectedZoneId,
    discoveredZoneIds,
    route,
    activeTravel,
    pendingTravelEvent,
    pendingCombatEncounter,
    travelLog,
    selectZone,
  } = useExplorationStore();
  const focusedZone = getZoneById(selectedZoneId) ?? getZoneById(currentZoneId);
  const destinationZone = getZoneById(activeTravel?.toZoneId);
  const originZone = getZoneById(activeTravel?.fromZoneId);
  const shipName = useGameStore((state) => state.shipName);
  const resources = useGameStore((state) => state.resources);
  const currentMinute = useGameStore((state) => state.currentMinute);
  const logs = useGameStore((state) => state.logs);
  const modules = useShipStore((state) => state.getInstalledModules());
  const installationQueue = useShipStore((state) => state.installationQueue ?? []);
  const dust = useInventoryStore((state) => state.dust);
  const items = useInventoryStore((state) => state.items);
  const cards = useInventoryStore((state) => state.cards);
  const crew = useCrewStore((state) => state.crew);
  const trainingQueue = useCrewStore((state) => state.trainingQueue ?? []);
  const treatmentQueue = useCrewStore((state) => state.treatmentQueue ?? []);
  const acceptedIds = useContractStore((state) => state.acceptedIds);
  const completedIds = useContractStore((state) => state.completedIds);
  const skillPoints = useSkillStore((state) => state.availablePoints);
  const activeContracts = contracts.filter((contract) => acceptedIds.includes(contract.id));
  const nextContracts = contracts.filter((contract) => !completedIds.includes(contract.id) && !acceptedIds.includes(contract.id));
  const primaryContract = activeContracts[0] ?? nextContracts[0];
  const dangerZoneCount = zones.filter((zone) => discoveredZoneIds.includes(zone.id) && zone.danger >= 4).length;
  const discoveredRatio = Math.round((discoveredZoneIds.length / Math.max(1, zones.length)) * 100);
  const cargoUsed = items.reduce((sum, item) => sum + Math.max(0, item.qty ?? 0), 0) * 8 + cards.length * 2;
  const topItems = items.filter((item) => item.qty > 0).slice(0, 5);
  const travelProgress = getTravelProgress(activeTravel, currentMinute);
  const shipStatus = getShipStatus({ resources, activeTravel, pendingTravelEvent, pendingCombatEncounter });
  const signals = getFrontierSignals({ currentMinute, discoveredCount: discoveredZoneIds.length, dangerCount: dangerZoneCount, activeContracts: activeContracts.length });
  const queuedWorkCount = trainingQueue.length + treatmentQueue.length + installationQueue.length;
  const injuredCrewCount = crew.filter((member) => member.alive && member.injury && member.injury !== "정상").length;
  const tiredCrewCount = crew.filter((member) => member.alive && (member.fatigue ?? 0) >= 70).length;

  const alerts = [
    pendingCombatEncounter && { title: "긴급 교전", desc: pendingCombatEncounter.title, tone: "hud-chip-danger", target: "combat" },
    pendingTravelEvent && { title: "항해 이벤트", desc: pendingTravelEvent.title, tone: "hud-chip-warn", target: "exploration" },
    resources.fuel < RESOURCES.LOW_RESOURCE_WARNING && { title: "연료 부족", desc: "다음 정거장 보급 권장", tone: "hud-chip-warn", target: "market" },
    resources.oxygen < RESOURCES.LOW_RESOURCE_WARNING && { title: "산소 부족", desc: "장거리 항해 전 보급 필요", tone: "hud-chip-danger", target: "market" },
    resources.hull < RESOURCES.LOW_RESOURCE_WARNING && { title: "선체 위험", desc: "수리 또는 회피 운항 필요", tone: "hud-chip-danger", target: "ship" },
    skillPoints > 0 && { title: "스킬 포인트", desc: `${skillPoints}포인트 사용 가능`, tone: "hud-chip-accent", target: "skilltree" },
    injuredCrewCount > 0 && { title: "부상자", desc: `${injuredCrewCount}명 치료 필요`, tone: "hud-chip-warn", target: "crew" },
  ].filter(Boolean).slice(0, 5);

  const commandCards = [
    { id: "exploration", icon: Compass, title: "항로 설정", desc: activeTravel ? "항해 중 이벤트 대응" : "새 목적지 지정", badge: activeTravel ? `${Math.round(travelProgress)}%` : `${discoveredRatio}%` },
    { id: "crew", icon: Users, title: "승무원 운영", desc: `피로 ${tiredCrewCount} · 부상 ${injuredCrewCount}`, badge: `${crew.filter((member) => member.alive).length}명` },
    { id: "ship", icon: Wrench, title: "함선 정비", desc: `작업 큐 ${queuedWorkCount}건`, badge: `${Math.round(resources.hull)}%` },
    { id: "market", icon: Briefcase, title: "계약/보급", desc: activeContracts.length ? "진행 중 의뢰 확인" : "새 의뢰 수락", badge: activeContracts.length ? `${activeContracts.length}건` : `신규 ${nextContracts.length}` },
  ];

  return (
    <div className="grid gap-3 sm:gap-4">
      <section className="overflow-hidden p-0">
        <div className="relative">
          <StarMap
            zones={zones}
            currentZoneId={currentZoneId}
            selectedZoneId={selectedZoneId}
            discoveredZoneIds={discoveredZoneIds}
            route={route}
            activeTravel={activeTravel}
            currentMinute={currentMinute}
            onSelect={(zone) => selectZone(zone.id === currentZoneId ? null : zone.id)}
            sectorName={sector.name}
            exploredCount={discoveredZoneIds.length}
            totalCount={zones.length}
          />
          <div className="absolute left-3 top-3 rounded border border-cyan-400/20 bg-slate-950/85 p-3 backdrop-blur">
            <div className="hud-label">COMMAND CENTER</div>
            <div className="mt-1 max-w-48 truncate font-bold text-slate-100">{shipName}</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className={`hud-chip ${shipStatus.tone}`}>{shipStatus.label}</span>
              <span className="hud-chip">탐사율 {discoveredRatio}%</span>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="grid gap-4 lg:grid-cols-[1fr_1.35fr] lg:items-stretch">
          <div>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="section-title"><Rocket size={18} />함장 상황센터</div>
                <h2 className="mt-3 text-2xl font-black text-slate-50">{shipStatus.label}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-400">{shipStatus.desc}</p>
              </div>
              <span className={`hud-chip shrink-0 ${shipStatus.tone}`}>실시간</span>
            </div>

            {activeTravel ? (
              <div className="mt-4 rounded border border-amber-300/30 bg-amber-300/10 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-bold text-amber-100">{originZone?.name} → {destinationZone?.name}</div>
                    <div className="mt-1 text-xs text-slate-400">도착 {formatGameDate(activeTravel.completeAt)} · 남은 {formatMinutes(Math.max(0, Math.ceil(activeTravel.completeAt - currentMinute)))}</div>
                  </div>
                  <span className="hud-chip hud-chip-warn">{Math.round(travelProgress)}%</span>
                </div>
                <div className="hud-gauge mt-3"><span className="hud-gauge-fill" style={{ width: `${travelProgress}%` }} /></div>
              </div>
            ) : (
              <div className="mt-4 rounded border border-cyan-400/25 bg-cyan-400/10 p-3">
                <div className="font-bold text-cyan-100">대기 중인 항로 없음</div>
                <p className="mt-1 text-sm text-slate-400">탐사 화면에서 다음 목적지를 지정하면 항해 이벤트와 작업 큐가 동시에 진행됩니다.</p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatusTile label="크레딧" value={`₢ ${number(resources.credits)}`} />
            <StatusTile label="연료" value={`${Math.round(resources.fuel)}%`} tone={gaugeTone(resources.fuel)} gauge={resources.fuel} />
            <StatusTile label="산소" value={`${Math.round(resources.oxygen)}%`} tone={gaugeTone(resources.oxygen)} gauge={resources.oxygen} />
            <StatusTile label="선체" value={`${Math.round(resources.hull)}%`} tone={gaugeTone(resources.hull)} gauge={resources.hull} />
            <StatusTile label="작업 큐" value={`${queuedWorkCount}건`} />
            <StatusTile label="스킬" value={`${skillPoints}P`} />
            <StatusTile label="카드" value={cards.length} />
            <StatusTile label="우주 먼지" value={number(dust, 1)} />
          </div>
        </div>
      </section>

      <div className="grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
        <section>
          <div className="flex items-center justify-between gap-3">
            <div className="section-title"><Bell size={18} />우선 처리 상황</div>
            <button className="secondary-button min-h-8 px-3 text-xs" onClick={() => onOpenModal?.("command")}>메뉴</button>
          </div>
          {alerts.length === 0 ? (
            <div className="mt-3 rounded border border-emerald-400/25 bg-emerald-400/10 p-4 text-sm leading-6 text-emerald-100">즉시 결재할 경고는 없습니다. 항로, 계약, 승무원 작업을 선택해 다음 흐름을 만들 수 있습니다.</div>
          ) : (
            <div className="mt-3 grid gap-2">
              {alerts.map((alert) => (
                <button key={`${alert.title}-${alert.desc}`} className="flex items-center justify-between gap-3 rounded border border-slate-700/70 bg-slate-950/60 px-3 py-2 text-left" onClick={() => onNavigate?.(alert.target)}>
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-50">{alert.title}</div>
                    <div className="mt-0.5 truncate text-xs text-slate-400">{alert.desc}</div>
                  </div>
                  <span className={`hud-chip shrink-0 ${alert.tone}`}>대응</span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section>
          <div className="section-title"><Users size={18} />승무원 자율 행동</div>
          <div className="mt-3 grid gap-2">
            {crew.slice(0, 5).map((member, index) => (
              <button key={member.id} className="flex items-center justify-between gap-3 rounded border border-slate-700/70 bg-slate-950/60 px-3 py-2 text-left" onClick={() => onNavigate?.("crew")}>
                <div className="flex min-w-0 items-center gap-2">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded border border-cyan-400/20 bg-cyan-400/10">{ROLE_ICON_LABEL[member.role] ?? "👤"}</span>
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-slate-100">{member.name}</div>
                    <div className="truncate text-xs text-slate-400">{member.role} · {getCrewActivity(member, currentMinute, index)}</div>
                  </div>
                </div>
                <span className={(member.fatigue ?? 0) > 65 ? "text-xs font-bold text-amber-300" : "text-xs font-bold text-emerald-300"}>{Math.max(0, 100 - (member.fatigue ?? 0))}%</span>
              </button>
            ))}
          </div>
        </section>
      </div>

      <TaskQueuePanel onNavigate={onNavigate} />

      <section>
        <div className="flex items-center justify-between gap-3">
          <div className="section-title"><Radar size={18} />프론티어 신호</div>
          <span className="hud-chip hud-chip-accent">계속 갱신</span>
        </div>
        <p className="mt-2 text-sm leading-6 text-slate-400">우주는 정지하지 않습니다. 시간, 탐사율, 위험 구역, 계약 상태에 따라 새 신호와 소문이 계속 올라옵니다.</p>
        <div className="mt-4 grid gap-2 md:grid-cols-2">
          {signals.map((signal) => (
            <button key={signal.id} className={`rounded border p-3 text-left transition hover:-translate-y-0.5 ${signal.tone}`} onClick={() => onNavigate?.(signal.targetPanel)}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="text-2xl">{signal.icon}</span>
                  <div className="min-w-0">
                    <div className="truncate font-bold text-slate-50">{signal.title}</div>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-300">{signal.desc}</p>
                  </div>
                </div>
                <span className="hud-chip shrink-0">{signal.urgency}</span>
              </div>
              <div className="mt-3 flex items-center justify-between gap-2 text-xs text-slate-400">
                <span>신호 유지 {signal.expiresIn}분</span>
                <span className="inline-flex items-center gap-1 font-semibold text-cyan-100">확인 <ChevronRight size={14} /></span>
              </div>
            </button>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {commandCards.map((card) => {
          const Icon = card.icon;
          return (
            <button key={card.id} className="rounded border border-slate-700/70 bg-slate-950/70 p-4 text-left transition hover:-translate-y-0.5 hover:border-cyan-300" onClick={() => onNavigate?.(card.id)}>
              <div className="flex items-start justify-between gap-2">
                <Icon size={24} className="text-cyan-200" />
                <span className="hud-chip">{card.badge}</span>
              </div>
              <div className="mt-3 font-bold text-slate-50">{card.title}</div>
              <div className="mt-1 text-xs leading-5 text-slate-400">{card.desc}</div>
            </button>
          );
        })}
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_1fr]">
        <section>
          <div className="flex items-center justify-between gap-3"><div className="section-title"><Package size={18} />자원 & 적재</div><button className="secondary-button min-h-8 px-3 text-xs" onClick={() => onOpenModal?.("inventory")}>인벤토리</button></div>
          <div className="mt-4 flex gap-3 overflow-x-auto pb-1">
            <ResourceCard label="크레딧" value={`₢ ${number(resources.credits)}`} />
            <ResourceCard label="우주 먼지" value={number(dust, 1)} />
            {topItems.map((item) => <ResourceCard key={item.id} label={item.name} value={item.qty >= 1000 ? `${(item.qty / 1000).toFixed(1)}k` : item.qty} />)}
          </div>
          <div className="mt-3 flex items-center justify-between text-xs"><span className="hud-label">적재량</span><span className="hud-value">{Math.min(1000, cargoUsed)} / 1000t</span></div>
          <div className="hud-gauge mt-2 hud-gauge-success"><span className="hud-gauge-fill" style={{ width: `${Math.min(100, cargoUsed / 10)}%` }} /></div>
        </section>

        <section>
          <div className="flex items-center justify-between gap-3"><div className="section-title"><Briefcase size={18} />미션 & 보고</div><button className="secondary-button min-h-8 px-3 text-xs" onClick={() => onNavigate?.("market")}>시장</button></div>
          <div className="mt-3 rounded border border-slate-700/70 bg-slate-950/60 p-3">
            <div className="font-bold text-slate-50">{primaryContract?.title ?? "계약 없음"}</div>
            <p className="mt-1 text-sm leading-6 text-slate-400">{primaryContract?.desc ?? "시장 메뉴에서 새 계약을 수락하세요."}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="hud-chip hud-chip-accent">진행 {activeContracts.length}</span>
              <span className="hud-chip">후보 {nextContracts.length}</span>
            </div>
          </div>
          <div className="mt-3 grid gap-2">
            {[...travelLog, ...logs].slice(0, 3).map((log, index) => <div key={`${log}-${index}`} className="rounded border border-slate-700/70 bg-slate-950/60 px-3 py-2 text-xs leading-5 text-slate-300">{log}</div>)}
          </div>
        </section>
      </div>
    </div>
  );
}

function StatusTile({ label, value, tone, gauge }) {
  return (
    <div className="rounded border border-slate-700/70 bg-slate-950/60 px-3 py-2">
      <div className="hud-label">{label}</div>
      <div className="hud-value mt-1 truncate">{value}</div>
      {gauge !== undefined && <div className={`hud-gauge mt-2 ${tone}`}><span className="hud-gauge-fill" style={{ width: `${gauge}%` }} /></div>}
    </div>
  );
}

function ResourceCard({ label, value }) {
  return <div className="grid min-w-24 place-items-center rounded border border-slate-700/70 bg-slate-950/60 px-3 py-3 text-center"><Archive size={18} className="text-cyan-200" /><div className="mt-2 font-bold text-slate-50">{value}</div><div className="mt-1 max-w-20 truncate text-xs text-slate-500">{label}</div></div>;
}
