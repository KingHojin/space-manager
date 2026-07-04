import { Activity, Compass, Shield, Sparkles } from "lucide-react";
import { getZoneById } from "../../data/sectors";
import { useCrewStore } from "../../stores/crewStore";
import { useExplorationStore } from "../../stores/explorationStore";
import { useGameStore } from "../../stores/gameStore";
import { useInventoryStore } from "../../stores/inventoryStore";
import { number } from "../../utils/format";

export default function Overview() {
  const zone = getZoneById(useExplorationStore((state) => state.currentZoneId));
  const resources = useGameStore((state) => state.resources);
  const logs = useGameStore((state) => state.logs);
  const dust = useInventoryStore((state) => state.dust);
  const crew = useCrewStore((state) => state.crew);

  return (
    <div className="panel-grid">
      <section className="panel-span">
        <div className="section-title">
          <Compass size={18} />
          현재 상황
        </div>
        <div className="mt-4 grid grid-cols-4 gap-3">
          <Metric label="현재 위치" value={zone?.name} sub={`위험도 ${zone?.danger} / 자원 ${zone?.richness}`} />
          <Metric label="승무원" value={`${crew.length}명`} sub="부상 없음" />
          <Metric label="우주 먼지" value={number(dust, 1)} sub="집진기 자동 수집" />
          <Metric label="작전 상태" value={resources.hull > 40 ? "정상" : "수리 필요"} sub="선체 기준" />
        </div>
      </section>
      <section>
        <div className="section-title">
          <Activity size={18} />
          진행 중 임무
        </div>
        <ul className="mt-4 space-y-3 text-sm text-slate-300">
          <li>청색 표류대의 잔류 신호 분석</li>
          <li>우주 먼지 100 수집 후 카드 뽑기</li>
          <li>숨겨진 구역 1곳 스캔</li>
        </ul>
      </section>
      <section>
        <div className="section-title">
          <Shield size={18} />
          위험 평가
        </div>
        <div className="mt-4 text-4xl font-bold text-amber-200">{zone?.danger ?? 1}</div>
        <p className="mt-2 text-sm text-slate-400">현재 구역 위험도입니다. 4 이상 구역에서는 전투 이벤트 확률이 상승합니다.</p>
      </section>
      <section className="panel-span">
        <div className="section-title">
          <Sparkles size={18} />
          최근 이벤트
        </div>
        <div className="mt-4 grid gap-2">
          {logs.slice(0, 5).map((log, index) => (
            <div key={`${log}-${index}`} className="rounded border border-slate-700/70 bg-slate-950/60 px-3 py-2 text-sm text-slate-300">
              {log}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value, sub }) {
  return (
    <div className="rounded border border-slate-700/70 bg-slate-950/60 p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-2 text-xl font-bold text-slate-50">{value}</div>
      <div className="mt-1 text-xs text-slate-400">{sub}</div>
    </div>
  );
}
