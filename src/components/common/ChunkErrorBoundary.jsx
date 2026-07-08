import { Component } from "react";

// Wraps a lazy-loaded 3D chunk (StarMap/PlanetCanvas). Suspense alone only
// covers the "still loading" state — if the dynamic import() itself rejects
// (network failure, stale deployed chunk hash after a redeploy, etc.) React
// has no fallback UI for that and the whole tree above the lazy boundary
// unmounts with an uncaught error. This class boundary catches that specific
// failure and renders a same-sized HUD-style notice with a reload action
// instead of crashing the app. Scope is intentionally limited to the two 3D
// lazy wrappers (LazyStarMap/LazyPlanetCanvas) — a global app-level error
// boundary is a separate concern.
export default class ChunkErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    // eslint-disable-next-line no-console
    console.error("3D module chunk failed to load:", error);
  }

  render() {
    if (this.state.failed) {
      return this.props.fallback ?? <ChunkErrorFallback />;
    }
    return this.props.children;
  }
}

export function ChunkErrorFallback({ className = "" }) {
  return (
    <div className={`flex h-full min-h-40 w-full flex-col items-center justify-center gap-2 rounded border border-red-400/30 bg-slate-950/60 p-4 text-center ${className}`}>
      <span className="hud-chip hud-chip-danger">3D 모듈 로딩 실패</span>
      <p className="text-xs text-slate-400">3D 모듈을 불러오지 못했습니다 — 새로고침 해주세요.</p>
      <button type="button" className="secondary-button mt-1" onClick={() => window.location.reload()}>
        새로고침
      </button>
    </div>
  );
}
