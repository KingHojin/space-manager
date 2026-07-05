import { useState } from "react";
import { Clock3, Fuel, Radar, Rocket, Route, ScanLine } from "lucide-react";
import { MODULE_SLOTS, RESOURCES, SHIP_GRADES } from "../../data/constants";
import { getAllZones, getZoneById, sectors } from "../../data/sectors";
import { formatMinutes } from "../../data/moduleRecipes";
import { useExplorationStore } from "../../stores/explorationStore";
import { useGameStore } from "../../stores/gameStore";
import { useInventoryStore } from "../../stores/inventoryStore";
import { useShipStore } from "../../stores/shipStore";
import { resolveScanEvent } from "../../systems/explorationEvents";
import { formatGameDate } from "../../systems/gameClock";
import { calculateTravelPlan, getTravelProgress } from "../../systems/travelSystem";
import StarMap from "../exploration/StarMap";
import PlanetCanvas from "../three/PlanetCanvas";

function dangerChipClass(danger) {
  if (danger >= 5) return "hud-chip-danger";
  if (danger >= 3) return "hud-chip-warn";
  return "";
}

function gaugeTone(value) {
  if (value < RESOURCES.LOW_RESOURCE_WARNING) return "hud-gauge-danger";
  if (value < 50) return "hud-gauge-warn";
  return "hud-gauge-success";
}

const RARITY_BORDER_CLASS = {
  common: "border-slate-500/50",
  uncommon: "border-emerald-400/50",
  rare: "border-sky-400/50",
  epic: "border-violet-400/50",
  legendary: "border-amber-300/60",
};

export default function Exploration() {
  const [lastOutcome, setLastOutcome] = useState(null);
  const zones = getAllZones();
  const sector = sectors[0];
  const {
    currentZoneId,
    selectedZoneId,
    discoveredZoneIds,
    scannedZoneIds,
    route,
    activeTravel,
    travelLog,
    selectZone,
    startTravel,
    scanZone,
    revealRandomZone,
  } = useExplorationStore();
  const { resources, spendFuel, addLog, addResources, shipName, shipGrade, currentMinute, setPaused } = useGameStore();
  const items = useInventoryStore((state) => state.items);
  const addDust = useInventoryStore((state) => state.addDust);
  const addItem = useInventoryStore((state) => state.addItem);
  const removeItem = useInventoryStore((state) => state.removeItem);
  const { modules, installed } = useShipStore();
  const installedModules = Object.values(installed).map((id) => modules.find((entry) => entry.id === id)).filter(Boolean);
  const current = getZoneById(currentZoneId);
  const focused = getZoneById(selectedZoneId) ?? current;
  const isViewingCurrent = focused.id === current.id;
  const routePlan = current && focused && !isViewingCurrent ? calculateTravelPlan({ fromZone: current, toZone: focused, modules: installedModules, currentMinute }) : null;
  const canStartTravel = Boolean(routePlan) && !activeTravel && resources.fuel >= routePlan.fuelCost;
  const grade = SHIP_GRADES[shipGrade];
  const probeQty = items.find((item) => item.id === "survey-probe")?.qty ?? 0;
  const activeProgress = getTravelProgress(activeTravel, currentMinute);
  const activeDestination = getZoneById(activeTravel?.toZoneId);
  const activeOrigin = getZoneById(activeTravel?.fromZoneId);

  const handleSelect = (zone) => {
    if (!discoveredZoneIds.includes(zone.id)) return;
    selectZone(zone.id === currentZoneId ? null : zone.id);
  };

  const handleSetCourse = () => {
    if (!routePlan || activeTravel) return;
    if (!spendFuel(routePlan.fuelCost)) {
      addLog(`${focused.name} 항해 실패: 연료가 부족합니다.`);
      return;
    }
    startTravel(routePlan);
    setLastOutcome(null);
    setPaused(false);
    addLog(`${focused.name} 항해 시작: ${routePlan.distanceLy} LY, 연료 -${routePlan.fuelCost}, 소요 ${formatMinutes(routePlan.duration)}, 도착 ${formatGameDate(routePlan.completeAt)}.`);
  };

  const handleScan = () => {
    if (!current) return;
    if (activeTravel) {
      addLog("항해 중에는 현재 구역 스캔을 실행할 수 없습니다.");
      return;
    }
    const scannedBefore = scannedZoneIds.includes(current.id);
    const outcome = resolveScanEvent({ zone: current, scannedBefore });
    const resourceChanges = { ...(outcome.resources ?? {}) };

    if (outcome.credits) resourceChanges.credits = outcome.credits;
    if (Object.keys(resourceChanges).length > 0) addResources(resourceChanges);
    if (outcome.dust) addDust(outcome.dust);
    if (outcome.itemId) addItem(outcome.itemId, outcome.itemQty ?? 1);
    Array.from({ length: outcome.revealCount ?? 0 }).forEach(() => revealRandomZone());

    scanZone(current.id);

    const rewards = [];
    if (outcome.credits) rewards.push(`크레딧 ${outcome.credits > 0 ? "+" : ""}${outcome.credits}`);
    if (outcome.dust) rewards.push(`우주 먼지 +${outcome.dust}`);
    if (outcome.itemId) rewards.push(`아이템 ${outcome.itemId} x${outcome.itemQty ?? 1}`);
    if (outcome.revealCount) rewards.push(`구역 공개 +${outcome.revealCount}`);
    Object.entries(outcome.resources ?? {}).forEach(([key, value]) => rewards.push(`${key} ${value > 0 ? "+" : ""}${value}`));

    const summary = `${current.name} 스캔: ${outcome.title} — ${outcome.message}${rewards.length ? ` (${rewards.join(", ")})` : ""}`;
    addLog(summary);
    setLastOutcome({ ...outcome, zoneName: current.name, zoneType: current.type, richness: current.richness, summary });
  };

  const precisionAnalyze = () => {
    if (!lastOutcome) return;
    if (resources.oxygen < 3) {
      addLog("정밀 분석 실패: 산소 여유가 부족합니다.");
      return;
    }
    const bonusDust = 10 + Math.round((lastOutcome.richness ?? 1) * 2);
    addResources({ oxygen: -3 });
    addDust(bonusDust);
    addLog(`${lastOutcome.zoneName} 정밀 분석 완료: 산소 -3, 우주 먼지 +${bonusDust}.`);
  };

  const deployProbe = () => {
    if (!lastOutcome) return;
    if (probeQty <= 0) {
      addLog("탐사 프로브가 없습니다. 시장 또는 스캔 보상으로 확보하세요.");
      return;
    }
    removeItem("survey-probe", 1);
    revealRandomZone();
    addDust(8);
    addLog(`${lastOutcome.zoneName}에 탐사 프로브 투입: 구역 1곳 공개, 우주 먼지 +8.`);
  };

  const salvageSweep = () => {
    if (!lastOutcome) return;
    const credits = 70 + Math.round((lastOutcome.richness ?? 1) * 25);
    addResources({ fuel: -2, hull: -2, credits });
    addItem("alloy-plate", 1);
    addLog(`${lastOutcome.zoneName} 잔해 회수: 크레딧 +${credits}, 합금 장갑판 +1, 연료 -2, 선체 -2.`);
  };

  return (
    <div className="grid grid-cols-1 gap-4 xl:h-full xl:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)]">
      <section className="xl:overflow-y-auto">
        <div className="section-title">
          <Radar size={18} />
          {sector.name} 성계 지도
        </div>
        <div className="mt-3">
          <StarMap
            zones={zones}
            currentZoneId={currentZoneId}
            selectedZoneId={selectedZoneId}
            discoveredZoneIds={discoveredZoneIds}
            route={route}
            activeTravel={activeTravel}
            currentMinute={currentMinute}
            onSelect={handleSelect}
            sectorName={sector.name}
            exploredCount={discoveredZoneIds.length}
            totalCount={zones.length}
          />
        </div>
        <div className="hud-label mt-2">스캔 {scannedZoneIds.length}</div>
      </section>
      <aside className="space-y-4">
        {activeTravel && (
          <section>
            <div className="section-title"><Clock3 size={18} />항해 상황판</div>
            <div className="mt-4 rounded border border-amber-300/35 bg-amber-300/10 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold text-amber-100">{activeOrigin?.name} → {activeDestination?.name}</div>
                  <div className="mt-1 text-xs text-slate-400">{activeTravel.distanceLy} LY · 도착 {formatGameDate(activeTravel.completeAt)}</div>
                </div>
                <span className="hud-chip hud-chip-warn">항해 중</span>
              </div>
              <div className="mt-3">
                <div className="mb-1 flex items-center justify-between text-xs"><span className="hud-label">진행률</span><span className="hud-value">{Math.round(activeProgress)}%</span></div>
                <div className="hud-gauge"><span className="hud-gauge-fill" style={{ width: `${activeProgress}%` }} /></div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <Info label="남은 시간" value={formatMinutes(Math.max(0, Math.ceil(activeTravel.completeAt - currentMinute)))} />
                <Info label="인카운터" value={`${activeTravel.encounters.filter((entry) => entry.resolved).length}/${activeTravel.encounters.length}`} />
              </div>
              <div className="mt-3 grid gap-1.5">
                {travelLog.slice(0, 3).map((entry, index) => <div key={`${entry}-${index}`} className="rounded border border-slate-700/70 bg-slate-950/50 px-3 py-2 text-xs text-slate-300">{entry}</div>)}
              </div>
            </div>
          </section>
        )}

        <section>
          <div className="section-title">
            <ScanLine size={18} />
            구역 정보
          </div>
          <div className="mt-4 flex flex-col gap-4 sm:flex-row">
            <div className="h-40 w-40 shrink-0 overflow-hidden rounded border border-slate-700/70 bg-slate-950/60 sm:h-44 sm:w-44">
              <PlanetCanvas zone={focused} interactive />
            </div>
            <div className="flex min-w-0 flex-1 flex-col justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-2xl font-bold text-cyan-100">{focused.name}</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="hud-chip">{focused.type}</span>
                  <span className={`hud-chip ${dangerChipClass(focused.danger)}`}>위험 {focused.danger}</span>
                  <span className="hud-chip hud-chip-success">자원 {focused.richness}</span>
                </div>
              </div>
              <div className="space-y-2 text-sm">
                {isViewingCurrent ? (
                  <Info label="스캔 상태" value={scannedZoneIds.includes(current.id) ? "완료" : "미완료"} />
                ) : (
                  <>
                    <Info label="항로 거리" value={`${routePlan?.distanceLy ?? 0} LY`} />
                    <Info label="소요 시간" value={routePlan ? formatMinutes(routePlan.duration) : "-"} />
                    <Info label="도착 예정" value={routePlan ? formatGameDate(routePlan.completeAt) : "-"} />
                    <Info label="예상 연료" value={`-${routePlan?.fuelCost ?? 0}`} />
                  </>
                )}
              </div>
            </div>
          </div>
          {isViewingCurrent ? (
            <button className="primary-button mt-4 w-full" onClick={handleScan} disabled={Boolean(activeTravel)}>
              {activeTravel ? "항해 중 스캔 불가" : "현재 구역 스캔 & 이벤트 판정"}
            </button>
          ) : (
            <button
              className="primary-button mt-4 flex w-full items-center justify-center gap-2"
              onClick={handleSetCourse}
              disabled={!canStartTravel}
            >
              <Fuel size={16} />
              {activeTravel ? "항해 진행 중" : canStartTravel ? `항해 시작 (연료 -${routePlan.fuelCost})` : `항해 불가${resources.fuel < (routePlan?.fuelCost ?? 0) ? " · 연료 부족" : ""}`}
            </button>
          )}
        </section>

        {lastOutcome && (
          <section>
            <div className="section-title">스캔 후속 선택지</div>
            <div className="mt-3 rounded border border-cyan-400/30 bg-cyan-400/10 p-4">
              <div className="font-semibold text-cyan-100">{lastOutcome.title}</div>
              <p className="mt-2 text-sm text-slate-300">{lastOutcome.message}</p>
            </div>
            <div className="mt-3 grid gap-2">
              <button className="secondary-button" onClick={precisionAnalyze}>정밀 분석 · 산소 -3 / 먼지 보너스</button>
              <button className="secondary-button" onClick={deployProbe}>탐사 프로브 투입 · 보유 {probeQty}</button>
              <button className="secondary-button" onClick={salvageSweep}>잔해 회수 · 연료/선체 소모, 크레딧 획득</button>
            </div>
          </section>
        )}

        <section>
          <div className="section-title">
            <Rocket size={18} />
            함선 개요
          </div>
          <div className="mt-4 flex items-center justify-between gap-2">
            <div className="min-w-0 truncate text-lg font-bold text-slate-50">{shipName}</div>
            <span className="hud-chip hud-chip-accent shrink-0">
              {grade.icon} · {grade.label}
            </span>
          </div>
          <div className="mt-3 space-y-3">
            <GaugeRow label="선체" value={resources.hull} />
            <GaugeRow label="연료" value={resources.fuel} />
            <GaugeRow label="산소" value={resources.oxygen} />
          </div>
          <div className="hud-label mt-4">장착 모듈</div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {MODULE_SLOTS.map((slot) => {
              const module = modules.find((entry) => entry.id === installed[slot]);
              const borderClass = RARITY_BORDER_CLASS[module?.rarity] ?? RARITY_BORDER_CLASS.common;
              return (
                <div key={slot} className={`min-w-0 rounded border ${borderClass} bg-slate-950/60 p-2`}>
                  <div className="hud-label truncate">{slot}</div>
                  <div className="truncate text-xs font-semibold text-slate-100">{module?.name ?? "-"}</div>
                </div>
              );
            })}
          </div>
        </section>

        <section>
          <div className="section-title">
            <Route size={18} />
            최근 이동 경로
          </div>
          <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
            {route.map((zoneId, index) => (
              <span key={`${zoneId}-${index}`} className="hud-chip shrink-0">
                {getZoneById(zoneId)?.name}
              </span>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-500">스캔 완료 구역: {scannedZoneIds.length}</p>
        </section>
      </aside>
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
      <span className="hud-label">{label}</span>
      <span className="hud-value text-right">{value}</span>
    </div>
  );
}

function GaugeRow({ label, value }) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="hud-label">{label}</span>
        <span className="hud-value">{Math.round(value)}%</span>
      </div>
      <div className={`hud-gauge mt-1 ${gaugeTone(value)}`}>
        <span className="hud-gauge-fill" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}
