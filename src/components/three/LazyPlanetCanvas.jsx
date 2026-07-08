import { Suspense, lazy } from "react";
import ChunkErrorBoundary, { ChunkErrorFallback } from "../common/ChunkErrorBoundary";

const PlanetCanvas = lazy(() => import("./PlanetCanvas"));

function PlanetCanvasFallback({ className = "" }) {
  return (
    <div className={`flex h-full w-full items-center justify-center rounded bg-slate-950/60 text-xs text-slate-500 ${className}`}>
      <span className="hud-chip">로딩 중...</span>
    </div>
  );
}

export default function LazyPlanetCanvas({ className = "", ...props }) {
  return (
    <ChunkErrorBoundary fallback={<ChunkErrorFallback className={className} />}>
      <Suspense fallback={<PlanetCanvasFallback className={className} />}>
        <PlanetCanvas className={className} {...props} />
      </Suspense>
    </ChunkErrorBoundary>
  );
}
