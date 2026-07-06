import { useMemo } from "react";
import { Activity, ChefHat, Clock3, Utensils } from "lucide-react";
import { formatMinutes } from "../../data/moduleRecipes";
import { formatGameDate } from "../../systems/gameClock";
import { jobTypeLabel } from "../../systems/jobMigration";
import { useCrewStore } from "../../stores/crewStore";
import { useInventoryStore } from "../../stores/inventoryStore";
import { useJobStore } from "../../stores/jobStore";

const ACTIVE_JOB_STATUSES = new Set(["assigned", "in_progress"]);
const BACKLOG_STATUS = "backlog";
const MEAL_INTENTS = new Set(["meal"]);

function itemQty(items, itemId) {
  return items.find((item) => item.id === itemId)?.qty ?? 0;
}

function memberName(crew, memberId) {
  return crew.find((member) => member.id === memberId)?.name ?? "승무원";
}

function jobMemberName(crew, job) {
  return memberName(crew, job.payload?.targetCrewId ?? job.assignedCrewId);
}

function jobTimeLabel(job) {
  if (job.status === BACKLOG_STATUS) return "대기 중";
  if (!job.startedAt) return "이동 중";
  const completeAt = job.startedAt + job.duration;
  return `${Math.round((job.progress ?? 0) * 100)}% · ${formatGameDate(completeAt)}`;
}

function MiniJob({ crew, job }) {
  return (
    <div className="rounded-xl border border-slate-700/70 bg-slate-900/70 px-3 py-2 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-slate-100">{jobTypeLabel(job.type)}</span>
        <span className={`hud-chip ${job.status === BACKLOG_STATUS ? "hud-chip-warn" : "hud-chip-accent"}`}>{job.status}</span>
      </div>
      <div className="mt-1 text-slate-400">{jobMemberName(crew, job)} · {jobTimeLabel(job)}</div>
    </div>
  );
}

function FacilityCard({ icon: Icon, title, subtitle, capacity, activeCount, children, tone = "border-slate-700/70 bg-slate-950/60" }) {
  const full = capacity > 0 && activeCount >= capacity;
  return (
    <section className={`rounded-2xl border p-4 ${tone}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-slate-950/55">
            <Icon size={18} />
          </div>
          <div className="min-w-0">
            <div className="font-black text-slate-50">{title}</div>
            <p className="mt-1 text-sm leading-5 text-slate-400">{subtitle}</p>
          </div>
        </div>
        <span className={`hud-chip shrink-0 ${full ? "hud-chip-warn" : "hud-chip-success"}`}>슬롯 {activeCount}/{capacity}</span>
      </div>
      <div className="mt-3 grid gap-2">{children}</div>
    </section>
  );
}

export default function CrewFacilityStatus() {
  const jobs = useJobStore((state) => state.jobs);
  const jobRooms = useJobStore((state) => state.rooms);
  const crew = useCrewStore((state) => state.crew);
  const crewActivities = useCrewStore((state) => state.crewActivities ?? []);
  const items = useInventoryStore((state) => state.items);

  const medbayJobs = useMemo(() => jobs.filter((job) => job.roomId === "medbay" && [BACKLOG_STATUS, ...ACTIVE_JOB_STATUSES].includes(job.status)), [jobs]);
  const medbayActive = medbayJobs.filter((job) => ACTIVE_JOB_STATUSES.has(job.status));
  const medbayBacklog = medbayJobs.filter((job) => job.status === BACKLOG_STATUS);
  const mealActivities = crewActivities.filter((activity) => MEAL_INTENTS.has(activity.intent));
  const foodRations = itemQty(items, "food-ration");
  const ingredients = itemQty(items, "raw-ingredients");
  const cooks = crew.filter((member) => member.alive && member.role === "조리실");
  const medbayCapacity = jobRooms.medbay?.slotCapacity ?? 1;
  const galleyCapacity = jobRooms.galley?.slotCapacity ?? 2;

  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <FacilityCard icon={Activity} title="의무실/회복실" subtitle="회복·치료 대상이 실제 슬롯을 점유합니다." capacity={medbayCapacity} activeCount={medbayActive.length} tone="border-emerald-300/35 bg-emerald-300/10">
        {medbayActive.map((job) => <MiniJob key={job.id} crew={crew} job={job} />)}
        {medbayActive.length === 0 && <div className="rounded-xl border border-slate-700/70 bg-slate-900/70 px-3 py-2 text-xs text-slate-400">현재 의무실 슬롯 사용 없음</div>}
        <div className="flex flex-wrap gap-1.5 text-xs">
          <span className="hud-chip">대기 {medbayBacklog.length}</span>
          <span className="hud-chip"><Clock3 size={12} /> 회복 {formatMinutes(180)}</span>
        </div>
      </FacilityCard>

      <FacilityCard icon={ChefHat} title="식당/조리실" subtitle="배고픈 승무원이 식량을 소모해 식사합니다." capacity={galleyCapacity} activeCount={mealActivities.length} tone="border-orange-300/35 bg-orange-300/10">
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="mission-stat-tile"><span>표준 식량</span><span>{foodRations}</span></div>
          <div className="mission-stat-tile"><span>식재료</span><span>{ingredients}</span></div>
          <div className="mission-stat-tile"><span>요리사</span><span>{cooks.length}</span></div>
        </div>
        {mealActivities.slice(0, galleyCapacity).map((activity) => (
          <div key={`${activity.memberId}-${activity.updatedAt}`} className="rounded-xl border border-slate-700/70 bg-slate-900/70 px-3 py-2 text-xs text-slate-300">
            <Utensils size={12} className="mr-1 inline" />{memberName(crew, activity.memberId)} · {activity.action} · {activity.detail ?? "식사"}
          </div>
        ))}
        {mealActivities.length === 0 && <div className="rounded-xl border border-slate-700/70 bg-slate-900/70 px-3 py-2 text-xs text-slate-400">식사 중인 승무원 없음</div>}
      </FacilityCard>
    </section>
  );
}
