import { AlertTriangle, Gift, ShieldAlert, Sparkles, UserRound } from "lucide-react";
import { ActionCard, GaugeBar } from "./VisualPrimitives";
import { RewardIconRow } from "./MissionVisuals";

const RISK_VALUE = { low: 24, medium: 52, high: 78, extreme: 96 };
const RISK_LABEL = { low: "낮음", medium: "보통", high: "높음", extreme: "극위험" };
const RISK_TONE = { low: "hud-chip-success", medium: "hud-chip-warn", high: "hud-chip-danger", extreme: "hud-chip-danger" };

function nonZeroEntries(record = {}) {
  return Object.entries(record).filter(([, value]) => value !== null && value !== undefined && value !== 0);
}

function formatDelta(value) {
  if (typeof value !== "number") return value;
  return value > 0 ? `+${value}` : `${value}`;
}

function outcomeSummary(option) {
  const outcomes = option?.outcomes ?? [];
  const resourceDeltas = outcomes.filter((entry) => entry.kind === "resource" && entry.delta).flatMap((entry) => nonZeroEntries(entry.delta).map(([key, value]) => ({ key, value })));
  const hasCombat = outcomes.some((entry) => entry.kind === "combat");
  const crewRisk = outcomes.find((entry) => entry.kind === "crewRisk");
  return { resourceDeltas, hasCombat, crewRisk };
}

function OptionMeta({ option }) {
  const { resourceDeltas, hasCombat, crewRisk } = outcomeSummary(option);
  const rewards = nonZeroEntries(option.rewardPreview ?? {});
  return (
    <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
      <span className={`hud-chip ${RISK_TONE[option.risk] ?? ""}`}><ShieldAlert size={12} />위험 {RISK_LABEL[option.risk] ?? option.risk}</span>
      <span className="hud-chip"><UserRound size={12} />{option.role ?? "함교"}</span>
      {rewards.length > 0 && <span className="hud-chip hud-chip-accent"><Gift size={12} />보상 {rewards.length}</span>}
      {resourceDeltas.map(({ key, value }) => <span key={`${key}-${value}`} className={value < 0 ? "hud-chip hud-chip-warn" : "hud-chip hud-chip-success"}>{key} {formatDelta(value)}</span>)}
      {crewRisk && <span className="hud-chip hud-chip-danger">승무원 위험 {Math.round((crewRisk.chance ?? 0) * 100)}%</span>}
      {hasCombat && <span className="hud-chip hud-chip-danger">교전 가능</span>}
    </div>
  );
}

function EncounterPoster({ encounter }) {
  const risk = RISK_VALUE[encounter?.risk] ?? 42;
  return (
    <div className="mission-poster mission-art-research">
      <div className="mission-poster-grid" />
      <div className="mission-poster-orbit" />
      <div className="mission-poster-ship" />
      <div className="mission-poster-emblem">{encounter?.icon ?? "◆"}</div>
      <div className="mission-poster-label">MISSION EVENT</div>
      <div className="absolute bottom-10 left-3 right-3 z-10">
        <div className="truncate text-lg font-black text-slate-50">{encounter?.title ?? "임무 조우"}</div>
        <div className="mt-1 flex flex-wrap gap-1.5"><span className="hud-chip bg-slate-950/70">{encounter?.timing ?? "objective"}</span><span className={`hud-chip ${RISK_TONE[encounter?.risk] ?? ""}`}>{RISK_LABEL[encounter?.risk] ?? encounter?.risk ?? "보통"}</span></div>
      </div>
      <div className="mission-poster-risk"><span style={{ width: `${risk}%` }} /></div>
    </div>
  );
}

export default function MissionEncounterCard({ encounter, onSelectOption, disabled = false }) {
  if (!encounter) {
    return (
      <section className="rounded-2xl border border-slate-700/70 bg-slate-950/60 p-4">
        <div className="section-title"><Sparkles size={18} />임무 조우 없음</div>
        <p className="mt-2 text-sm leading-6 text-slate-400">표시할 임무 조우 카드가 없습니다.</p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-cyan-300/30 bg-cyan-300/10 p-4">
      <div className="grid gap-4 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <EncounterPoster encounter={encounter} />
        <div className="min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="section-title"><AlertTriangle size={18} />임무 조우 카드</div>
              <h3 className="mt-2 text-xl font-black text-slate-50">{encounter.title}</h3>
            </div>
            <span className={`hud-chip shrink-0 ${RISK_TONE[encounter.risk] ?? ""}`}>위험 {RISK_LABEL[encounter.risk] ?? encounter.risk}</span>
          </div>
          <p className="mt-3 rounded-2xl border border-slate-700/70 bg-slate-950/55 p-3 text-sm leading-6 text-slate-300">{encounter.scene}</p>
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <div className="mission-stat-tile"><span>{encounter.icon}</span><span>{encounter.category}</span></div>
            <div className="mission-stat-tile"><span>⌁</span><span>{encounter.timing}</span></div>
            <div className="mission-stat-tile"><span>◆</span><span>{encounter.destinationName ?? "목적지"}</span></div>
            <div className="mission-stat-tile"><span>◇</span><span>{encounter.options?.length ?? 0} 선택</span></div>
          </div>
          <div className="mt-3"><GaugeBar label="상황 위험도" value={RISK_VALUE[encounter.risk] ?? 42} /></div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {(encounter.options ?? []).map((option) => (
          <div key={option.id} className="rounded-2xl border border-slate-700/70 bg-slate-950/60 p-3">
            <ActionCard icon={option.risk === "high" ? "⚠" : option.risk === "low" ? "✓" : "◆"} title={option.label} desc={`${option.role ?? "함교"} 판단`} badge="선택" disabled={disabled} onClick={() => onSelectOption?.(option.id)} />
            <OptionMeta option={option} />
            {nonZeroEntries(option.rewardPreview ?? {}).length > 0 && <div className="mt-3"><RewardIconRow reward={option.rewardPreview} /></div>}
          </div>
        ))}
      </div>
    </section>
  );
}
