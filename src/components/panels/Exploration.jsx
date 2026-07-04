import { Radar, Route, ScanLine } from "lucide-react";
import { getAllZones, getZoneById } from "../../data/sectors";
import { useExplorationStore } from "../../stores/explorationStore";
import { useGameStore } from "../../stores/gameStore";

export default function Exploration() {
  const zones = getAllZones();
  const { currentZoneId, discoveredZoneIds, scannedZoneIds, route, moveToZone, scanZone } = useExplorationStore();
  const { spendFuel, addLog } = useGameStore();
  const current = getZoneById(currentZoneId);

  const handleMove = (zone) => {
    if (!discoveredZoneIds.includes(zone.id)) return;
    spendFuel(zone.distance * 1.4);
    moveToZone(zone.id);
    addLog(`${zone.name} 구역으로 이동했습니다. 연료 ${Math.round(zone.distance * 1.4)} 소모.`);
  };

  const handleScan = (zone) => {
    scanZone(zone.id);
    addLog(`${zone.name} 스캔 완료. 구역 정보가 갱신되었습니다.`);
  };

  return (
    <div className="grid h-full grid-cols-[1.25fr_0.75fr] gap-4">
      <section>
        <div className="section-title">
          <Radar size={18} />
          헬리오스 외연 성계 지도
        </div>
        <div className="map-grid mt-4">
          {zones.map((zone) => {
            const discovered = discoveredZoneIds.includes(zone.id);
            const active = currentZoneId === zone.id;
            return (
              <button
                key={zone.id}
                className={`zone-node ${active ? "zone-node-active" : ""} ${!discovered ? "zone-node-hidden" : ""}`}
                onClick={() => handleMove(zone)}
              >
                <span className="font-semibold">{discovered ? zone.name : "미확인 구역"}</span>
                <span className="text-xs text-slate-400">{discovered ? `${zone.type} / 위험 ${zone.danger}` : "스캔 필요"}</span>
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
          <div className="mt-4 space-y-3 text-sm">
            <Info label="현재 위치" value={current?.name} />
            <Info label="구역 타입" value={current?.type} />
            <Info label="위험도" value={`${current?.danger}성`} />
            <Info label="자원 풍부도" value={`${current?.richness}`} />
          </div>
          <button className="primary-button mt-4 w-full" onClick={() => handleScan(current)}>
            현재 구역 스캔
          </button>
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
