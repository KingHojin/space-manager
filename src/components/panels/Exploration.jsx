import { Anchor, Bug, Cloud, DoorOpen, Fuel, Landmark, Pickaxe, Radar, Route, ScanLine, Skull, Zap } from "lucide-react";
import { getAllZones, getZoneById, sectors } from "../../data/sectors";
import { useExplorationStore } from "../../stores/explorationStore";
import { useGameStore } from "../../stores/gameStore";
import PlanetCanvas from "../three/PlanetCanvas";

const zoneIcons = {
  station: Anchor,
  nebula: Cloud,
  ruin: Landmark,
  anomaly: Zap,
  creature: Bug,
  mining: Pickaxe,
  gate: DoorOpen,
  wreck: Skull,
};

function dangerChipClass(danger) {
  if (danger >= 5) return "hud-chip-danger";
  if (danger >= 3) return "hud-chip-warn";
  return "";
}

const FUEL_PER_DISTANCE = 1.4;

export default function Exploration() {
  const zones = getAllZones();
  const sector = sectors[0];
  const { currentZoneId, selectedZoneId, discoveredZoneIds, scannedZoneIds, route, selectZone, moveToZone, scanZone } =
    useExplorationStore();
  const { resources, spendFuel, addLog } = useGameStore();
  const current = getZoneById(currentZoneId);
  const focused = getZoneById(selectedZoneId) ?? current;
  const isViewingCurrent = focused.id === current.id;
  const fuelCost = Math.round(focused.distance * FUEL_PER_DISTANCE);
  const canAffordMove = resources.fuel >= fuelCost;

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
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="hud-chip">
            탐사율 {discoveredZoneIds.length}/{zones.length}
          </span>
          <span className="hud-chip">스캔 {scannedZoneIds.length}</span>
          <span className="hud-chip hud-chip-accent">현재: {current.name}</span>
        </div>
        <div className="map-grid mt-4">
          {zones.map((zone) => {
            const discovered = discoveredZoneIds.includes(zone.id);
            const active = currentZoneId === zone.id;
            const selected = selectedZoneId === zone.id && !active;
            const Icon = zoneIcons[zone.type];
            return (
              <button
                key={zone.id}
                className={`zone-node ${active ? "zone-node-active" : ""} ${selected ? "zone-node-selected" : ""} ${!discovered ? "zone-node-hidden" : ""}`}
                onClick={() => handleSelect(zone)}
              >
                {discovered ? (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">{zone.name}</span>
                      {Icon && <Icon size={15} className="shrink-0 text-cyan-300" />}
                    </div>
                    <div className="flex items-center gap-2">
                      {active && <span className="hud-chip hud-chip-accent">현재 위치</span>}
                      <span className={`hud-chip ${dangerChipClass(zone.danger)}`}>위험 {zone.danger}</span>
                    </div>
                  </>
                ) : (
                  <>
                    <span className="font-semibold">미확인 구역</span>
                    <span className="text-xs text-slate-400">스캔 필요</span>
                  </>
                )}
              </button>
            );
          })}
        </div>
      </section>
      <aside className="space-y-4">
        <section>
          <div className="section-title">
            <ScanLine size={18} />
            구역 정보
          </div>
          <div className="mt-4 h-52 w-full overflow-hidden rounded border border-slate-700/70 bg-slate-950/60 sm:h-64">
            <PlanetCanvas zone={focused} interactive />
          </div>
          <div className="mt-4 space-y-3 text-sm">
            <Info label="구역명" value={focused.name} />
            <Info label="구역 타입" value={focused.type} />
            <Info label="위험도" value={`${focused.danger}성`} />
            <Info label="자원 풍부도" value={`${focused.richness}`} />
            {!isViewingCurrent && <Info label="이동 거리" value={`${focused.distance}`} />}
          </div>
          {isViewingCurrent ? (
            <button className="primary-button mt-4 w-full" onClick={handleScan}>
              현재 구역 스캔
            </button>
          ) : (
            <button className="primary-button mt-4 flex w-full items-center justify-center gap-2" onClick={handleSetCourse} disabled={!canAffordMove}>
              <Fuel size={16} />
              항로 설정 (연료 -{fuelCost}){!canAffordMove && " · 연료 부족"}
            </button>
          )}
        </section>
        <section>
          <div className="section-title">
            <Route size={18} />
            최근 이동 경로
          </div>
          <div className="mt-4 space-y-2">
            {route.map((zoneId) => (
              <div key={zoneId} className="rounded border border-slate-700/70 bg-slate-950/60 px-3 py-2 text-sm text-slate-300">
                {getZoneById(zoneId)?.name}
              </div>
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
      <span className="text-slate-500">{label}</span>
      <span className="font-semibold text-slate-100">{value}</span>
    </div>
  );
}
