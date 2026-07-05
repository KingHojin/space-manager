import {
  Activity,
  Compass,
  Cross,
  Crosshair,
  Package,
  PawPrint,
  Rocket,
  Sparkles,
  Store,
  User,
  Users,
  Wrench,
} from "lucide-react";
import { DUST, RESOURCES } from "../../data/constants";
import { creatures } from "../../data/creatures";
import { getAllZones, getZoneById } from "../../data/sectors";
import { useCrewStore } from "../../stores/crewStore";
import { useExplorationStore } from "../../stores/explorationStore";
import { useGameStore } from "../../stores/gameStore";
import { useInventoryStore } from "../../stores/inventoryStore";
import PlanetCanvas from "../three/PlanetCanvas";
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
  const config = ROLE_ICONS[role] ?? { icon: User, color: "text-slate-500" };
  const Icon = config.icon;
  return <Icon size={size} className={config.color} />;
}

const quickTiles = [
  {
    id: "combat",
    label: "전투",
    desc: "전술 상황 확인",
    icon: Crosshair,
    border: "border-red-500/40 hover:border-red-400/70",
    iconColor: "text-red-400",
  },
  {
    id: "hunting",
    label: "사냥",
    desc: "생물체 포획",
    icon: PawPrint,
    border: "border-emerald-500/40 hover:border-emerald-400/70",
    iconColor: "text-emerald-400",
  },
  {
    id: "collector",
    label: "우주 집진기",
    desc: "자원 자동 수집",
    icon: Sparkles,
    border: "border-violet-500/40 hover:border-violet-400/70",
    iconColor: "text-violet-400",
  },
  {
    id: "market",
    label: "시장",
    desc: "거래 & 환전",
    icon: Store,
    border: "border-amber-500/40 hover:border-amber-400/70",
    iconColor: "text-amber-400",
  },
];

export default function Overview({ onNavigate }) {
  const currentZoneId = useExplorationStore((state) => state.currentZoneId);
  const discoveredZoneIds = useExplorationStore((state) => state.discoveredZoneIds);
  const zone = getZoneById(currentZoneId);
  const shipName = useGameStore((state) => state.shipName);
  const resources = useGameStore((state) => state.resources);
  const logs = useGameStore((state) => state.logs);
  const dust = useInventoryStore((state) => state.dust);
  const items = useInventoryStore((state) => state.items);
  const cards = useInventoryStore((state) => state.cards);
  const crew = useCrewStore((state) => state.crew);
  const dangerZoneCount = getAllZones().filter(
    (z) => discoveredZoneIds.includes(z.id) && z.danger >= 4,
  ).length;

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <section className="xl:col-span-2">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,14rem)_1fr]">
          <div className="h-40 overflow-hidden rounded border border-slate-700/70 bg-slate-950/60 sm:h-auto">
            <PlanetCanvas zone={zone} interactive={false} />
          </div>
          <div className="flex flex-col justify-between gap-3">
            <div>
              <div className="hud-label">현재 위치</div>
              <div className="text-2xl font-bold text-slate-50">{zone?.name ?? "알 수 없음"}</div>
              <div className="mt-2 flex flex-wrap gap-2">
                <span className="hud-chip">{zone?.type}</span>
                <span className="hud-chip hud-chip-warn">위험 {zone?.danger}</span>
                <span className="hud-chip hud-chip-success">자원 {zone?.richness}</span>
              </div>
            </div>
            <button className="primary-button self-start" onClick={() => onNavigate?.("exploration")}>
              탐험 열기
            </button>
          </div>
        </div>
      </section>

      <section>
        <div className="section-title">
          <Rocket size={18} />
          함선 상태
        </div>
        <div className="mt-4 text-lg font-bold text-slate-50">{shipName}</div>
        <div className="mt-3 space-y-3">
          <GaugeRow label="선체" value={resources.hull} />
          <GaugeRow label="연료" value={resources.fuel} />
          <GaugeRow label="산소" value={resources.oxygen} />
        </div>
        <button className="secondary-button mt-4 w-full" onClick={() => onNavigate?.("ship")}>
          함선 관리
        </button>
      </section>

      <section>
        <div className="section-title">
          <Users size={18} />
          승무원 {crew.length}명
        </div>
        <div className="mt-4 space-y-2">
          {crew.map((member) => (
            <div
              key={member.id}
              className="flex items-center justify-between rounded border border-slate-700/70 bg-slate-950/60 px-3 py-2 text-sm"
            >
              <div className="flex min-w-0 items-center gap-2">
                <RoleIcon role={member.role} />
                <div className="min-w-0">
                  <div className="truncate font-semibold text-slate-100">{member.name}</div>
                  <div className="text-xs text-slate-500">
                    {member.role} · 사기 {member.morale}
                  </div>
                </div>
              </div>
              <span className={`hud-chip ${member.injury === "정상" ? "hud-chip-success" : "hud-chip-danger"}`}>
                {member.injury}
              </span>
            </div>
          ))}
        </div>
        <button className="secondary-button mt-4 w-full" onClick={() => onNavigate?.("crew")}>
          승무원 관리
        </button>
      </section>

      <section>
        <div className="section-title">
          <Activity size={18} />
          진행 중 임무
        </div>
        <ul className="mt-4 space-y-3 text-sm text-slate-300">
          <li>청색 표류대의 잔류 신호 분석</li>
          <li>우주 먼지 100 수집 후 카드 뽑기</li>
          <li>숨겨진 구역 1곳 스캔</li>
        </ul>
      </section>

      <section className="xl:col-span-2">
        <div className="section-title">
          <Compass size={18} />
          바로가기
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
          {quickTiles.map((tile) => {
            const Icon = tile.icon;
            return (
              <button
                key={tile.id}
                className={`relative flex flex-col items-start gap-2 rounded border bg-slate-950/60 p-4 text-left ${tile.border}`}
                onClick={() => onNavigate?.(tile.id)}
              >
                {tile.id === "combat" && dangerZoneCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[0.6rem] font-bold leading-none text-white">
                    {dangerZoneCount}
                  </span>
                )}
                {tile.id === "collector" && dust >= DUST.SINGLE_DRAW_COST && (
                  <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-emerald-400" />
                )}
                <Icon size={20} className={tile.iconColor} />
                <div className="font-semibold text-slate-100">{tile.label}</div>
                <div className="text-xs text-slate-500">{tile.desc}</div>
                {tile.id === "hunting" && <span className="hud-chip mt-1">{creatures.length}종 서식</span>}
              </button>
            );
          })}
        </div>
      </section>

      <section className="xl:col-span-2">
        <div className="section-title">
          <Package size={18} />
          보유 자원
        </div>
        <div className="mt-4 flex gap-3 overflow-x-auto pb-1">
          <ResourceChip label="크레딧" value={`₢ ${number(resources.credits)}`} />
          <ResourceChip label="우주 먼지" value={number(dust, 1)} />
          <ResourceChip label="보유 아이템" value={`${items.length}종`} />
          <ResourceChip label="보유 카드" value={`${cards.length}장`} />
        </div>
      </section>

      <section className="xl:col-span-2">
        <div className="section-title">
          <Sparkles size={18} />
          최근 이벤트
        </div>
        <div className="mt-4 grid gap-2">
          {logs.slice(0, 5).map((log, index) => (
            <div key={`${log}-${index}`} className="rounded border border-slate-700/70 bg-slate-950/60 px-3 py-2 text-sm text-slate-300">
              {log}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function GaugeRow({ label, value }) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="hud-label">{label}</span>
        <span className="hud-value">{Math.round(value)}%</span>
      </div>
      <div className={`hud-gauge mt-1 ${gaugeTone(value)}`}>
        <span className="hud-gauge-fill" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function ResourceChip({ label, value }) {
  return (
    <div className="min-w-[7rem] shrink-0 rounded border border-slate-700/70 bg-slate-950/60 px-3 py-2">
      <div className="hud-label">{label}</div>
      <div className="hud-value mt-1 text-sm">{value}</div>
    </div>
  );
}
