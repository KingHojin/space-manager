import { Suspense, lazy } from "react";
import ChunkErrorBoundary, { ChunkErrorFallback } from "../common/ChunkErrorBoundary";

const StarMap = lazy(() => import("./StarMap"));

function StarMapFallback() {
  return (
    <div className="starmap-bg relative flex h-[22rem] w-full items-center justify-center overflow-hidden rounded border border-slate-700/70 sm:h-[26rem] xl:h-[30rem]">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="hud-chip">3D 로딩 중...</div>
        <div className="hud-label">GALAXY SECTOR</div>
      </div>
    </div>
  );
}

function StarMapChunkErrorFallback() {
  return (
    <div className="starmap-bg relative flex h-[22rem] w-full items-center justify-center overflow-hidden rounded border border-slate-700/70 sm:h-[26rem] xl:h-[30rem]">
      <ChunkErrorFallback />
    </div>
  );
}

export default function LazyStarMap(props) {
  return (
    <ChunkErrorBoundary fallback={<StarMapChunkErrorFallback />}>
      <Suspense fallback={<StarMapFallback />}>
        <StarMap {...props} />
      </Suspense>
    </ChunkErrorBoundary>
  );
}
