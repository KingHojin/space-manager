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
    <header className="app-header">
      <div className="app-header-inner">
        <div className="ship-identity">
          <div className="ship-mark" aria-hidden="true">{grade.icon}</div>
          <div className="min-w-0">
            <div className="hud-label">{grade.label}급 탐사선</div>
            <h1 className="ship-name">{shipName}</h1>
          </div>
        </div>

        <div className="header-center">
          <div className="header-date">{date}</div>
          <div className="resource-strip" aria-label="함선 자원">
            <Resource label="크레딧" value={`₢ ${number(resources.credits)}`} />
            <Resource label="연료" value={percent(resources.fuel)} gaugeValue={resources.fuel} gaugeTone={gaugeTone(resources.fuel)} />
            <Resource label="산소" value={percent(resources.oxygen)} gaugeValue={resources.oxygen} gaugeTone={gaugeTone(resources.oxygen)} />
            <Resource label="선체" value={percent(resources.hull)} gaugeValue={resources.hull} gaugeTone={gaugeTone(resources.hull)} />
          </div>
        </div>

        <div className="time-controls">
          {warningCount > 0 && (
            <span className="warning-pill hud-chip hud-chip-danger">
              <AlertTriangle size={13} />
              경고 {warningCount}
            </span>
          )}
          <button className="notification-button icon-button time-control-button relative" title="알림" aria-label={`알림${warningCount > 0 ? ` ${warningCount}건` : " 없음"}`}>
            <Bell size={17} />
            {warningCount > 0 && <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-red-400" />}
          </button>
          <button className="icon-button time-control-button" onClick={togglePause} title={isPaused ? "시간 재생" : "일시정지"} aria-label={isPaused ? "시간 재생" : "일시정지"}>
            {isPaused ? <Play size={18} /> : <Pause size={18} />}
          </button>
          <button className="icon-button time-control-button gap-1.5" onClick={cycleSpeed} title="배속 변경" aria-label={`현재 ${speed}배속, 배속 변경`}>
            <SkipForward size={16} />
            <span className="text-xs tabular-nums">{speed}×</span>
          </button>
        </div>
      </div>
    </header>
  );
}

function Resource({ label, value, gaugeValue, gaugeTone: tone }) {
  return (
    <div className="resource-capsule">
      <div className="hud-label">{label}</div>
      <div className="hud-value">{value}</div>
      {gaugeValue !== undefined && (
        <div className={`hud-gauge ${tone}`}>
          <span className="hud-gauge-fill" style={{ width: `${gaugeValue}%` }} />
        </div>
      )}
    </div>
  );
}
