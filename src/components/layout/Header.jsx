import { Gauge, Pause, Play, SkipForward } from "lucide-react";
import { SHIP_GRADES } from "../../data/constants";
import { useGameStore } from "../../stores/gameStore";
import { formatGameDate } from "../../systems/gameClock";
import { number, percent } from "../../utils/format";

export default function Header() {
  const { shipName, shipGrade, currentMinute, resources, isPaused, speed, togglePause, cycleSpeed } = useGameStore();
  const grade = SHIP_GRADES[shipGrade];

  return (
    <header className="grid h-16 grid-cols-[minmax(260px,1.2fr)_minmax(280px,1fr)_minmax(440px,1.5fr)] items-center border-b border-slate-700/80 bg-slate-950 px-5">
      <div className="flex items-center gap-3">
        <div className="grid h-9 w-9 place-items-center rounded border border-cyan-400/50 bg-cyan-400/10 text-sm font-bold text-cyan-100">
          {grade.icon}
        </div>
        <div>
          <div className="text-sm text-slate-400">{grade.label}급 탐사선</div>
          <h1 className="text-lg font-bold text-slate-50">{shipName}</h1>
        </div>
      </div>
      <div className="text-center font-mono text-sm tabular-nums text-cyan-100">{formatGameDate(currentMinute)}</div>
      <div className="flex items-center justify-end gap-4">
        <Resource label="크레딧" value={`₢ ${number(resources.credits)}`} />
        <Resource label="연료" value={percent(resources.fuel)} />
        <Resource label="산소" value={percent(resources.oxygen)} />
        <div className="w-28">
          <div className="mb-1 flex items-center justify-between text-xs text-slate-400">
            <span>선체</span>
            <span>{percent(resources.hull)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded bg-slate-800">
            <div className="h-full bg-emerald-400" style={{ width: `${resources.hull}%` }} />
          </div>
        </div>
        <button className="icon-button" onClick={togglePause} title={isPaused ? "재생" : "일시정지"}>
          {isPaused ? <Play size={18} /> : <Pause size={18} />}
        </button>
        <button className="icon-button min-w-16 gap-1" onClick={cycleSpeed} title="배속 변경">
          <SkipForward size={16} />
          <span className="text-xs">{speed}x</span>
        </button>
      </div>
    </header>
  );
}

function Resource({ label, value }) {
  return (
    <div className="min-w-16">
      <div className="flex items-center gap-1 text-xs text-slate-400">
        <Gauge size={12} />
        {label}
      </div>
      <div className="font-mono text-sm font-semibold tabular-nums text-slate-100">{value}</div>
    </div>
  );
}
