import { CheckCircle2, Flag, LockKeyhole, Route, ShieldCheck } from "lucide-react";
import { CAMPAIGN } from "../../data/constants";

function Condition({ done, children }) {
  return (
    <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs ${done ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-100" : "border-slate-700/70 bg-slate-950/55 text-slate-300"}`}>
      <span className="font-black">{done ? "✓" : "○"}</span>
      <span>{children}</span>
    </div>
  );
}

export default function CampaignObjectiveCard({ objective, gateDistance = null, gateHops = null, fuel = 0, hull = 0, livingCrew = 0, onNavigate }) {
  if (!objective) return null;
  const ready = fuel >= CAMPAIGN.READY_FUEL && hull >= CAMPAIGN.READY_HULL && livingCrew >= CAMPAIGN.READY_CREW;
  const nextUnlock = objective.isExpeditionFinale ? "1차 원정 완주 기록" : `원정 섹터 ${objective.sectorNumber + 1} 해금`;

  if (objective.expeditionCompleted) {
    return (
      <section className="rounded-2xl border border-emerald-300/35 bg-emerald-300/10 p-4">
        <div className="flex items-start justify-between gap-3">
          <div><div className="section-title"><CheckCircle2 size={18} />1차 개척 원정 완주</div><h3 className="mt-2 text-xl font-black text-emerald-100">5개 섹터 항로 확보</h3><p className="mt-2 text-sm text-slate-300">장기 함대 성장 캠페인의 첫 이정표입니다. 현재 항해와 함선 성장은 계속할 수 있습니다.</p></div>
          <span className="hud-chip hud-chip-accent shrink-0">MILESTONE</span>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-violet-300/35 bg-violet-300/10 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><div className="section-title"><Flag size={18} />{CAMPAIGN.EXPEDITION_LABEL}</div><h3 className="mt-2 truncate text-xl font-black text-slate-50">섹터 {objective.sectorNumber}/{objective.expeditionSectors} · {objective.gateUnlocked ? "관문 진입 가능" : "관문 좌표 해제"}</h3></div>
        <span className={`hud-chip shrink-0 ${objective.gateUnlocked ? "hud-chip-accent" : "hud-chip-warn"}`}>{objective.progressPercent}%</span>
      </div>
      <div className="hud-gauge mt-3"><span className="hud-gauge-fill" style={{ width: `${objective.progressPercent}%` }} /></div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <Condition done={objective.visitConditionMet}>현장 노드 조사 {objective.visitedFieldCount}/{objective.requiredFieldVisits}</Condition>
        <Condition done={objective.dangerConditionMet}>위험 {objective.dangerThreshold}+ 노드 생존 {objective.dangerousVisitedCount}/1</Condition>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <div className="rounded-xl border border-slate-700/70 bg-slate-950/55 p-2"><div className="hud-label">관문 경로</div><div className="mt-1 font-bold text-slate-100"><Route className="mr-1 inline" size={13} />{gateDistance === null ? "미확인" : `${gateDistance.toFixed(1)}u · ${gateHops ?? 0}홉`}</div></div>
        <div className="rounded-xl border border-slate-700/70 bg-slate-950/55 p-2"><div className="hud-label">진입 보상</div><div className="mt-1 font-bold text-amber-100">₢{objective.gateRewardCredits}</div></div>
        <div className="rounded-xl border border-slate-700/70 bg-slate-950/55 p-2"><div className="hud-label">다음 해금</div><div className="mt-1 truncate font-bold text-violet-100">{nextUnlock}</div></div>
        <div className="rounded-xl border border-slate-700/70 bg-slate-950/55 p-2"><div className="hud-label">출항 준비</div><div className={`mt-1 font-bold ${ready ? "text-emerald-100" : "text-amber-100"}`}><ShieldCheck className="mr-1 inline" size={13} />{ready ? "권장치 충족" : `Fuel ${Math.round(fuel)} · Hull ${Math.round(hull)} · ${livingCrew}명`}</div></div>
      </div>
      <button className="secondary-button mt-3 w-full justify-center" onClick={() => onNavigate?.("exploration")}>
        {objective.gateUnlocked ? <CheckCircle2 size={16} /> : <LockKeyhole size={16} />}{objective.gateUnlocked ? "관문으로 이동" : "섹터 목표 계속"}
      </button>
    </section>
  );
}
