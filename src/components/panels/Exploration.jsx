import { Fuel, Radar, Rocket, Route, ScanLine } from "lucide-react";
import { MODULE_SLOTS, RESOURCES, SHIP_GRADES } from "../../data/constants";
import { getAllZones, getZoneById, sectors } from "../../data/sectors";
import { useExplorationStore } from "../../stores/explorationStore";
import { useGameStore } from "../../stores/gameStore";
import { useShipStore } from "../../stores/shipStore";
import StarMap from "../exploration/StarMap";
import PlanetCanvas from "../three/PlanetCanvas";

function dangerChipClass(danger) {
  if (danger >= 5) return "hud-chip-danger";
  if (danger >= 3) return "hud-chip-warn";
  return "";
}

function gaugeTone(value) {
  if (value < RESOURCES.LOW_RESOURCE_WARNING) return "hud-gauge-danger";
  if (value < 50) return "hud-gauge-warn";
  return "hud-gauge-success";
}

const RARITY_BORDER_CLASS = {
  common: "border-slate-500/50",
  uncommon: "border-emerald-400/50",
  rare: "border-sky-400/50",
  epic: "border-violet-400/50",
  legendary: "border-amber-300/60",
};

const FUEL_PER_DISTANCE = 1.4;

export default function Exploration() {
  const zones = getAllZones();
  const sector = sectors[0];
  const { currentZoneId, selectedZoneId, discoveredZoneIds, scannedZoneIds, route, selectZone, moveToZone, scanZone } =
    useExplorationStore();
  const { resources, spendFuel, addLog, shipName, shipGrade } = useGameStore();
  const { modules, installed } = useShipStore();
  const current = getZoneById(currentZoneId);
  const focused = getZoneById(selectedZoneId) ?? current;
  const isViewingCurrent = focused.id === current.id;
  const fuelCost = Math.round(focused.distance * FUEL_PER_DISTANCE);
  const canAffordMove = resources.fuel >= fuelCost;
  const grade = SHIP_GRADES[shipGrade];

  const handleSelect = (zone) => {
    if (!discoveredZoneIds.includes(zone.id)) return;
    selectZone(zone.id === currentZoneId ? null : zone.id);
  };

  const handleSetCourse = () => {
    spendFuel(fuelCost);
    moveToZone(focused.id);
    addLog(`${focused.name} 구역으로 이동했습니다. 연료 ${fuelCost} 소모.`);
    selectZone(null);
  };

  const handleScan = () => {
    scanZone(current.id);
    addLog(`${current.name} 스캔 완료. 구역 정보가 갱신되었습니다.`);
  };

  return (
    <div className="grid grid-cols-1 gap-4 xl:h-full xl:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)]">
      <section className="xl:overflow-y-auto">
        <div className="section-title">
          <Radar size={18} />
          {sector.name} 성계 지도
        </div>
        <div className="mt-3">
          <StarMap
            zones={zones}
            currentZoneId={currentZoneId}
            selectedZoneId={selectedZoneId}
            discoveredZoneIds={discoveredZoneIds}
            route={route}
            onSelect={handleSelect}
            sectorName={sector.name}
            exploredCount={discoveredZoneIds.length}
            totalCount={zones.length}
          />
        </div>
        <div className="hud-label mt-2">스캔 {scannedZoneIds.length}</div>
      </section>
      <aside className="space-y-4">
        <section>
          <div className="section-title">
            <ScanLine size={18} />
            구역 정보
          </div>
          <div className="mt-4 flex flex-col gap-4 sm:flex-row">
            <div className="h-40 w-40 shrink-0 overflow-hidden rounded border border-slate-700/70 bg-slate-950/60 sm:h-44 sm:w-44">
              <PlanetCanvas zone={focused} interactive />
            </div>
            <div className="flex min-w-0 flex-1 flex-col justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-2xl font-bold text-cyan-100">{focused.name}</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="hud-chip">{focused.type}</span>
                  <span className={`hud-chip ${dangerChipClass(focused.danger)}`}>위험 {focused.danger}</span>
                  <span className="hud-chip hud-chip-success">자원 {focused.richness}</span>
                </div>
              </div>
              <div className="space-y-2 text-sm">
                {isViewingCurrent ? (
                  <Info label="스캔 상태" value={scannedZoneIds.includes(current.id) ? "완료" : "미완료"} />
                ) : (
                  <>
                    <Info label="이동 거리" value={`${focused.distance}`} />
                    <Info label="예상 연료" value={`-${fuelCost}`} />
                  </>
                )}
              </div>
            </div>
          </div>
          {isViewingCurrent ? (
            <button className="primary-button mt-4 w-full" onClick={handleScan}>
              현재 구역 스캔
            </button>
          ) : (
            <button
              className="primary-button mt-4 flex w-full items-center justify-center gap-2"
              onClick={handleSetCourse}
              disabled={!canAffordMove}
            >
              <Fuel size={16} />
              항로 설정 (연료 -{fuelCost}){!canAffordMove && " · 연료 부족"}
            </button>
          )}
        </section>

        <section>
          <div className="section-title">
            <Rocket size={18} />
            함선 개요
          </div>
          <div className="mt-4 flex items-center justify-between gap-2">
            <div className="min-w-0 truncate text-lg font-bold text-slate-50">{shipName}</div>
            <span className="hud-chip hud-chip-accent shrink-0">
              {grade.icon} · {grade.label}
            </span>
          </div>
          <div className="mt-3 space-y-3">
            <GaugeRow label="선체" value={resources.hull} />
            <GaugeRow label="연료" value={resources.fuel} />
            <GaugeRow label="산소" value={resources.oxygen} />
          </div>
          <div className="hud-label mt-4">장착 모듈</div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {MODULE_SLOTS.map((slot) => {
              const module = modules.find((entry) => entry.id === installed[slot]);
              const borderClass = RARITY_BORDER_CLASS[module?.rarity] ?? RARITY_BORDER_CLASS.common;
              return (
                <div key={slot} className={`min-w-0 rounded border ${borderClass} bg-slate-950/60 p-2`}>
                  <div className="hud-label truncate">{slot}</div>
                  <div className="truncate text-xs font-semibold text-slate-100">{module?.name ?? "-"}</div>
                </div>
              );
            })}
          </div>
        </section>

        <section>
          <div className="section-title">
            <Route size={18} />
            최근 이동 경로
          </div>
          <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
            {route.map((zoneId, index) => (
              <span key={`${zoneId}-${index}`} className="hud-chip shrink-0">
                {getZoneById(zoneId)?.name}
              </span>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-500">스캔 완료 구역: {scannedZoneIds.length}</p>
        </section>
      </aside>
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
      <span className="hud-label">{label}</span>
      <span className="hud-value">{value}</span>
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
