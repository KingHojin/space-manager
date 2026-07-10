export function StatTile({ icon: Icon, label, value, tone = "text-blue-200", className = "" }) {
  return (
    <div className={`ui-stat-tile ${className}`}>
      {Icon && <span className={`ui-stat-icon ${tone}`}><Icon size={18} /></span>}
      <div className="ui-stat-value">{value}</div>
      <div className="ui-stat-label">{label}</div>
    </div>
  );
}

export function GaugeBar({ label, value, toneClass = "" }) {
  const safeValue = Math.max(0, Math.min(100, Math.round(value ?? 0)));
  return (
    <div className="ui-gauge-row">
      <div className="ui-gauge-meta">
        <span className="ui-gauge-label">{label}</span>
        <span className="ui-gauge-value">{safeValue}%</span>
      </div>
      <div className={`hud-gauge ${toneClass}`}><span className="hud-gauge-fill" style={{ width: `${safeValue}%` }} /></div>
    </div>
  );
}

export function ActionCard({ icon, title, desc, badge = "지시", disabled = false, onClick }) {
  return (
    <button className="ui-action-card" disabled={disabled} onClick={onClick}>
      <div className="flex items-start justify-between gap-2">
        <span className="ui-action-card-icon">{icon}</span>
        <span className="hud-chip">{badge}</span>
      </div>
      <div className="ui-action-card-title">{title}</div>
      {desc && <div className="ui-action-card-desc">{desc}</div>}
    </button>
  );
}

export function FeedList({ entries = [], limit = 6, activeIcon = "●", idleIcon = "·" }) {
  return (
    <div className="ui-feed-list">
      {entries.slice(0, limit).map((line, index) => (
        <div key={`${line}-${index}`} className="ui-feed-item">
          <span className="ui-feed-marker" aria-hidden="true" title={index === 0 ? activeIcon : idleIcon} />
          <span>{line}</span>
        </div>
      ))}
    </div>
  );
}
