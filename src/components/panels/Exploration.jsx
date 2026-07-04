import { Orbit, Radar, Route, ScanLine, Sun, Telescope } from "lucide-react";
import { getAllZones, getZoneById } from "../../data/sectors";
import { useExplorationStore } from "../../stores/explorationStore";
import { useGameStore } from "../../stores/gameStore";

const typeLabels = {
  station: "정거장",
  nebula: "성운",
  ruin: "폐허 행성",
  anomaly: "이상 현상",
  creature: "생태 행성",
  mining: "채굴 위성",
  gate: "관문",
  wreck: "난파 궤도",
};

const planetClasses = {
  station: "planet-station",
  nebula: "planet-nebula",
  ruin: "planet-ruin",
  anomaly: "planet-anomaly",
  creature: "planet-creature",
  mining: "planet-mining",
  gate: "planet-gate",
  wreck: "planet-wreck",
};

export default function Exploration() {
  const zones = getAllZones();
  const { currentZoneId, discoveredZoneIds, scannedZoneIds, route, moveToZone, scanZone } = useExplorationStore();
  const { spendFuel, addLog } = useGameStore();
  const current = getZoneById(currentZoneId);
  const currentType = typeLabels[current?.type] ?? current?.type;

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
    <div className="exploration-scene">
      <section className="planet-command-card">
        <div>
          <div className="flex flex-wrap items-end gap-3">
            <h3 className="text-3xl font-black text-white sm:text-4xl">{current?.name}</h3>
            <span className="text-xl font-bold text-slate-500 sm:text-2xl">행성/위성</span>
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            <span className="planet-pill">직접 관측</span>
            <span className="planet-pill">{currentType}</span>
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            <span className="planet-pill">위험 {current?.danger}성</span>
            <span className="planet-pill">자원 {current?.richness}</span>
            <span className="planet-pill">거리 {current?.distance} AU</span>
          </div>
        </div>
        <div className="grid gap-4 sm:min-w-72">
          <button className="planet-action" onClick={() => addLog(`${current?.name} 직접 관측 데이터를 수집했습니다.`)}>
            <Sun size={34} />
            <span>태양계<br />이동</span>
          </button>
          <button className="planet-action" onClick={() => handleScan(current)}>
            <Orbit size={34} />
            <span>지구계<br />이동</span>
          </button>
        </div>
      </section>

      <section className="planet-stage" aria-label="3D 행성 관측 화면">
        <div className="starfield-layer" />
        <div className="orbit-ring orbit-ring-one" />
        <div className="orbit-ring orbit-ring-two" />
        <div className={`rotating-planet ${planetClasses[current?.type] ?? "planet-station"}`}>
          <div className="planet-clouds" />
          <div className="planet-shadow" />
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
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
                  <span className="text-xs text-slate-400">{discovered ? `${typeLabels[zone.type] ?? zone.type} / 위험 ${zone.danger}` : "스캔 필요"}</span>
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
              <Info label="구역 타입" value={currentType} />
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
          <section>
            <div className="section-title">
              <Telescope size={18} />
              관측 노트
            </div>
            <p className="mt-3 text-sm text-slate-400">행성은 CSS 3D 레이어와 표면 텍스처 애니메이션으로 회전합니다. 구역 타입에 따라 표면 색상이 달라집니다.</p>
          </section>
        </aside>
      </div>
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
