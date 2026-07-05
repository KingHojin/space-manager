import { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Stars } from "@react-three/drei";
import { getPlanetVisual } from "../../data/planets";

function Planet({ zone }) {
  const meshRef = useRef(null);
  const visual = getPlanetVisual(zone);

  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += 0.15 * delta;
    }
  });

  return (
    <group>
      <mesh ref={meshRef} rotation={[0.3, 0, 0]}>
        <sphereGeometry args={[1.2 * visual.size, 32, 32]} />
        <meshStandardMaterial
          color={visual.baseColor}
          emissive={visual.emissiveColor}
          emissiveIntensity={visual.emissiveIntensity}
          roughness={visual.roughness}
          metalness={visual.metalness}
        />
      </mesh>
      {visual.hasRing && (
        <mesh rotation={[Math.PI / 2.2, 0, 0]}>
          <ringGeometry args={[1.6 * visual.size, 2.1 * visual.size, 48]} />
          <meshBasicMaterial color={visual.emissiveColor} transparent opacity={0.45} side={2} />
        </mesh>
      )}
    </group>
  );
}

export default function PlanetCanvas({ zone, interactive = true, className = "" }) {
  if (!zone) {
    return (
      <div className={`flex h-full w-full items-center justify-center text-xs text-slate-500 ${className}`}>
        행성 데이터 없음
      </div>
    );
  }

  return (
    <div className={`h-full w-full ${className}`}>
      <Canvas dpr={[1, 2]} gl={{ antialias: true }} camera={{ position: [0, 0, 4.5], fov: 45 }}>
        <ambientLight intensity={0.5} />
        <pointLight position={[5, 3, 5]} intensity={1.2} />
        <Stars radius={80} depth={40} count={1000} factor={2} fade />
        <Planet zone={zone} />
        {interactive && <OrbitControls enableZoom={false} enablePan={false} />}
      </Canvas>
    </div>
  );
}
