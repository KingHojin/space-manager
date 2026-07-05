import { AlertTriangle, Bell, Pause, Play, SkipForward } from "lucide-react";
import { RESOURCES, SHIP_GRADES } from "../../data/constants";
import { useGameStore } from "../../stores/gameStore";
import { formatGameDate } from "../../systems/gameClock";
import { number, percent } from "../../utils/format";

function gaugeTone(value) {
  if (value < RESOURCES.LOW_RESOURCE_WARNING) return "hud-gauge-danger";
  if (value < 50) return "hud-gauge-warn";
  return "hud-gauge-success";
}

export default function Header() {
  const { shipName, shipGrade, currentMinute, resources, isPaused, speed, togglePause, cycleSpeed } = useGameStore();
  const grade = SHIP_GRADES[shipGrade];
  const date = formatGameDate(currentMinute);
  const warningCount = [resources.fuel, resources.oxygen, resources.hull].filter(
    (value) => value < RESOURCES.LOW_RESOURCE_WARNING,
  ).length;

  return (
    <header className="border-b border-slate-700/80 bg-slate-950 px-4 py-3 lg:px-5 lg:py-0">
      <div className="flex flex-col gap-3 lg:h-16 lg:flex-row lg:items-center lg:gap-0 lg:divide-x lg:divide-slate-700/60">
        <div className="flex items-center justify-between gap-3 lg:justify-start lg:pr-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded border border-cyan-400/50 bg-cyan-400/10 text-sm font-bold text-cyan-100">
              {grade.icon}
            </div>
            <div className="min-w-0">
              <div className="hud-label">{grade.label}급 탐사선</div>
              <h1 className="truncate text-lg font-bold text-slate-50">{shipName}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2 lg:hidden">
            {warningCount > 0 && (
              <span className="hud-chip hud-chip-danger">
                <AlertTriangle size={12} />
                {warningCount}
              </span>
            )}
            <button className="icon-button" onClick={togglePause} title={isPaused ? "재생" : "일시정지"}>
              {isPaused ? <Play size={18} /> : <Pause size={18} />}
            </button>
            <button className="icon-button gap-1" onClick={cycleSpeed} title="배속 변경">
              <SkipForward size={16} />
              <span className="text-xs">{speed}x</span>
            </button>
          </div>
        </div>

        <div className="hud-label lg:hidden">STARDATE · {date}</div>

        <div className="hidden items-center gap-4 lg:flex lg:px-5">
          <div>
            <div className="hud-label">STARDATE</div>
            <div className="font-mono text-sm tabular-nums text-cyan-100">{date}</div>
          </div>
          <button className="icon-button" onClick={togglePause} title={isPaused ? "재생" : "일시정지"}>
            {isPaused ? <Play size={18} /> : <Pause size={18} />}
          </button>
          <button className="icon-button min-w-16 gap-1" onClick={cycleSpeed} title="배속 변경">
            <SkipForward size={16} />
            <span className="text-xs">{speed}x</span>
          </button>
        </div>

        <div className="grid grid-cols-4 gap-3 lg:flex lg:flex-1 lg:items-center lg:justify-end lg:gap-5 lg:pl-5">
          <Resource label="크레딧" value={`₢ ${number(resources.credits)}`} />
          <Resource label="연료" value={percent(resources.fuel)} gaugeValue={resources.fuel} gaugeTone={gaugeTone(resources.fuel)} />
          <Resource label="산소" value={percent(resources.oxygen)} gaugeValue={resources.oxygen} gaugeTone={gaugeTone(resources.oxygen)} />
          <Resource label="선체" value={percent(resources.hull)} gaugeValue={resources.hull} gaugeTone={gaugeTone(resources.hull)} />
        </div>

        <div className="hidden lg:flex lg:items-center lg:gap-3 lg:pl-5">
          <button className="icon-button relative" title="알림">
            <Bell size={18} />
            {warningCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[0.6rem] font-bold leading-none text-white">
                {warningCount}
              </span>
            )}
          </button>
          {warningCount > 0 && (
            <span className="hud-chip hud-chip-danger">
              <AlertTriangle size={12} />
              경고 {warningCount}
            </span>
          )}
        </div>
      </div>
    </header>
  );
}

function Resource({ label, value, gaugeValue, gaugeTone: tone }) {
  return (
    <div className="min-w-0 lg:w-24">
      <div className="hud-label">{label}</div>
      <div className="hud-value truncate text-sm">{value}</div>
      {gaugeValue !== undefined && (
        <div className={`hud-gauge mt-1.5 ${tone}`}>
          <span className="hud-gauge-fill" style={{ width: `${gaugeValue}%` }} />
        </div>
      )}
    </div>
  );
}
