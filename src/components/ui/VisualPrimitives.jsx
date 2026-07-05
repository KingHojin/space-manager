export function StatTile({ icon: Icon, label, value, tone = "text-cyan-200", className = "" }) {
  return (
    <div className={`rounded-2xl border border-slate-700/70 bg-slate-950/60 p-3 text-center ${className}`}>
      {Icon && <Icon size={18} className={`mx-auto ${tone}`} />}
      <div className="mt-2 text-lg font-black text-slate-50">{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}

export function GaugeBar({ label, value, toneClass = "" }) {
  const safeValue = Math.max(0, Math.min(100, Math.round(value ?? 0)));
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-slate-400">{label}</span>
        <span className="font-bold text-slate-100">{safeValue}%</span>
      </div>
      <div className={`hud-gauge ${toneClass}`}><span className="hud-gauge-fill" style={{ width: `${safeValue}%` }} /></div>
    </div>
  );
}

export function ActionCard({ icon, title, desc, badge = "지시", disabled = false, onClick }) {
  return (
    <button className="rounded-2xl border border-slate-700/70 bg-slate-950/65 p-3 text-left transition hover:-translate-y-0.5 hover:border-cyan-300 disabled:opacity-45" disabled={disabled} onClick={onClick}>
      <div className="flex items-center justify-between gap-2">
        <span className="grid h-10 w-10 place-items-center rounded-xl border border-cyan-300/25 bg-cyan-300/10 text-xl text-cyan-100">{icon}</span>
        <span className="hud-chip">{badge}</span>
      </div>
      <div className="mt-3 font-black text-slate-50">{title}</div>
      {desc && <div className="mt-1 text-xs text-slate-400">{desc}</div>}
    </button>
  );
}

export function FeedList({ entries = [], limit = 6, activeIcon = "●", idleIcon = "·" }) {
  return (
    <div className="grid gap-2">
      {entries.slice(0, limit).map((line, index) => (
        <div key={`${line}-${index}`} className="rounded-xl border border-slate-700/70 bg-slate-950/65 px-3 py-2 text-xs leading-5 text-slate-300">
          <span className="mr-2 text-cyan-200">{index === 0 ? activeIcon : idleIcon}</span>{line}
        </div>
      ))}
    </div>
  );
}
