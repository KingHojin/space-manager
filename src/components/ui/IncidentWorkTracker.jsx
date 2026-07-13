import { AlertTriangle, Clock3, Wrench } from "lucide-react";
import { getDirectorIncident } from "../../data/directorIncidents";
import { formatMinutes } from "../../data/moduleRecipes";
import { getRoomDef } from "../../data/shipRooms";
import { useCrewStore } from "../../stores/crewStore";
import { useGameStore } from "../../stores/gameStore";
import { useIncidentStore } from "../../stores/incidentStore";
import { useJobStore } from "../../stores/jobStore";
import { estimateIncidentJobTiming, formatIncidentClock, formatIncidentDeadlineForecast, summarizeIncidentEffects } from "../../systems/incidentPresentation";

const JOB_STATUS = { backlog: "배정 대기", assigned: "담당자 이동 중", in_progress: "대응 작업 중", done: "완료 확인 중", failed: "작업 실패" };

export default function IncidentWorkTracker({ vesselId }) {
  const currentMinute = useGameStore((state) => state.currentMinute);
  const runtimesById = useIncidentStore((state) => state.runtimesById);
  const jobs = useJobStore((state) => state.jobs);
  const rooms = useJobStore((state) => state.rooms);
  const crew = useCrewStore((state) => state.crew);
  const waiting = Object.values(runtimesById).filter((runtime) => runtime.vesselId === vesselId && runtime.status === "waitingJob");
  if (waiting.length === 0) return null;

  return (
    <section className="rounded-2xl border border-amber-300/35 bg-amber-300/10 p-4">
      <div className="flex items-center justify-between gap-3"><div className="section-title text-amber-100"><Wrench size={18} />사건 대응 추적</div><span className="hud-chip hud-chip-warn">진행 {waiting.length}</span></div>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        {waiting.map((runtime) => {
          const template = getDirectorIncident(runtime.templateId);
          const job = jobs.find((entry) => entry.id === runtime.waitingJob?.jobId);
          const incident = job?.payload?.incident;
          const crewById = new Map(crew.map((member) => [member.id, member]));
          const targetNames = (runtime.targets?.crewIds ?? (runtime.targets?.crewId ? [runtime.targets.crewId] : [])).map((id) => crewById.get(id)?.name ?? id);
          const forecast = job ? estimateIncidentJobTiming({ jobId: job.id, currentMinute, jobs, rooms, crew }) : null;
          const remaining = runtime.deadlineAtMinute === null ? null : Math.max(0, runtime.deadlineAtMinute - currentMinute);
          const timing = formatIncidentDeadlineForecast(forecast, runtime.deadlineAtMinute);
          const late = timing.late;
          const failure = summarizeIncidentEffects(incident?.failureEffects ?? runtime.waitingJob?.failureEffects ?? [], targetNames);
          const completion = summarizeIncidentEffects(incident?.completionEffects ?? [], targetNames);
          const progress = job?.status === "in_progress" ? Math.round((job.progress ?? 0) * 100) : 0;
          return (
            <article key={runtime.id} className={`rounded-2xl border p-3 ${late ? "border-red-400/45 bg-red-400/10" : "border-slate-700/70 bg-slate-950/60"}`}>
              <div className="flex items-start justify-between gap-3"><div><div className="font-black text-slate-50">{template?.title ?? runtime.templateId}</div><div className="mt-1 text-xs text-slate-400">{getRoomDef(job?.roomId ?? runtime.roomId)?.label ?? job?.roomId ?? runtime.roomId} · {JOB_STATUS[job?.status] ?? "작업 기록 확인 중"}{job?.status === "in_progress" ? ` ${progress}%` : ""}</div></div><span className={`hud-chip shrink-0 ${late ? "hud-chip-danger" : "hud-chip-warn"}`}>{late ? "늦음 위험" : "대응 중"}</span></div>
              <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
                {remaining !== null && <span className={`hud-chip ${remaining === 0 ? "hud-chip-danger" : "hud-chip-warn"}`}><Clock3 size={12} />마감까지 {formatMinutes(remaining)}</span>}
                {forecast && <span className="hud-chip">시작 {formatIncidentClock(forecast.startAt)}</span>}
              </div>
              <div className={`mt-2 text-xs font-bold ${late ? "text-red-200" : "text-cyan-100"}`}>{timing.label}</div>
              {completion.length > 0 && <div className="mt-3 text-xs leading-5 text-emerald-100"><strong className="mr-2">완료 시</strong>{completion.join(" · ")}</div>}
              <div className={`mt-2 rounded-xl border px-3 py-2 text-xs leading-5 ${failure.length > 0 ? "border-red-400/35 bg-red-400/10 text-red-100" : "border-slate-700/70 bg-slate-950/45 text-slate-400"}`}><AlertTriangle size={13} className="mr-1 inline" /><strong className="mr-2">마감 실패 시</strong>{failure.length > 0 ? failure.join(" · ") : "추가 상태 변화 없음"}</div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
