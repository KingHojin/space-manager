import { Suspense, lazy } from "react";

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

export default function LazyStarMap(props) {
  return (
    <Suspense fallback={<StarMapFallback />}>
      <StarMap {...props} />
    </Suspense>
  );
}
