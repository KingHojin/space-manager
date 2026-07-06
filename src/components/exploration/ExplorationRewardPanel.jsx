import { PackageSearch } from "lucide-react";
import { formatMinutes } from "../../data/moduleRecipes";
import {
  canExploreZone,
  explorationBlockLabel,
  explorationCooldownRemaining,
  explorationFuelCost,
  getZoneMaxYield,
  refreshZoneRuntimeIfNeeded,
  zoneHasYield,
} from "../../systems/explorationRules";

function pct(value, max) {
  if (max <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((value / max) * 100)));
}

function dangerText(zone) {
  if ((zone?.danger ?? 0) >= 5) return "고위험 · 선체 손상 가능";
  if ((zone?.danger ?? 0) >= 3) return "위험 · 연료 추가 소모";
  return "저위험 수거";
}

export default function ExplorationRewardPanel({ zone, runtime, currentMinute, fuel, isCurrent, disabled = false, onExplore }) {
  if (!zone) return null;
  const refreshed = refreshZoneRuntimeIfNeeded(zone, runtime, currentMinute);
  const check = canExploreZone(zone, refreshed, currentMinute);
  const maxYield = getZoneMaxYield(zone);
  const remaining = refreshed.remainingYield ?? maxYield;
  const fuelCost = explorationFuelCost(zone);
  const cooldown = explorationCooldownRemaining(refreshed, currentMinute);
  const hasYield = zoneHasYield(zone);
  const fuelBlocked = fuel < fuelCost;
  const blocked = disabled || !isCurrent || !check.ok || fuelBlocked;
  const buttonLabel = !isCurrent
    ? "현재 위치에서만 탐험 가능"
    : !check.ok
      ? explorationBlockLabel(check.reason)
      : fuelBlocked
        ? "연료 부족"
        : hasYield
          ? "구역 탐험 / 잔해 수거"
          : "수거 가능성 확인";

  return (
    <div className="mt-4 rounded border border-amber-300/30 bg-amber-300/10 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="section-title text-sm"><PackageSearch size={16} />탐험 보상 루프</div>
          <p className="mt-2 text-xs leading-5 text-slate-300">탐험으로 얻은 폐자재는 함선 창고에서 분해 작업으로 등록할 수 있습니다.</p>
        </div>
        <span className="hud-chip hud-chip-warn">Fuel -{fuelCost.toFixed(1)}</span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <div className="mission-stat-tile"><span>수확</span><span>{remaining}/{maxYield}</span></div>
        <div className="mission-stat-tile"><span>위험</span><span>{dangerText(zone)}</span></div>
        <div className="mission-stat-tile"><span>자원</span><span>{zone.richness ?? 1}</span></div>
      </div>
      {hasYield && <div className="hud-gauge mt-3"><span className="hud-gauge-fill" style={{ width: `${pct(remaining, maxYield)}%` }} /></div>}
      {!hasYield && <p className="mt-3 text-xs text-slate-400">정거장/관문 계열은 수거 보상보다 보급·이동 거점 역할입니다.</p>}
      {!check.ok && cooldown > 0 && <p className="mt-3 text-xs text-amber-100">재생성까지 {formatMinutes(cooldown)} 남음.</p>}
      <button className="secondary-button mt-3 w-full justify-center" disabled={blocked} onClick={onExplore}>{buttonLabel}</button>
    </div>
  );
}
