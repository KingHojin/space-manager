const DANGER_TONES = {
  low: { solid: "#38bdf8", glow: "rgb(56 189 248 / 0.6)", bg20: "rgb(56 189 248 / 0.2)" },
  mid: { solid: "#fbbf24", glow: "rgb(251 191 36 / 0.6)", bg20: "rgb(251 191 36 / 0.2)" },
  high: { solid: "#f87171", glow: "rgb(248 113 113 / 0.6)", bg20: "rgb(248 113 113 / 0.2)" },
};

function dangerTone(danger) {
  if (danger >= 5) return DANGER_TONES.high;
  if (danger >= 3) return DANGER_TONES.mid;
  return DANGER_TONES.low;
}

const BOUNDARY_POINTS = "10,50 30,14 62,10 92,22 94,66 70,84 30,86 8,72";

export default function StarMap({
  zones,
  currentZoneId,
  selectedZoneId,
  discoveredZoneIds,
  route,
  onSelect,
  sectorName,
  exploredCount,
  totalCount,
}) {
  const current = zones.find((zone) => zone.id === currentZoneId);
  const routeZones = route.map((zoneId) => zones.find((zone) => zone.id === zoneId)).filter((zone) => zone?.pos);
  const explorationRatio = totalCount > 0 ? (exploredCount / totalCount) * 100 : 0;

  return (
    <div className="starmap-bg relative h-[22rem] w-full overflow-hidden rounded border border-slate-700/70 sm:h-[26rem] xl:h-[30rem]">
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        <polygon
          points={BOUNDARY_POINTS}
          fill="rgb(56 189 248 / 0.03)"
          stroke="rgb(56 189 248 / 0.18)"
          strokeDasharray="1.5 1.5"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
        {routeZones.length >= 2 && (
          <polyline
            points={routeZones.map((zone) => `${zone.pos.x},${zone.pos.y}`).join(" ")}
            fill="none"
            stroke="#38bdf8"
            strokeOpacity="0.55"
            strokeWidth="1.5"
            strokeDasharray="4 4"
            vectorEffect="non-scaling-stroke"
          />
        )}
        {current?.pos && (
          <circle
            cx={current.pos.x}
            cy={current.pos.y}
            r="14"
            fill="rgb(56 189 248 / 0.04)"
            stroke="rgb(56 189 248 / 0.25)"
            strokeDasharray="2 3"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>

      <div className="pointer-events-none absolute left-3 top-3">
        <div className="hud-label">GALAXY SECTOR</div>
        <div className="font-bold text-slate-100">{sectorName}</div>
        <div className="mt-1 w-24">
          <div className="hud-gauge">
            <span className="hud-gauge-fill" style={{ width: `${explorationRatio}%` }} />
          </div>
        </div>
        <div className="mt-0.5 text-[0.65rem] text-slate-400">
          {exploredCount}/{totalCount}
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-3 right-3 hud-label">스캐너 범위 15 LY</div>

      <div className="pointer-events-none absolute left-[8%] top-[38%] select-none text-xl font-bold tracking-[0.3em] text-slate-500/25">
        {sectorName}
      </div>

      <div className="absolute inset-0">
        {zones.map((zone) => {
          if (!zone.pos) return null;
          const discovered = discoveredZoneIds.includes(zone.id);
          const isCurrent = zone.id === currentZoneId;
          const isSelected = selectedZoneId === zone.id && !isCurrent;
          const tone = dangerTone(zone.danger);

          return (
            <div
              key={zone.id}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${zone.pos.x}%`, top: `${zone.pos.y}%` }}
            >
              {discovered ? (
                <button
                  type="button"
                  title={zone.name}
                  onClick={() => onSelect(zone)}
                  className="flex flex-col items-center gap-0.5 p-1"
                  style={{ minWidth: 28, minHeight: 28 }}
                >
                  <div className="relative flex h-12 w-12 items-center justify-center">
                    {isCurrent && (
                      <>
                        <span className="absolute h-12 w-12 rounded-full border border-amber-300/30" />
                        <span
                          className="absolute h-[30px] w-[30px] rounded-full border border-dashed border-amber-300/70"
                          style={{ animation: "starmap-spin 12s linear infinite" }}
                        />
                      </>
                    )}
                    {isSelected && (
                      <span
                        className="absolute h-[26px] w-[26px] rounded-full border border-cyan-300/80"
                        style={{ boxShadow: "0 0 10px 2px rgb(103 232 249 / 0.35)" }}
                      />
                    )}
                    <span
                      className="relative z-10 h-[10px] w-[10px] rounded-full"
                      style={{ background: tone.solid, boxShadow: `0 0 8px 2px ${tone.glow}` }}
                    />
                  </div>
                  <span className="flex items-center gap-1">
                    <span
                      className="text-[0.7rem] font-semibold text-slate-100"
                      style={{ textShadow: "0 1px 4px rgb(0 0 0 / 0.9)" }}
                    >
                      {zone.name}
                    </span>
                    {zone.danger >= 3 && (
                      <span
                        className="h-2 w-2 rotate-45"
                        style={{ border: `1px solid ${tone.solid}`, background: tone.bg20 }}
                      />
                    )}
                  </span>
                  {isCurrent && <span className="hud-chip hud-chip-accent">현재 위치</span>}
                </button>
              ) : (
                <div
                  className="flex flex-col items-center justify-center gap-0.5 p-1"
                  style={{ minWidth: 28, minHeight: 28 }}
                  title="미확인 구역"
                >
                  <span className="h-[6px] w-[6px] rounded-full bg-slate-600/50" />
                  <span className="text-[0.6rem] text-slate-600">?</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
