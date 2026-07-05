import { AlertTriangle, Archive, Briefcase, ChevronRight, Compass, Package, Radar, Rocket, Users, Wrench } from "lucide-react";
import { RESOURCES } from "../../data/constants";
import { contracts } from "../../data/contracts";
import { formatMinutes } from "../../data/moduleRecipes";
import { NODE_TYPE_ICONS, NODE_TYPE_LABELS } from "../../data/navEncounters";
import { useContractStore } from "../../stores/contractStore";
import { useCrewStore } from "../../stores/crewStore";
import { useGameStore } from "../../stores/gameStore";
import { useInventoryStore } from "../../stores/inventoryStore";
import { useNavStore } from "../../stores/navStore";
import { useShipInteriorStore } from "../../stores/shipInteriorStore";
import { useShipStore } from "../../stores/shipStore";
import { useSkillStore } from "../../stores/skillStore";
import { getCrewActivity, getFrontierSignals, getShipStatus, getSituationCards, summarizeSituations } from "../../systems/commandCenter";
import { summarizeCrewAI } from "../../systems/crewAI";
import { applyNavigationEncounter, formatGameDate } from "../../systems/gameClock";
import { isInjured } from "../../systems/injurySystem";
import { nodeToZone, routeDistance } from "../../systems/navigationSystem";
import StarMap from "../exploration/StarMap";
import TaskQueuePanel from "../common/TaskQueuePanel";
import ShipInterior from "../ship/ShipInterior";
import { number } from "../../utils/format";

function gaugeTone(value) {
  if (value < RESOURCES.LOW_RESOURCE_WARNING) return "hud-gauge-danger";
  if (value < 50) return "hud-gauge-warn";
  return "hud-gauge-success";
}

const ROLE_ICON_LABEL = { 함교: "🧭", 기관실: "🛠", 포탑: "🎯", 의무실: "✚" };

function StatusTile({ label, value, tone, gauge }) {
  return <div className="rounded border border-slate-700/70 bg-slate-950/60 px-3 py-2"><div className="hud-label">{label}</div><div className="hud-value mt-1 truncate">{value}</div>{gauge !== undefined && <div className={`hud-gauge mt-2 ${tone}`}><span className="hud-gauge-fill" style={{ width: `${gauge}%` }} /></div>}</div>;
}

function SituationCard({ card, onNavigate }) {
  return <button className={`rounded border p-3 text-left transition hover:-translate-y-0.5 ${card.tone}`} onClick={() => onNavigate?.(card.targetPanel)}><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-3"><span className="text-2xl">{card.icon}</span><div className="min-w-0"><div className="truncate font-bold text-slate-50">{card.title}</div><p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-300">{card.desc}</p></div></div><span className="hud-chip shrink-0 bg-slate-950/40">{card.meta ?? card.priorityLabel}</span></div><div className="mt-3 flex items-center justify-between gap-2 text-xs text-slate-300"><span>{card.priorityLabel}</span><span className="inline-flex items-center gap-1 font-semibold text-cyan-100">{card.action} <ChevronRight size={14} /></span></div></button>;
}

function ResourceCard({ label, value }) {
  return <div className="grid min-w-24 place-items-center rounded border border-slate-700/70 bg-slate-950/60 px-3 py-3 text-center"><Archive size={18} className="text-cyan-200" /><div className="mt-2 font-bold text-slate-50">{value}</div><div className="mt-1 max-w-20 truncate text-xs text-slate-500">{label}</div></div>;
}

function NavDecisionCard({ currentMinute, onNavigate }) {
  const sector = useNavStore((state) => state.sector);
  const currentNodeId = useNavStore((state) => state.currentNodeId);
  const selectedNodeId = useNavStore((state) => state.selectedNodeId);
  const travel = useNavStore((state) => state.travel);
  const fuel = useNavStore((state) => state.fuel);
  const pendingEncounter = useNavStore((state) => state.pendingEncounter);
  const driftState = useNavStore((state) => state.driftState);
  const route = useNavStore((state) => state.route ?? []);
  const selectNode = useNavStore((state) => state.selectNode);
  const planRoute = useNavStore((state) => state.planRoute);
  const addLog = useGameStore((state) => state.addLog);
  const setPaused = useGameStore((state) => state.setPaused);
  const current = sector.nodes.find((node) => node.id === currentNodeId) ?? sector.nodes[0];
  const selected = sector.nodes.find((node) => node.id === selectedNodeId) ?? current;
  const travelProgress = travel ? Math.max(0, Math.min(100, ((currentMinute - travel.startedAt) / Math.max(1, travel.duration)) * 100)) : 0;

  if (pendingEncounter) {
    return <section className="rounded border border-red-400/45 bg-red-400/10 p-4"><div className="flex items-start justify-between gap-3"><div><div className="section-title"><AlertTriangle size={18} />항해 조우 결재</div><h3 className="mt-3 font-black text-red-100">{pendingEncounter.icon} {pendingEncounter.title}</h3><p className="mt-2 text-sm leading-6 text-slate-300">{pendingEncounter.description}</p></div><span className="hud-chip hud-chip-danger">{pendingEncounter.typeLabel}</span></div><div className="mt-4 grid gap-2">{pendingEncounter.options.map((option) => <button key={option.id} className="secondary-button justify-between text-left" onClick={() => applyNavigationEncounter(option.id, currentMinute)}><span>{option.label}</span><span className="text-xs text-cyan-200">결재</span></button>)}</div></section>;
  }

  if (travel) {
    const from = sector.nodes.find((node) => node.id === travel.fromId);
    const to = sector.nodes.find((node) => node.id === travel.toId);
    return <section className="rounded border border-amber-300/35 bg-amber-300/10 p-4"><div className="section-title"><Rocket size={18} />항해 진행 중</div><div className="mt-3 flex items-start justify-between gap-3"><div><div className="font-bold text-amber-100">{from?.name} → {to?.name}</div><div className="mt-1 text-xs text-slate-400">도착 {formatGameDate(travel.completeAt)}</div></div><span className="hud-chip hud-chip-warn">{Math.round(travelProgress)}%</span></div><div className="hud-gauge mt-3"><span className="hud-gauge-fill" style={{ width: `${travelProgress}%` }} /></div></section>;
  }

  if (driftState) {
    return <section className="rounded border border-red-400/45 bg-red-400/10 p-4"><div className="section-title"><AlertTriangle size={18} />표류 상태</div><p className="mt-2 text-sm leading-6 text-slate-300">연료가 없어 항해가 멈췄습니다. 지도 화면에서 긴급 보급을 받으세요.</p><button className="primary-button mt-4 w-full" onClick={() => onNavigate?.("exploration")}>지도 열기</button></section>;
  }

  const connected = (current?.connections ?? []).map((id) => sector.nodes.find((node) => node.id === id)).filter(Boolean);
  const target = selected?.id === current?.id ? connected[0] : selected;
  const distance = target ? routeDistance(sector, [current.id, target.id]) : 0;
  return <section className="rounded border border-cyan-400/30 bg-cyan-400/10 p-4"><div className="section-title"><Compass size={18} />다음 목적지</div><div className="mt-3 flex items-start justify-between gap-3"><div><div className="font-black text-slate-50">{target ? `${NODE_TYPE_ICONS[target.type]} ${target.name}` : "연결 노드 없음"}</div><div className="mt-1 text-xs text-slate-400">{target ? `${NODE_TYPE_LABELS[target.type]} · 거리 ${distance.toFixed(1)}u · Fuel ${Math.round(fuel)}%` : "지도에서 목적지를 선택하세요."}</div></div><span className="hud-chip hud-chip-accent">결재 대기</span></div><div className="mt-4 grid grid-cols-2 gap-2">{connected.slice(0, 2).map((node) => <button key={node.id} className="secondary-button min-h-8 text-xs" onClick={() => selectNode(node.id)}>{NODE_TYPE_ICONS[node.type]} {node.name}</button>)}</div><button className="primary-button mt-3 w-full" disabled={!target || fuel <= 0} onClick={() => { const result = planRoute(target.id, currentMinute); if (result.ok) { setPaused(false); addLog(`${target.name} 항로 결재 완료.`); } else addLog(`항로 설정 실패: ${result.reason}`); }}>항해 시작</button></section>;
}

export default function Overview({ onNavigate, onOpenModal }) {
  const sector = useNavStore((state) => state.sector);
  const currentNodeId = useNavStore((state) => state.currentNodeId);
  const selectedNodeId = useNavStore((state) => state.selectedNodeId);
  const discovered = useNavStore((state) => state.discovered ?? []);
  const navRoute = useNavStore((state) => state.route ?? []);
  const navTravel = useNavStore((state) => state.travel);
  const navFuel = useNavStore((state) => state.fuel);
  const pendingEncounter = useNavStore((state) => state.pendingEncounter);
  const selectNode = useNavStore((state) => state.selectNode);
  const zones = sector.nodes.map(nodeToZone);
  const shipName = useGameStore((state) => state.shipName);
  const resources = useGameStore((state) => state.resources);
  const currentMinute = useGameStore((state) => state.currentMinute);
  const logs = useGameStore((state) => state.logs);
  const installationQueue = useShipStore((state) => state.installationQueue ?? []);
  const dust = useInventoryStore((state) => state.dust);
  const items = useInventoryStore((state) => state.items);
  const cards = useInventoryStore((state) => state.cards);
  const crew = useCrewStore((state) => state.crew);
  const trainingQueue = useCrewStore((state) => state.trainingQueue ?? []);
  const treatmentQueue = useCrewStore((state) => state.treatmentQueue ?? []);
  const crewActivities = useCrewStore((state) => state.crewActivities ?? []);
  const rooms = useShipInteriorStore((state) => state.rooms);
  const activeCrises = useShipInteriorStore((state) => state.activeCrises ?? []);
  const acceptedIds = useContractStore((state) => state.acceptedIds);
  const completedIds = useContractStore((state) => state.completedIds);
  const skillPoints = useSkillStore((state) => state.availablePoints);
  const activeContracts = contracts.filter((contract) => acceptedIds.includes(contract.id));
  const nextContracts = contracts.filter((contract) => !completedIds.includes(contract.id) && !acceptedIds.includes(contract.id));
  const primaryContract = activeContracts[0] ?? nextContracts[0];
  const cargoUsed = items.reduce((sum, item) => sum + Math.max(0, item.qty ?? 0), 0) * 8 + cards.length * 2;
  const topItems = items.filter((item) => item.qty > 0).slice(0, 5);
  const travelProgress = navTravel ? Math.max(0, Math.min(100, ((currentMinute - navTravel.startedAt) / Math.max(1, navTravel.duration)) * 100)) : 0;
  const shipStatus = getShipStatus({ resources, activeTravel: navTravel, pendingTravelEvent: pendingEncounter, pendingCombatEncounter: null, activeCrises });
  const queuedWorkCount = trainingQueue.length + treatmentQueue.length + installationQueue.length;
  const tiredCrewCount = crew.filter((member) => member.alive && (member.fatigue ?? 0) >= 70).length;
  const injuredCrewCount = crew.filter((member) => member.alive && isInjured(member.injury)).length;
  const crewAiSummary = summarizeCrewAI(crewActivities);
  const situations = getSituationCards({ resources, activeTravel: navTravel, pendingTravelEvent: pendingEncounter, pendingCombatEncounter: null, crew, trainingQueue, treatmentQueue, installationQueue, skillPoints, activeContracts, nextContracts, travelProgress, currentMinute, rooms: Object.values(rooms), activeCrises });
  const situationSummary = summarizeSituations(situations);
  const topSituation = situations[0];
  const signals = getFrontierSignals({ currentMinute, discoveredCount: discovered.length, dangerCount: sector.nodes.filter((node) => discovered.includes(node.id) && node.danger >= 4).length, activeContracts: activeContracts.length });

  const commandCards = [
    { id: "exploration", icon: Compass, title: "항로 설정", desc: pendingEncounter ? "조우 결재 대기" : navTravel ? `항해 ${Math.round(travelProgress)}%` : "다음 목적지 지정", badge: pendingEncounter ? "조우" : `${Math.round(navFuel)}%` },
    { id: "crew", icon: Users, title: "승무원 운영", desc: `AI ${crewAiSummary.total} · 부상 ${injuredCrewCount} · 피로 ${tiredCrewCount}`, badge: `${crew.filter((member) => member.alive).length}명` },
    { id: "ship", icon: Wrench, title: "함선 정비", desc: activeCrises.length ? `함내 위기 ${activeCrises.length}건 대응 중` : `작업 큐 ${queuedWorkCount}건`, badge: `${Math.round(resources.hull)}%` },
    { id: "market", icon: Briefcase, title: "계약/보급", desc: activeContracts.length ? "진행 중 의뢰 확인" : "새 의뢰 수락", badge: activeContracts.length ? `${activeContracts.length}건` : `신규 ${nextContracts.length}` },
  ];

  return (
    <div className="grid gap-3 sm:gap-4">
      <section className="overflow-hidden p-0"><div className="relative"><StarMap zones={zones} currentZoneId={currentNodeId} selectedZoneId={selectedNodeId} discoveredZoneIds={discovered} route={navRoute} activeTravel={navTravel ? { ...navTravel, fromZoneId: navTravel.fromId, toZoneId: navTravel.toId } : null} currentMinute={currentMinute} onSelect={(zone) => discovered.includes(zone.id) && selectNode(zone.id)} sectorName={sector.name} exploredCount={discovered.length} totalCount={sector.nodes.length} /><div className="absolute left-3 top-3 rounded border border-cyan-400/20 bg-slate-950/85 p-3 backdrop-blur"><div className="hud-label">COMMAND CENTER</div><div className="mt-1 max-w-48 truncate font-bold text-slate-100">{shipName}</div><div className="mt-2 flex flex-wrap gap-1.5"><span className={`hud-chip ${shipStatus.tone}`}>{shipStatus.label}</span><span className="hud-chip">탐사 {discovered.length}/{sector.nodes.length}</span></div></div></div></section>
      <section><div className="grid gap-4 lg:grid-cols-[1fr_1.35fr]"><div><div className="flex items-start justify-between gap-3"><div><div className="section-title"><Rocket size={18} />함장 상황센터</div><h2 className="mt-3 text-2xl font-black text-slate-50">{shipStatus.label}</h2><p className="mt-2 text-sm leading-6 text-slate-400">{shipStatus.desc}</p></div><span className={`hud-chip shrink-0 ${shipStatus.tone}`}>실시간</span></div>{topSituation && <button className={`mt-4 w-full rounded border p-3 text-left ${topSituation.tone}`} onClick={() => onNavigate?.(topSituation.targetPanel)}><div className="flex items-start gap-3"><span className="text-2xl">{topSituation.icon}</span><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><div className="truncate font-bold text-slate-50">최우선 결재 · {topSituation.title}</div><span className="hud-chip shrink-0 bg-slate-950/40">{topSituation.priorityLabel}</span></div><p className="mt-1 text-sm leading-5 text-slate-300">{topSituation.desc}</p><div className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-cyan-100">{topSituation.action} <ChevronRight size={14} /></div></div></div></button>}</div><div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><StatusTile label="크레딧" value={`₢ ${number(resources.credits)}`} /><StatusTile label="Nav Fuel" value={`${Math.round(navFuel)}%`} tone={gaugeTone(navFuel)} gauge={navFuel} /><StatusTile label="산소" value={`${Math.round(resources.oxygen)}%`} tone={gaugeTone(resources.oxygen)} gauge={resources.oxygen} /><StatusTile label="선체" value={`${Math.round(resources.hull)}%`} tone={gaugeTone(resources.hull)} gauge={resources.hull} /><StatusTile label="결재 큐" value={`${situationSummary.total}건`} /><StatusTile label="긴급" value={`${situationSummary.critical}건`} /><StatusTile label="함내 위기" value={`${activeCrises.length}건`} /><StatusTile label="부상" value={`${injuredCrewCount}명`} /></div></div></section>
      <div className="grid gap-3 lg:grid-cols-[0.95fr_1.05fr]"><NavDecisionCard currentMinute={currentMinute} onNavigate={onNavigate} /><section><div className="flex items-center justify-between gap-3"><div className="section-title"><AlertTriangle size={18} />함장 결재 큐</div><button className="secondary-button min-h-8 px-3 text-xs" onClick={() => onOpenModal?.("command")}>메뉴</button></div><div className="mt-3 grid gap-2 md:grid-cols-2">{situations.slice(0, 4).map((card) => <SituationCard key={card.id} card={card} onNavigate={onNavigate} />)}</div></section></div>
      <section><div className="flex items-center justify-between gap-3"><div className="section-title"><Radar size={18} />프론티어 신호</div><span className="hud-chip hud-chip-accent">노드 기반</span></div><div className="mt-4 grid gap-2 md:grid-cols-2">{signals.slice(0, 4).map((signal) => <button key={signal.id} className={`rounded border p-3 text-left transition hover:-translate-y-0.5 ${signal.tone}`} onClick={() => onNavigate?.(signal.targetPanel)}><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-3"><span className="text-2xl">{signal.icon}</span><div className="min-w-0"><div className="truncate font-bold text-slate-50">{signal.title}</div><p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-300">{signal.desc}</p></div></div><span className="hud-chip shrink-0">{signal.urgency}</span></div></button>)}</div></section>
      <div className="grid gap-3 lg:grid-cols-[0.9fr_1.1fr]"><div className="grid gap-3"><ShipInterior crew={crew} activities={crewActivities ?? []} rooms={rooms} activeCrises={activeCrises} compact onCrewClick={() => onNavigate?.("crew")} /><section><div className="flex items-center justify-between gap-3"><div className="section-title"><Users size={18} />승무원 AI 행동</div><span className="hud-chip hud-chip-accent">자동 배정</span></div><div className="mt-3 grid gap-2">{crew.slice(0, 5).map((member, index) => { const activity = crewActivities.find((entry) => entry.memberId === member.id); const actionText = activity ? `${activity.station} · ${activity.action}` : getCrewActivity(member, currentMinute, index); return <button key={member.id} className="flex items-center justify-between gap-3 rounded border border-slate-700/70 bg-slate-950/60 px-3 py-2 text-left" onClick={() => onNavigate?.("crew")}><div className="flex min-w-0 items-center gap-2"><span className="grid h-8 w-8 shrink-0 place-items-center rounded border border-cyan-400/20 bg-cyan-400/10">{ROLE_ICON_LABEL[member.role] ?? "👤"}</span><div className="min-w-0"><div className="truncate font-semibold text-slate-100">{member.name}</div><div className="truncate text-xs text-slate-400">{member.role} · {actionText}</div></div></div><span className={(activity?.priority === "emergency" || (member.fatigue ?? 0) > 65) ? "text-xs font-bold text-amber-300" : "text-xs font-bold text-emerald-300"}>{Math.max(0, 100 - (member.fatigue ?? 0))}%</span></button>; })}</div></section></div><TaskQueuePanel onNavigate={onNavigate} /></div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{commandCards.map((card) => { const Icon = card.icon; return <button key={card.id} className="rounded border border-slate-700/70 bg-slate-950/70 p-4 text-left transition hover:-translate-y-0.5 hover:border-cyan-300" onClick={() => onNavigate?.(card.id)}><div className="flex items-start justify-between gap-2"><Icon size={24} className="text-cyan-200" /><span className="hud-chip">{card.badge}</span></div><div className="mt-3 font-bold text-slate-50">{card.title}</div><div className="mt-1 text-xs leading-5 text-slate-400">{card.desc}</div></button>; })}</div>
      <div className="grid gap-3 lg:grid-cols-[1fr_1fr]"><section><div className="flex items-center justify-between gap-3"><div className="section-title"><Package size={18} />자원 & 적재</div><button className="secondary-button min-h-8 px-3 text-xs" onClick={() => onOpenModal?.("inventory")}>인벤토리</button></div><div className="mt-4 flex gap-3 overflow-x-auto pb-1"><ResourceCard label="크레딧" value={`₢ ${number(resources.credits)}`} /><ResourceCard label="우주 먼지" value={number(dust, 1)} />{topItems.map((item) => <ResourceCard key={item.id} label={item.name} value={item.qty >= 1000 ? `${(item.qty / 1000).toFixed(1)}k` : item.qty} />)}</div><div className="mt-3 flex items-center justify-between text-xs"><span className="hud-label">적재량</span><span className="hud-value">{Math.min(1000, cargoUsed)} / 1000t</span></div><div className="hud-gauge mt-2 hud-gauge-success"><span className="hud-gauge-fill" style={{ width: `${Math.min(100, cargoUsed / 10)}%` }} /></div></section><section><div className="flex items-center justify-between gap-3"><div className="section-title"><Briefcase size={18} />미션 & 보고</div><button className="secondary-button min-h-8 px-3 text-xs" onClick={() => onNavigate?.("market")}>시장</button></div><div className="mt-3 rounded border border-slate-700/70 bg-slate-950/60 p-3"><div className="font-bold text-slate-50">{primaryContract?.title ?? "계약 없음"}</div><p className="mt-1 text-sm leading-6 text-slate-400">{primaryContract?.desc ?? "시장 메뉴에서 새 계약을 수락하세요."}</p><div className="mt-2 flex flex-wrap gap-1.5"><span className="hud-chip hud-chip-accent">진행 {activeContracts.length}</span><span className="hud-chip">후보 {nextContracts.length}</span></div></div><div className="mt-3 grid gap-2">{logs.slice(0, 3).map((log, index) => <div key={`${log}-${index}`} className="rounded border border-slate-700/70 bg-slate-950/60 px-3 py-2 text-xs leading-5 text-slate-300">{log}</div>)}</div></section></div>
    </div>
  );
}
