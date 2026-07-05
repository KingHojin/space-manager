import { Archive, Briefcase, ChevronDown, Compass, Cross, Crosshair, GitBranch, Package, Radar, Rocket, Search, Shield, Sparkles, Users, Wrench } from "lucide-react";
import { RESOURCES } from "../../data/constants";
import { contracts } from "../../data/contracts";
import { getFactionById } from "../../data/factions";
import { getAllZones, getZoneById, sectors } from "../../data/sectors";
import { useContractStore } from "../../stores/contractStore";
import { useCrewStore } from "../../stores/crewStore";
import { useExplorationStore } from "../../stores/explorationStore";
import { useGameStore } from "../../stores/gameStore";
import { useInventoryStore } from "../../stores/inventoryStore";
import { useShipStore } from "../../stores/shipStore";
import { useSkillStore } from "../../stores/skillStore";
import PlanetCanvas from "../three/PlanetCanvas";
import StarMap from "../exploration/StarMap";
import { number } from "../../utils/format";

function gaugeTone(value) {
  if (value < RESOURCES.LOW_RESOURCE_WARNING) return "hud-gauge-danger";
  if (value < 50) return "hud-gauge-warn";
  return "hud-gauge-success";
}

const ROLE_ICONS = {
  함교: { icon: Compass, color: "text-cyan-400" },
  포탑: { icon: Crosshair, color: "text-red-400" },
  기관실: { icon: Wrench, color: "text-amber-400" },
  의무실: { icon: Cross, color: "text-emerald-400" },
};

function RoleIcon({ role, size = 14 }) {
  const config = ROLE_ICONS[role] ?? { icon: Users, color: "text-slate-500" };
  const Icon = config.icon;
  return <Icon size={size} className={config.color} />;
}

export default function Overview({ onNavigate, onOpenModal }) {
  const zones = getAllZones();
  const sector = sectors[0];
  const { currentZoneId, selectedZoneId, discoveredZoneIds, route, selectZone } = useExplorationStore();
  const focusedZone = getZoneById(selectedZoneId) ?? getZoneById(currentZoneId);
  const shipName = useGameStore((state) => state.shipName);
  const resources = useGameStore((state) => state.resources);
  const logs = useGameStore((state) => state.logs);
  const modules = useShipStore((state) => state.getInstalledModules());
  const dust = useInventoryStore((state) => state.dust);
  const items = useInventoryStore((state) => state.items);
  const cards = useInventoryStore((state) => state.cards);
  const crew = useCrewStore((state) => state.crew);
  const acceptedIds = useContractStore((state) => state.acceptedIds);
  const completedIds = useContractStore((state) => state.completedIds);
  const skillPoints = useSkillStore((state) => state.availablePoints);
  const activeContracts = contracts.filter((contract) => acceptedIds.includes(contract.id));
  const primaryContract = activeContracts[0] ?? contracts.find((contract) => !completedIds.includes(contract.id));
  const faction = getFactionById(primaryContract?.factionId);
  const dangerZoneCount = zones.filter((zone) => discoveredZoneIds.includes(zone.id) && zone.danger >= 4).length;
  const discoveredRatio = Math.round((discoveredZoneIds.length / Math.max(1, zones.length)) * 100);
  const cargoUsed = items.reduce((sum, item) => sum + Math.max(0, item.qty ?? 0), 0) * 8 + cards.length * 2;
  const topItems = items.filter((item) => item.qty > 0).slice(0, 6);

  const actionTiles = [
    { id: "combat", label: "전투", desc: "위험 감지", icon: Crosshair, tone: "border-red-500/50 bg-red-500/10 text-red-200", badge: dangerZoneCount, button: "진입" },
    { id: "ship", label: "함선 업그레이드", desc: "성능 향상", icon: Wrench, tone: "border-sky-500/50 bg-sky-500/10 text-sky-200", button: "업그레이드" },
    { id: "collector", label: "컬렉션", desc: "유물 & 아이템", icon: Archive, tone: "border-emerald-500/50 bg-emerald-500/10 text-emerald-200", badge: cards.length, button: "수집" },
    { id: "skilltree", label: "스킬트리", desc: `사용 가능 포인트: ${skillPoints}`, icon: GitBranch, tone: "border-violet-500/50 bg-violet-500/10 text-violet-200", button: "트리 보기" },
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
            onSelect={(zone) => selectZone(zone.id === currentZoneId ? null : zone.id)}
            sectorName={sector.name}
            exploredCount={discoveredZoneIds.length}
            totalCount={zones.length}
          />
          <div className="absolute left-3 top-3 hidden w-32 rounded border border-cyan-400/20 bg-slate-950/80 p-3 backdrop-blur sm:block">
            <div className="hud-label">GALAXY SECTOR</div>
            <div className="mt-1 font-bold text-slate-100">오리온 익스팬스</div>
            <div className="mt-2 text-xs text-slate-400">탐사율 {discoveredRatio}%</div>
            <div className="hud-gauge mt-2"><span className="hud-gauge-fill" style={{ width: `${discoveredRatio}%` }} /></div>
          </div>
          <div className="absolute left-3 top-3 flex flex-col gap-2 sm:top-32">
            {[Search, Radar, Briefcase, Shield].map((Icon, index) => (
              <button key={index} className="relative grid h-10 w-10 place-items-center rounded-full border border-slate-600/70 bg-slate-950/80 text-cyan-100 backdrop-blur">
                <Icon size={17} />
                {index === 2 && activeContracts.length > 0 && <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-sky-500 px-1 text-[0.6rem] font-bold text-white">{activeContracts.length}</span>}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section>
        <div className="grid gap-4 sm:grid-cols-[8rem_1fr_auto] sm:items-center">
          <div className="h-28 overflow-hidden rounded border border-cyan-400/25 bg-slate-950/70"><PlanetCanvas zone={focusedZone} interactive={false} /></div>
          <div>
            <div className="text-2xl font-bold text-amber-200">{focusedZone?.name ?? "미확인 구역"}</div>
            <div className="mt-1 text-sm text-slate-400">{focusedZone?.type ?? "unknown"} · 자원 밀도 {focusedZone?.richness ?? 0}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="hud-chip">세력 {faction?.name ?? "연합"}</span>
              <span className="hud-chip hud-chip-warn">위험 {focusedZone?.danger ?? 0}</span>
              <span className="hud-chip hud-chip-accent">3D 지도</span>
            </div>
          </div>
          <div className="grid gap-2 sm:min-w-48">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <InfoBox label="거리" value={`${focusedZone?.distance ?? 0} LY`} />
              <InfoBox label="예상 이동" value={`${Math.max(1, Math.round((focusedZone?.distance ?? 0) / 6))} 일`} />
            </div>
            <button className="primary-button w-full" onClick={() => onNavigate?.("exploration")}>항로 설정</button>
          </div>
        </div>
      </section>

      <div className="grid gap-3 lg:grid-cols-3">
        <section>
          <div className="flex items-center justify-between"><div className="section-title"><Rocket size={18} />지휘관 & 함선</div><button className="icon-button h-8 px-2" onClick={() => onNavigate?.("ship")}><ChevronDown size={15} /></button></div>
          <div className="mt-4 text-lg font-bold text-slate-50">{shipName}</div>
          <div className="mt-3 grid gap-2">
            <GaugeRow label="함체 무결성" value={resources.hull} />
            <GaugeRow label="연료" value={resources.fuel} />
            <GaugeRow label="산소" value={resources.oxygen} />
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">{modules.slice(0, 4).map((module) => <span key={module.id} className="hud-chip">{module.name}</span>)}</div>
        </section>

        <section>
          <div className="flex items-center justify-between"><div className="section-title"><Users size={18} />승무원 현황</div><span className="hud-chip hud-chip-accent">{crew.length} / 32</span></div>
          <div className="mt-4 grid gap-2">
            {crew.slice(0, 5).map((member) => (
              <div key={member.id} className="flex items-center justify-between gap-2 rounded border border-slate-700/70 bg-slate-950/60 px-3 py-2 text-sm">
                <div className="flex min-w-0 items-center gap-2"><RoleIcon role={member.role} /><span className="truncate text-slate-300">{member.role}</span></div>
                <span className="truncate text-slate-400">{member.name}</span>
                <span className={(member.fatigue ?? 0) > 60 ? "text-amber-300" : "text-emerald-300"}>{Math.max(55, 100 - (member.fatigue ?? 0))}%</span>
              </div>
            ))}
          </div>
          <button className="secondary-button mt-4 w-full" onClick={() => onNavigate?.("crew")}>승무원 관리</button>
        </section>

        <section>
          <div className="flex items-center justify-between"><div className="section-title"><Briefcase size={18} />진행 중인 미션</div><span className="hud-chip hud-chip-warn">{activeContracts.length > 0 ? "진행 중" : "대기"}</span></div>
          <div className="mt-4 text-lg font-bold text-slate-50">{primaryContract?.title ?? "시장 의뢰 대기"}</div>
          <p className="mt-2 min-h-12 text-sm leading-6 text-slate-400">{primaryContract?.desc ?? "시장 메뉴에서 새 계약을 수락하세요."}</p>
          <div className="mt-3 grid grid-cols-2 gap-2"><InfoBox label="목표" value={primaryContract ? "2 / 4" : "0 / 0"} /><InfoBox label="보상" value={primaryContract ? `₢ ${number(primaryContract.rewardCredits)}` : "-"} /></div>
          <div className="hud-gauge mt-3"><span className="hud-gauge-fill" style={{ width: primaryContract ? "50%" : "8%" }} /></div>
          <button className="secondary-button mt-4 w-full" onClick={() => onNavigate?.("market")}>미션 보기</button>
        </section>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {actionTiles.map((tile) => {
          const Icon = tile.icon;
          return (
            <button key={tile.id} className={`relative rounded border p-4 text-left ${tile.tone}`} onClick={() => onNavigate?.(tile.id)}>
              {tile.badge > 0 && <span className="absolute right-3 top-3 grid h-6 min-w-6 place-items-center rounded bg-red-500 px-1 text-xs font-bold text-white">{tile.badge}</span>}
              <Icon size={28} />
              <div className="mt-3 text-lg font-bold">{tile.label}</div>
              <div className="mt-1 text-xs opacity-80">{tile.desc}</div>
              <div className="secondary-button mt-4 w-full">{tile.button}</div>
            </button>
          );
        })}
      </div>

      <section>
        <div className="flex items-center justify-between gap-3"><div className="section-title"><Package size={18} />자원 & 인벤토리</div><span className="hud-chip">적재 {Math.min(1000, cargoUsed)} / 1000t</span></div>
        <div className="mt-4 flex gap-3 overflow-x-auto pb-1">
          <ResourceCard label="크레딧" value={`₢ ${number(resources.credits)}`} />
          <ResourceCard label="우주 먼지" value={number(dust, 1)} />
          {topItems.map((item) => <ResourceCard key={item.id} label={item.name} value={item.qty >= 1000 ? `${(item.qty / 1000).toFixed(1)}k` : item.qty} />)}
          <button className="secondary-button min-w-28" onClick={() => onOpenModal?.("inventory")}>전체 보기</button>
        </div>
        <div className="hud-gauge mt-3 hud-gauge-success"><span className="hud-gauge-fill" style={{ width: `${Math.min(100, cargoUsed / 10)}%` }} /></div>
      </section>

      <section>
        <div className="section-title"><Sparkles size={18} />최근 이벤트</div>
        <div className="mt-3 grid gap-2">{logs.slice(0, 3).map((log, index) => <div key={`${log}-${index}`} className="rounded border border-slate-700/70 bg-slate-950/60 px-3 py-2 text-sm text-slate-300">{log}</div>)}</div>
      </section>
    </div>
  );
}

function InfoBox({ label, value }) {
  return <div className="rounded border border-slate-700/70 bg-slate-950/60 px-3 py-2"><div className="hud-label">{label}</div><div className="hud-value mt-1">{value}</div></div>;
}

function GaugeRow({ label, value }) {
  return <div><div className="mb-1 flex items-center justify-between text-xs"><span className="hud-label">{label}</span><span className="hud-value">{Math.round(value)}%</span></div><div className={`hud-gauge ${gaugeTone(value)}`}><span className="hud-gauge-fill" style={{ width: `${value}%` }} /></div></div>;
}

function ResourceCard({ label, value }) {
  return <div className="grid min-w-24 place-items-center rounded border border-slate-700/70 bg-slate-950/60 px-3 py-3 text-center"><Archive size={18} className="text-cyan-200" /><div className="mt-2 font-bold text-slate-50">{value}</div><div className="mt-1 max-w-20 truncate text-xs text-slate-500">{label}</div></div>;
}
