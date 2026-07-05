import { Activity, Crosshair, Radar, Shield, Skull, Zap } from "lucide-react";

const toneClass = {
  cyan: "border-cyan-400/40 bg-cyan-400/10 text-cyan-100",
  red: "border-red-400/40 bg-red-400/10 text-red-100",
  amber: "border-amber-400/40 bg-amber-400/10 text-amber-100",
  emerald: "border-emerald-400/40 bg-emerald-400/10 text-emerald-100",
  violet: "border-violet-400/40 bg-violet-400/10 text-violet-100",
  slate: "border-slate-600 bg-slate-900/70 text-slate-100",
};

export default function BattleScene({
  mode = "combat",
  title = "전술 장면",
  leftName = "ISS 새벽항로",
  leftSub = "플레이어 함선",
  rightName = "미확인 대상",
  rightSub = "교전 대기",
  status = "standby",
  directive = "standby",
  eventLine = "함교가 다음 지시를 기다립니다.",
  leftStats = [],
  rightStats = [],
  intensity = 0,
  leftTone = "cyan",
  rightTone = "red",
}) {
  const pulseCount = Math.max(1, Math.min(5, Math.round(intensity / 20) || 1));
  const sceneLabel = mode === "hunting" ? "BIOFIELD VIEW" : "TACTICAL VIEW";

  return (
    <div className="overflow-hidden rounded border border-cyan-400/20 bg-slate-950/80">
      <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
        <div className="flex items-center gap-2">
          {mode === "hunting" ? <Radar size={17} className="text-emerald-300" /> : <Crosshair size={17} className="text-cyan-300" />}
          <div>
            <div className="hud-label">{sceneLabel}</div>
            <div className="font-bold text-slate-100">{title}</div>
          </div>
        </div>
        <span className={`hud-chip ${status === "won" || status === "success" ? "hud-chip-success" : status === "failed" ? "hud-chip-danger" : status === "engaged" ? "hud-chip-warn" : ""}`}>
          {status}
        </span>
      </div>

      <div className="relative grid min-h-64 grid-cols-[1fr_5rem_1fr] gap-2 p-4 sm:grid-cols-[1fr_8rem_1fr]">
        <SceneCard name={leftName} sub={leftSub} stats={leftStats} tone={leftTone} align="left" />

        <div className="relative flex flex-col items-center justify-center gap-3">
          <div className="absolute left-1/2 top-2 h-[calc(100%-1rem)] w-px -translate-x-1/2 bg-cyan-400/15" />
          <div className="z-10 grid h-12 w-12 place-items-center rounded-full border border-cyan-300/40 bg-cyan-400/10 text-cyan-100 shadow-[0_0_22px_rgb(34_211_238_/_0.22)]">
            {mode === "hunting" ? <Activity size={22} /> : <Zap size={22} />}
          </div>
          <div className="z-10 grid gap-1">
            {Array.from({ length: pulseCount }).map((_, index) => (
              <span key={index} className="block h-1.5 w-12 rounded-full bg-cyan-300/60 sm:w-20" style={{ opacity: 0.35 + index * 0.12 }} />
            ))}
          </div>
          <div className="z-10 rounded border border-slate-700 bg-slate-950/90 px-2 py-1 text-center text-[0.62rem] font-bold uppercase tracking-[0.18em] text-slate-400">
            {directive}
          </div>
        </div>

        <SceneCard name={rightName} sub={rightSub} stats={rightStats} tone={rightTone} align="right" />
      </div>

      <div className="border-t border-slate-800 bg-slate-950/70 px-4 py-3">
        <div className="hud-label">FM식 장면 중계</div>
        <div className="mt-1 text-sm leading-6 text-slate-300">{eventLine}</div>
      </div>
    </div>
  );
}

function SceneCard({ name, sub, stats, tone = "slate", align = "left" }) {
  return (
    <div className={`flex min-w-0 flex-col justify-between rounded border p-3 ${toneClass[tone] ?? toneClass.slate}`}>
      <div>
        <div className="flex items-center justify-between gap-2">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded border border-current/30 bg-slate-950/40">
            {align === "left" ? <Shield size={19} /> : <Skull size={19} />}
          </div>
          <span className="hud-chip bg-slate-950/40">{align === "left" ? "ALLY" : "TARGET"}</span>
        </div>
        <div className="mt-4 text-lg font-bold text-slate-50">{name}</div>
        <div className="mt-1 text-xs leading-5 text-slate-400">{sub}</div>
      </div>

      <div className="mt-4 grid gap-2">
        {stats.map((stat) => (
          <div key={stat.label}>
            <div className="mb-1 flex items-center justify-between gap-2 text-xs">
              <span className="hud-label">{stat.label}</span>
              <span className="hud-value">{stat.value}</span>
            </div>
            {stat.percent !== undefined && (
              <div className="hud-gauge">
                <span className="hud-gauge-fill" style={{ width: `${Math.max(0, Math.min(100, stat.percent))}%` }} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
