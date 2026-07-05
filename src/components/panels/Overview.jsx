import { Activity, Compass, Crosshair, Package, PawPrint, Rocket, Sparkles, Store, Users } from "lucide-react";
import { RESOURCES } from "../../data/constants";
import { getZoneById } from "../../data/sectors";
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

const quickTiles = [
  { id: "combat", label: "전투", desc: "전술 상황 확인", icon: Crosshair },
  { id: "hunting", label: "사냥", desc: "생물체 포획", icon: PawPrint },
  { id: "collector", label: "우주 집진기", desc: "자원 자동 수집", icon: Sparkles },
  { id: "market", label: "시장", desc: "거래 & 환전", icon: Store },
];

export default function Overview({ onNavigate }) {
  const currentZoneId = useExplorationStore((state) => state.currentZoneId);
  const zone = getZoneById(currentZoneId);
  const shipName = useGameStore((state) => state.shipName);
  const resources = useGameStore((state) => state.resources);
  const logs = useGameStore((state) => state.logs);
  const dust = useInventoryStore((state) => state.dust);
  const items = useInventoryStore((state) => state.items);
  const cards = useInventoryStore((state) => state.cards);
  const crew = useCrewStore((state) => state.crew);

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
              <div>
                <div className="font-semibold text-slate-100">{member.name}</div>
                <div className="text-xs text-slate-500">
                  {member.role} · 사기 {member.morale}
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
                className="flex flex-col items-start gap-2 rounded border border-slate-700/70 bg-slate-950/60 p-4 text-left hover:border-cyan-400/60"
                onClick={() => onNavigate?.(tile.id)}
              >
                <Icon size={20} className="text-cyan-300" />
                <div className="font-semibold text-slate-100">{tile.label}</div>
                <div className="text-xs text-slate-500">{tile.desc}</div>
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
