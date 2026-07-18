import { AlertTriangle, Clock3, UserRound } from "lucide-react";
import { useRef, useState } from "react";
import { items as itemCatalog } from "../../data/items";
import { formatMinutes } from "../../data/moduleRecipes";
import { getRoomDef } from "../../data/shipRooms";
import { settleIncidentChoice, getIncidentLeadCandidates, getIncidentOptionAvailability, getIncidentPresentation } from "../../orchestration/incidentDirectorOrchestrator";
import { useGameStore } from "../../stores/gameStore";
import { useIncidentStore } from "../../stores/incidentStore";
import { useCrewStore } from "../../stores/crewStore";
import { useJobStore } from "../../stores/jobStore";
import { estimateIncidentJobTiming, formatIncidentClock, formatIncidentDeadlineForecast, summarizeIncidentEffects } from "../../systems/incidentPresentation";
import { formatGameDate } from "../../systems/gameClock";
import { getSpecialty } from "../../systems/crewCapabilitySystem";

const ITEM_NAMES = new Map(itemCatalog.map((item) => [item.id, item.name]));
const RESOURCE_NAMES = { credits: "크레딧", fuel: "연료", oxygen: "산소", hull: "선체" };
function optionCosts(option) {
  const itemCosts = (option.costs ?? [])
    .filter((cost) => cost.type === "item" && cost.qty > 0)
    .map((cost) => `${ITEM_NAMES.get(cost.itemId) ?? cost.itemId} -${cost.qty}`);
  const resourceCosts = (option.effects ?? [])
    .filter((effect) => effect.type === "resources")
    .flatMap((effect) => Object.entries(effect.delta ?? {}))
    .filter(([, delta]) => delta < 0)
    .map(([resource, delta]) => `${RESOURCE_NAMES[resource] ?? resource} ${delta}`);
  return [...itemCosts, ...resourceCosts];
}

function unavailableLabel(availability) {
  if (availability.ok) return null;
  if (availability.reason === "missingItem") return `소모품 부족 · ${ITEM_NAMES.get(availability.detail) ?? availability.detail}`;
  if (availability.reason === "insufficientResource") return `${RESOURCE_NAMES[availability.detail] ?? availability.detail} 부족`;
  if (availability.reason === "targetUnavailable") return "대상 승무원 이탈";
  if (availability.reason === "requiredRoleUnavailable") return `필수 역할 부재 · ${availability.detail}`;
  if (availability.reason === "noUsableCrew") return "작업 가능한 승무원 부재";
  if (availability.reason === "leadRequired") return "담당 승무원을 선택하세요";
  if (availability.reason === "leadUnavailable") return "선택한 담당자가 이탈했습니다";
  if (availability.reason === "deadlineExpired") return "대응 시한 종료";
  return "현재 선택 불가";
}

export default function IncidentDecisionCard({ vesselId }) {
  const settlementLock = useRef(false);
  const [settlingOptionId, setSettlingOptionId] = useState(null);
  const [leadByOption, setLeadByOption] = useState({});
  const [specialtyByOption, setSpecialtyByOption] = useState({});
  const currentMinute = useGameStore((state) => state.currentMinute);
  const addLog = useGameStore((state) => state.addLog);
  const runtimesById = useIncidentStore((state) => state.runtimesById);
  const queueByVesselId = useIncidentStore((state) => state.queueByVesselId);
  const presentedByVesselId = useIncidentStore((state) => state.presentedByVesselId);
  const jobs = useJobStore((state) => state.jobs);
  const rooms = useJobStore((state) => state.rooms);
  const crew = useCrewStore((state) => state.crew);
  const presentation = getIncidentPresentation(vesselId);

  // Keep the subscriptions explicit: presentation is a read-only aggregate
  // over these three fields and must refresh after a stale/double click settles.
  void runtimesById;
  void queueByVesselId;
  void presentedByVesselId;

  if (!presentation || presentation.runtime.status !== "pending") return null;
  const { runtime, template, targetNames, activeCount, queueCount } = presentation;
  const remaining = runtime.deadlineAtMinute === null ? null : Math.max(0, runtime.deadlineAtMinute - currentMinute);
  const severityLabel = runtime.severity === "medium" ? "중형 위기" : "일상 사건";
  const timeoutConsequences = summarizeIncidentEffects(template.timeoutEffects ?? [], targetNames);
  const roomLabel = getRoomDef(runtime.roomId)?.label ?? runtime.roomId;

  const choose = (option) => {
    if (settlementLock.current) return;
    settlementLock.current = true;
    setSettlingOptionId(option.id);
    const result = settleIncidentChoice({
      runtimeId: runtime.id,
      stageId: runtime.stageId,
      claimId: runtime.offerClaimId,
      optionId: option.id,
      leadCrewId: leadByOption[option.id] ?? null,
      useSpecialty: Boolean(specialtyByOption[option.id]),
      manual: true,
      currentMinute,
    });
    addLog(result.ok ? `${template.title}: ${option.label} 결재.` : `${template.title} 결재 실패: ${result.reason ?? "상태를 다시 확인하세요"}.`);
    if (!result.ok) {
      settlementLock.current = false;
      setSettlingOptionId(null);
    }
  };

  return (
    <section className={`rounded-2xl border p-4 ${runtime.severity === "medium" ? "border-red-400/50 bg-red-400/10" : "border-amber-300/40 bg-amber-300/10"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className={runtime.severity === "medium" ? "section-title text-red-100" : "section-title text-amber-100"}><AlertTriangle size={18} />INCIDENT · 함장 결재</div>
          <h3 className="mt-2 text-xl font-black text-slate-50">{template.title}</h3>
        </div>
        <div className="flex flex-wrap justify-end gap-1.5">
          <span className={`hud-chip ${runtime.severity === "medium" ? "hud-chip-danger" : "hud-chip-warn"}`}>{severityLabel}</span>
          <span className="hud-chip">진행 {activeCount}</span>
          <span className="hud-chip">대기 {queueCount}</span>
        </div>
      </div>

      <p className="mt-3 rounded-2xl border border-slate-700/70 bg-slate-950/55 p-3 text-sm leading-6 text-slate-200">{template.summary}</p>
      <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
        {targetNames.length > 0 && <span className="hud-chip hud-chip-accent"><UserRound size={12} />대상 {targetNames.join(" · ")}</span>}
        {runtime.roomId && <span className="hud-chip">구역 {roomLabel}</span>}
        {runtime.deadlineAtMinute !== null && <span className={`hud-chip ${remaining === 0 ? "hud-chip-danger" : "hud-chip-warn"}`}><Clock3 size={12} />시한 {formatGameDate(runtime.deadlineAtMinute)} · 남은 {formatMinutes(remaining)}</span>}
      </div>
      <div className={`mt-3 rounded-xl border px-3 py-2 text-xs leading-5 ${timeoutConsequences.length > 0 ? "border-red-400/35 bg-red-400/10 text-red-100" : "border-slate-700/70 bg-slate-950/45 text-slate-400"}`}>
        <strong className="mr-2">시한 초과</strong>{timeoutConsequences.length > 0 ? timeoutConsequences.join(" · ") : template.positive ? "선택 기회 소멸 · 추가 자원/상태 변화 없음" : "추가 자원/상태 변화 없음"}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {(template.options ?? []).map((option) => {
          const leadCandidates = option.job ? getIncidentLeadCandidates(runtime, option) : [];
          const selectedLeadId = leadByOption[option.id] ?? null;
          const useSpecialty = Boolean(specialtyByOption[option.id]);
          const availability = getIncidentOptionAvailability(runtime, option, selectedLeadId, useSpecialty);
          const specialtyAvailability = option.job && selectedLeadId ? getIncidentOptionAvailability(runtime, option, selectedLeadId, true) : null;
          const costs = optionCosts(option);
          const disabledReason = unavailableLabel(availability);
          const immediate = summarizeIncidentEffects(option.effects ?? [], targetNames);
          const completion = summarizeIncidentEffects(option.job?.completionEffects ?? [], targetNames);
          const failure = summarizeIncidentEffects(option.job?.failureEffects ?? [], targetNames);
          const projectedOption = availability.snapshot?.job ? { ...option, job: availability.snapshot.job } : option;
          const forecast = option.job ? estimateIncidentJobTiming({ option: projectedOption, runtime, currentMinute, jobs, rooms, crew }) : null;
          const timing = option.job ? formatIncidentDeadlineForecast(forecast, runtime.deadlineAtMinute) : null;
          return (
            <div key={option.id} className="rounded-2xl border border-slate-700/70 bg-slate-950/65 p-3">
              <div className="font-black text-slate-50">{option.label}</div>
              <p className="mt-2 min-h-10 text-xs leading-5 text-slate-300">{option.detail}</p>
              <div className="mt-2 flex min-h-6 flex-wrap gap-1.5">
                {costs.length > 0 ? costs.map((cost) => <span key={cost} className="hud-chip hud-chip-warn">{cost}</span>) : <span className="hud-chip hud-chip-success">자원·소모품 비용 없음</span>}
              </div>
              <div className="mt-2 grid gap-1 text-xs leading-5">
                <div className="text-slate-300"><strong className="mr-2 text-slate-100">즉시</strong>{immediate.length > 0 ? immediate.join(" · ") : "상태 변화 없음"}</div>
                {option.job && <div className="text-emerald-100"><strong className="mr-2">완료</strong>{completion.length > 0 ? completion.join(" · ") : "추가 상태 변화 없음"}</div>}
                {option.job && <div className="text-red-100"><strong className="mr-2">실패</strong>{failure.length > 0 ? failure.join(" · ") : "추가 상태 변화 없음"}</div>}
              </div>
              {option.job && <div className="mt-2 rounded-xl border border-slate-700/70 bg-slate-900/45 p-2 text-xs"><div className="mb-1 font-black text-slate-200">담당 지정 · 기준 {leadCandidates[0]?.threshold ?? 10}</div><select className="w-full rounded-lg border border-slate-600 bg-slate-950 px-2 py-1.5 text-slate-100" value={selectedLeadId} onChange={(event) => setLeadByOption((current) => ({ ...current, [option.id]: event.target.value }))}><option value="">선택</option>{leadCandidates.map((candidate) => <option key={candidate.leadCrewId} value={candidate.leadCrewId}>{crew.find((member) => member.id === candidate.leadCrewId)?.name ?? candidate.leadCrewId} · {candidate.profile.base}→{candidate.profile.effective} · {candidate.tier === "expert" ? "전문 -30분" : candidate.tier === "below" ? "미달 +30분 +부하" : "표준"}{candidate.profile.gearDescription ? ` · ${candidate.profile.gearDescription}` : ""}</option>)}</select>{selectedLeadId && <label className="mt-2 flex items-center gap-2 text-slate-200"><input type="checkbox" checked={useSpecialty} disabled={!specialtyAvailability?.ok} onChange={(event) => setSpecialtyByOption((current) => ({ ...current, [option.id]: event.target.checked }))} />전문 능력 사용 · 이번 구역 1회</label>}{selectedLeadId && !specialtyAvailability?.ok && <div className="mt-1 text-amber-200">전문 능력 불가: {specialtyAvailability?.reason?.replace("specialty:", "")}</div>}{availability.snapshot?.specialty && <div className="mt-1 text-violet-200">전문 능력 반영: {getSpecialty(availability.snapshot.specialty.id)?.label ?? availability.snapshot.specialty.id} · {getSpecialty(availability.snapshot.specialty.id)?.effect ?? ""}</div>}<div className="mt-1 text-slate-400">피로·부상·장비가 반영된 수치이며, 결재 시 결과와 시간이 고정됩니다.</div></div>}
              {option.job && <div className={`mt-2 rounded-xl border px-2.5 py-2 text-xs leading-5 ${timing.late ? "border-red-400/40 bg-red-400/10 text-red-100" : "border-cyan-300/30 bg-cyan-300/10 text-cyan-100"}`}><div>{forecast ? `시작 예상 ${formatIncidentClock(forecast.startAt)}` : "시작 예상 산정 불가"} · 확정 시 {formatMinutes(availability.snapshot?.job?.duration ?? option.job.duration)}</div><div className="font-bold">{timing.label}</div></div>}
              {disabledReason && <div className="mt-2 text-xs font-bold text-red-300">{disabledReason}</div>}
              {availability.ok && availability.waitText && <div className="mt-2 text-xs font-bold text-amber-200">{availability.waitText}</div>}
              <button className="primary-button mt-3 w-full justify-center" disabled={!availability.ok || Boolean(option.job && !selectedLeadId) || settlementLock.current} onClick={() => choose(option)}>{settlingOptionId === option.id ? "처리 중" : option.job && !selectedLeadId ? "담당 선택" : availability.ok ? "결재" : "선택 불가"}</button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
