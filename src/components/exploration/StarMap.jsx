import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Html, Line, OrbitControls, Stars } from "@react-three/drei";
import { formatGameDate } from "../../systems/gameClock";

const DANGER_TONES = {
  low: { solid: "#38bdf8", glow: "rgb(56 189 248 / 0.6)", bg20: "rgb(56 189 248 / 0.2)" },
  mid: { solid: "#fbbf24", glow: "rgb(251 191 36 / 0.6)", bg20: "rgb(251 191 36 / 0.2)" },
  high: { solid: "#f87171", glow: "rgb(248 113 113 / 0.6)", bg20: "rgb(248 113 113 / 0.2)" },
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function useCoarsePointer() {
  const [coarse, setCoarse] = useState(false);

  useEffect(() => {
    const query = window.matchMedia?.("(pointer: coarse)");
    if (!query) return undefined;
    const sync = () => setCoarse(query.matches);
    sync();
    query.addEventListener?.("change", sync);
    return () => query.removeEventListener?.("change", sync);
  }, []);

  return coarse;
}

function dangerTone(danger) {
  if (danger >= 5) return DANGER_TONES.high;
  if (danger >= 3) return DANGER_TONES.mid;
  return DANGER_TONES.low;
}

function positionFromZone(zone) {
  const x = ((zone.pos?.x ?? 50) - 50) / 8;
  const z = ((zone.pos?.y ?? 50) - 50) / 8;
  const y = Math.sin((zone.distance ?? 0) * 0.8) * 0.45 + ((zone.richness ?? 1) - 3) * 0.08;
  return [x, y, z];
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function travelProgress(activeTravel, currentMinute) {
  if (!activeTravel) return 0;
  return clamp(((currentMinute - activeTravel.startedAt) / Math.max(1, activeTravel.duration)) * 100, 0, 100);
}

function TravelShip({ fromZone, toZone, progress }) {
  const ref = useRef(null);
  const start = positionFromZone(fromZone);
  const end = positionFromZone(toZone);
  const t = clamp(progress / 100, 0, 1);
  const position = [lerp(start[0], end[0], t), lerp(start[1], end[1], t) + 0.24, lerp(start[2], end[2], t)];
  const heading = Math.atan2(end[0] - start[0], end[2] - start[2]);

  useFrame((state) => {
    if (!ref.current) return;
    ref.current.position.y = Math.sin(state.clock.elapsedTime * 5) * 0.04;
    ref.current.rotation.z = Math.sin(state.clock.elapsedTime * 3) * 0.08;
  });

  return (
    <group position={position} rotation={[0, heading, 0]}>
      <group ref={ref}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <coneGeometry args={[0.13, 0.34, 4]} />
          <meshStandardMaterial color="#facc15" emissive="#facc15" emissiveIntensity={1.4} roughness={0.25} />
        </mesh>
        <mesh position={[0, -0.02, -0.24]}>
          <sphereGeometry args={[0.055, 12, 12]} />
          <meshBasicMaterial color="#22d3ee" transparent opacity={0.8} />
        </mesh>
      </group>
      <Html distanceFactor={7} center position={[0, 0.42, 0]}>
        <div className="pointer-events-none rounded border border-amber-300/50 bg-slate-950/85 px-2 py-1 text-[0.62rem] font-semibold text-amber-100 shadow-lg backdrop-blur">
          항해 {Math.round(progress)}%
        </div>
      </Html>
    </group>
  );
}

function StarNode({ zone, discovered, current, selected, onSelect }) {
  const ref = useRef(null);
  const tone = dangerTone(zone.danger);
  const position = positionFromZone(zone);
  const radius = current ? 0.17 : selected ? 0.15 : 0.11;

  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.y += delta * (current ? 1.6 : 0.55);
  });

  if (!discovered) {
    return (
      <group position={position}>
        <mesh>
          <sphereGeometry args={[0.045, 12, 12]} />
          <meshBasicMaterial color="#475569" transparent opacity={0.55} />
        </mesh>
        <Html distanceFactor={8} center>
          <div className="pointer-events-none select-none rounded border border-slate-700/60 bg-slate-950/80 px-1.5 py-0.5 text-[0.6rem] text-slate-500">?</div>
        </Html>
      </group>
    );
  }

  return (
    <group position={position}>
      <mesh ref={ref} onClick={() => onSelect(zone)}>
        <sphereGeometry args={[radius, 24, 24]} />
        <meshStandardMaterial color={tone.solid} emissive={tone.solid} emissiveIntensity={current ? 1.7 : 0.8} roughness={0.4} />
      </mesh>
      {(current || selected) && (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.28, 0.31, 42]} />
          <meshBasicMaterial color={current ? "#fbbf24" : "#67e8f9"} transparent opacity={0.72} side={2} />
        </mesh>
      )}
      <Html distanceFactor={7.5} center>
        <button
          type="button"
          onClick={() => onSelect(zone)}
          className={`min-w-20 rounded border px-2 py-1 text-left text-[0.65rem] shadow-lg backdrop-blur ${current ? "border-amber-300/60 bg-amber-300/15 text-amber-100" : selected ? "border-cyan-300/70 bg-cyan-300/15 text-cyan-100" : "border-slate-600/70 bg-slate-950/75 text-slate-100"}`}
        >
          <div className="truncate font-semibold">{zone.name}</div>
          <div className="mt-0.5 flex gap-1 text-[0.55rem] text-slate-400">
            <span>위험 {zone.danger}</span>
            <span>자원 {zone.richness}</span>
          </div>
        </button>
      </Html>
    </group>
  );
}

function GridPlane() {
  const lines = [];
  for (let i = -6; i <= 6; i += 1) {
    lines.push(
      <Line key={`x-${i}`} points={[[-6, -0.55, i], [6, -0.55, i]]} color="#164e63" transparent opacity={0.25} lineWidth={0.5} />,
      <Line key={`z-${i}`} points={[[i, -0.55, -6], [i, -0.55, 6]]} color="#164e63" transparent opacity={0.25} lineWidth={0.5} />,
    );
  }
  return <group>{lines}</group>;
}

export default function StarMap({
  zones,
  currentZoneId,
  selectedZoneId,
  discoveredZoneIds,
  route,
  activeTravel,
  currentMinute,
  onSelect,
  sectorName,
  exploredCount,
  totalCount,
}) {
  const isMobileTouch = useCoarsePointer();
  const current = zones.find((zone) => zone.id === currentZoneId);
  const travelFrom = activeTravel ? zones.find((zone) => zone.id === activeTravel.fromZoneId) : null;
  const travelTo = activeTravel ? zones.find((zone) => zone.id === activeTravel.toZoneId) : null;
  const progress = travelProgress(activeTravel, currentMinute);
  const routeZones = route.map((zoneId) => zones.find((zone) => zone.id === zoneId)).filter((zone) => zone?.pos);
  const explorationRatio = totalCount > 0 ? (exploredCount / totalCount) * 100 : 0;
  const routePoints = routeZones.map(positionFromZone);
  const travelPoints = travelFrom && travelTo ? [positionFromZone(travelFrom), positionFromZone(travelTo)] : [];
  const discoveredSet = useMemo(() => new Set(discoveredZoneIds), [discoveredZoneIds]);

  return (
    <div className="starmap-bg relative h-[22rem] w-full overflow-hidden rounded border border-slate-700/70 sm:h-[26rem] xl:h-[30rem]">
      <Canvas
        dpr={[1, 2]}
        camera={{ position: [0, 5.4, 7.8], fov: 48 }}
        gl={{ antialias: true }}
        style={{ touchAction: isMobileTouch ? "pan-y" : "none" }}
      >
        <ambientLight intensity={0.35} />
        <pointLight position={[4, 6, 4]} intensity={1.35} />
        <Stars radius={70} depth={35} count={1200} factor={2.2} fade speed={0.4} />
        <GridPlane />
        {current?.pos && (
          <mesh position={positionFromZone(current)} rotation={[Math.PI / 2, 0, 0]}>
            <ringGeometry args={[1.1, 1.13, 64]} />
            <meshBasicMaterial color="#38bdf8" transparent opacity={0.18} side={2} />
          </mesh>
        )}
        {routePoints.length >= 2 && <Line points={routePoints} color="#38bdf8" lineWidth={2} transparent opacity={0.65} dashed dashSize={0.25} gapSize={0.16} />}
        {travelPoints.length === 2 && <Line points={travelPoints} color="#facc15" lineWidth={3} transparent opacity={0.88} dashed dashSize={0.32} gapSize={0.12} />}
        {travelFrom && travelTo && <TravelShip fromZone={travelFrom} toZone={travelTo} progress={progress} />}
        {zones.map((zone) => (
          <StarNode
            key={zone.id}
            zone={zone}
            discovered={discoveredSet.has(zone.id)}
            current={zone.id === currentZoneId}
            selected={selectedZoneId === zone.id && zone.id !== currentZoneId}
            onSelect={onSelect}
          />
        ))}
        <OrbitControls
          enabled={!isMobileTouch}
          enablePan={false}
          enableZoom={!isMobileTouch}
          enableRotate={!isMobileTouch}
          minDistance={5.5}
          maxDistance={11}
          maxPolarAngle={Math.PI / 2.05}
        />
      </Canvas>

      <div className="pointer-events-none absolute left-3 top-3 rounded border border-slate-700/70 bg-slate-950/70 p-3 backdrop-blur">
        <div className="hud-label">3D GALAXY SECTOR</div>
        <div className="font-bold text-slate-100">{sectorName}</div>
        <div className="mt-2 w-28">
          <div className="hud-gauge"><span className="hud-gauge-fill" style={{ width: `${explorationRatio}%` }} /></div>
        </div>
        <div className="mt-1 text-[0.65rem] text-slate-400">{exploredCount}/{totalCount} discovered</div>
      </div>

      {isMobileTouch && (
        <div className="pointer-events-none absolute bottom-3 left-3 max-w-[11rem] rounded border border-slate-700/70 bg-slate-950/75 px-3 py-2 backdrop-blur">
          <div className="hud-label">모바일 스크롤 우선</div>
          <div className="text-[0.65rem] text-slate-400">성계 선택은 라벨 탭, 회전은 PC에서 사용</div>
        </div>
      )}

      {activeTravel && (
        <div className="pointer-events-none absolute bottom-3 right-3 rounded border border-amber-300/40 bg-slate-950/80 px-3 py-2 text-right backdrop-blur">
          <div className="hud-label">항해 중</div>
          <div className="text-xs font-semibold text-amber-100">{travelFrom?.name} → {travelTo?.name}</div>
          <div className="mt-1 text-[0.65rem] text-slate-400">도착 {formatGameDate(activeTravel.completeAt)}</div>
        </div>
      )}
    </div>
  );
}
