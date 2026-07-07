import { RotateCcw, ScrollText, Settings2 } from "lucide-react";
import { ENCOUNTER_STANCES, POLICY_CATALOG, POLICY_CATEGORIES } from "../../data/policies";
import { INJURY_STATE_ORDER, injuryLabel } from "../../systems/injurySystem";
import { useGameStore } from "../../stores/gameStore";
import { usePolicyStore } from "../../stores/policyStore";
import { filterPolicyLogs } from "../../utils/policyLogs";

const STANCE_LABELS = { safe: "안전", balanced: "균형", aggressive: "공격적" };

// Params keyed by policy id — kept as a lookup instead of a big switch so
// adding a 5th policy with an existing param shape (a new threshold/select)
// needs no new branch here.
const THRESHOLD_PARAMS = {
  "auto-hull-repair": { key: "hullThreshold", label: "선체 임계값" },
  "fuel-reserve": { key: "reserveThreshold", label: "연료 예비 임계값" },
};

function PolicyCard({ definition }) {
  const policyState = usePolicyStore((state) => state.policies[definition.id]);
  const setPolicyEnabled = usePolicyStore((state) => state.setPolicyEnabled);
  const setPolicyParam = usePolicyStore((state) => state.setPolicyParam);
  const resetPolicy = usePolicyStore((state) => state.resetPolicy);

  const enabled = policyState?.enabled ?? false;
  const params = policyState?.params ?? {};
  const threshold = THRESHOLD_PARAMS[definition.id];

  return (
    <div className={`rounded border p-4 ${enabled ? "border-cyan-300/60 bg-cyan-400/10" : "border-slate-700/70 bg-slate-950/60"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-slate-50">{definition.label}</span>
            <span className="hud-chip">{POLICY_CATEGORIES[definition.category] ?? definition.category}</span>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-400">{definition.description}</p>
        </div>
        <button
          className={`hud-chip shrink-0 px-3 py-1.5 ${enabled ? "hud-chip-success" : ""}`}
          onClick={() => setPolicyEnabled(definition.id, !enabled)}
          aria-pressed={enabled}
          title={enabled ? "정책을 끄려면 클릭" : "정책을 켜려면 클릭"}
        >
          {enabled ? "ON" : "OFF"}
        </button>
      </div>

      {threshold && (
        <div className="mt-4">
          <div className="flex items-center justify-between">
            <span className="hud-label">{threshold.label}</span>
            <span className="hud-value">{params[threshold.key]}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={params[threshold.key] ?? 0}
            className="mt-2 w-full accent-cyan-400"
            onChange={(event) => setPolicyParam(definition.id, threshold.key, Number(event.target.value))}
          />
        </div>
      )}

      {definition.id === "auto-treatment" && (
        <div className="mt-4">
          <div className="hud-label mb-2">최소 등급</div>
          <div className="grid grid-cols-5 gap-1.5">
            {INJURY_STATE_ORDER.map((state) => {
              const active = params.minSeverity === state;
              return (
                <button
                  key={state}
                  className={`secondary-button justify-center px-1 py-2 text-xs ${active ? "border-cyan-300 bg-cyan-400/15 text-cyan-100" : ""}`}
                  onClick={() => setPolicyParam(definition.id, "minSeverity", state)}
                >
                  {injuryLabel(state)}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {definition.id === "encounter-default-choice" && (
        <div className="mt-4">
          <div className="hud-label mb-2">대응 성향</div>
          <div className="grid grid-cols-3 gap-1.5">
            {ENCOUNTER_STANCES.map((stance) => {
              const active = params.stance === stance;
              return (
                <button
                  key={stance}
                  className={`secondary-button justify-center px-1 py-2 text-xs ${active ? "border-cyan-300 bg-cyan-400/15 text-cyan-100" : ""}`}
                  onClick={() => setPolicyParam(definition.id, "stance", stance)}
                >
                  {STANCE_LABELS[stance] ?? stance}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <button className="secondary-button mt-4 min-h-8 justify-center gap-1.5 px-3 text-xs" onClick={() => resetPolicy(definition.id)}>
        <RotateCcw size={13} />기본값으로
      </button>
    </div>
  );
}

export default function PolicyModal() {
  const logs = useGameStore((state) => state.logs);
  const recentPolicyLogs = filterPolicyLogs(logs, 8);

  return (
    <div className="grid gap-4">
      <section>
        <div className="section-title"><Settings2 size={18} />자동화 정책</div>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          켜둔 정책은 매 시간 틱마다 조건을 확인해 자동으로 작업을 예약하거나 대응을 선택합니다. 전투로 이어지는 조우 선택지는 어떤 정책도 자동 선택하지 않습니다.
        </p>
      </section>
      <section className="grid gap-3 sm:grid-cols-2">
        {POLICY_CATALOG.map((definition) => (
          <PolicyCard key={definition.id} definition={definition} />
        ))}
      </section>
      <section>
        <div className="section-title"><ScrollText size={18} />최근 정책 발동</div>
        <div className="mt-3 grid gap-2">
          {recentPolicyLogs.length === 0 ? (
            <div className="rounded border border-slate-700/70 bg-slate-950/60 px-3 py-2 text-sm text-slate-500">아직 발동된 정책 기록이 없습니다.</div>
          ) : (
            recentPolicyLogs.map((log, index) => (
              <div key={`${log}-${index}`} className="rounded border border-slate-700/70 bg-slate-950/60 px-3 py-2 text-sm leading-6 text-slate-300">
                {log}
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
