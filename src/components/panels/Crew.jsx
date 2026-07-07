import { useMemo } from "react";
import { Compass, Cross, Crosshair, User, Users, Utensils, Wrench } from "lucide-react";
import { JOB_DURATION, JOB_ECONOMY } from "../../data/constants";
import { formatMinutes } from "../../data/moduleRecipes";
import { formatGameDate } from "../../systems/gameClock";
import { summarizeCrewAI } from "../../systems/crewAI";
import {
  INJURY_CATALOG,
  PERMANENT_TRAITS,
  getRoleCoverage,
  injuryLabel,
  isHealthy,
  isInjured,
  normalizeInjury,
  treatmentRule,
} from "../../systems/injurySystem";
import { activeLegacyJobs, jobToLegacyRecovery, jobToLegacyTraining, jobToLegacyTreatment } from "../../systems/jobMigration";
import { getPriorityConfig, inferTrainingPriority, inferTreatmentPriority } from "../../systems/priorities";
import { useCrewStore } from "../../stores/crewStore";
import { useGameStore } from "../../stores/gameStore";
import { useJobStore } from "../../stores/jobStore";
import { useShipInteriorStore } from "../../stores/shipInteriorStore";
import { statLabel } from "../../utils/format";
import CrewFacilityStatus from "../crew/CrewFacilityStatus";
import ShipInterior from "../ship/ShipInterior";

const cancelableJobStatuses = new Set(["backlog", "assigned"]);

const ROLE_ICONS = {
  함교: { icon: Compass, color: "text-cyan-300", mark: "🧭" },
  포탑: { icon: Crosshair, color: "text-red-300", mark: "🎯" },
  기관실: { icon: Wrench, color: "text-amber-300", mark: "🛠" },
  의무실: { icon: Cross, color: "text-emerald-300", mark: "✚" },
  조리실: { icon: Utensils, color: "text-orange-300", mark: "🍳" },
};

const TRAINING_COST = JOB_ECONOMY.training.credits;
const TRAINING_MINUTES = JOB_DURATION.training;
const RECOVERY_COST = JOB_ECONOMY.recovery.credits;
const RECOVERY_MINUTES = JOB_DURATION.recovery;
const RECOVERY_FATIGUE = JOB_ECONOMY.recovery.fatigueRecovery;

const trainingByRole = {
  함교: "piloting",
  포탑: "gunnery",
  기관실: "engineering",
  의무실: "medicine",
  조리실: "cooking",
};

const defaultNeeds = { hunger: 0, mood: 60, stress: 20, sleepDebt: 0, hygiene: 80 };

function recoveryPriority(member) {
  if ((member.fatigue ?? 0) >= 75) return "high";
  if ((member.needs?.stress ?? 0) >= 70 || (member.needs?.sleepDebt ?? 0) >= 70) return "high";
  return "normal";
}

function indexByMemberId(entries = []) {
  return new Map(entries.map((entry) => [entry.memberId, entry]));
}

function canCancelTask(task) {
  return Boolean(task?.id && cancelableJobStatuses.has(task.status));
}

function RoleIcon({ role, size = 14 }) {
  const config = ROLE_ICONS[role] ?? { icon: User, color: "text-slate-500" };
  const Icon = config.icon;
  return <Icon size={size} className={config.color} />;
}

function fatigueTone(value) {
  if (value >= 70) return "hud-chip-danger";
  if (value >= 40) return "hud-chip-warn";
  return "hud-chip-success";
}

function needTone(key, value) {
  if (key === "mood") {
    if (value <= 25) return "hud-chip-danger";
    if (value <= 50) return "hud-chip-warn";
    return "hud-chip-success";
  }
  if (key === "hygiene") {
    if (value <= 25) return "hud-chip-danger";
    if (value <= 55) return "hud-chip-warn";
    return "hud-chip-success";
  }
  if (value >= 75) return "hud-chip-danger";
  if (value >= 45) return "hud-chip-warn";
  return "hud-chip-success";
}

function injuryTone(injury, alive = true) {
  if (!alive) return "hud-chip-danger";
  const state = normalizeInjury(injury).state;
  if (state === "healthy") return "hud-chip-success";
  if (state === "minor") return "hud-chip-warn";
  return "hud-chip-danger";
}

function Progress({ task, currentMinute, label }) {
  const raw = task.progress !== undefined ? task.progress * 100 : ((currentMinute - (task.startedAt ?? currentMinute)) / Math.max(1, task.duration ?? 1)) * 100;
  const progress = Math.max(0, Math.min(100, Math.round(raw)));
  const priority = getPriorityConfig(task.priority);
  const completeAt = task.completeAt ?? (task.startedAt ? task.startedAt + task.duration : null);
  return <div className="mt-3 rounded-xl border border-cyan-400/30 bg-cyan-400/10 p-3"><div className="mb-1 flex items-center justify-between text-xs"><span className="hud-label">{label}</span><span className="hud-value">{progress}%</span></div><div className="hud-gauge"><span className="hud-gauge-fill" style={{ width: `${progress}%` }} /></div><div className="mt-2 flex flex-wrap gap-1.5 text-xs"><span className="hud-chip">{completeAt ? `완료 ${formatGameDate(completeAt)}` : "슬롯 대기"}</span><span className={`hud-chip ${priority.tone}`}>우선 {priority.shortLabel}</span>{canCancelTask(task) && <span className="hud-chip hud-chip-warn">재클릭 취소</span>}</div></div>;
}

function InjuryProgress({ injury }) {
  const normalized = normalizeInjury(injury);
  if (normalized.state === "healthy") return null;
  const label = INJURY_CATALOG[normalized.state]?.label ?? "부상";
  return <div className="mt-3 rounded-xl border border-red-400/25 bg-red-400/10 p-3"><div className="mb-1 flex items-center justify-between text-xs"><span className="hud-label">{label} 회복률</span><span className="hud-value">{Math.round(normalized.recoveryProgress ?? 0)}%</span></div><div className="hud-gauge hud-gauge-warn"><span className="hud-gauge-fill" style={{ width: `${normalized.recoveryProgress ?? 0}%` }} /></div><div className="mt-2 flex flex-wrap gap-1.5 text-xs">{normalized.treatedBy && <span className="hud-chip hud-chip-accent">치료 중</span>}{(normalized.untreatedMinutes ?? 0) > 0 && <span className="hud-chip hud-chip-warn">미치료 {formatMinutes(Math.round(normalized.untreatedMinutes))}</span>}</div></div>;
}

function Info({ label, value, tone = "" }) {
  return <div className="rounded-xl border border-slate-700/70 bg-slate-900/70 px-3 py-2"><div className="hud-label">{label}</div><div className={`hud-value mt-1 ${tone}`}>{value}</div></div>;
}

function NeedGrid({ member }) {
  const needs = { ...defaultNeeds, ...(member.needs ?? {}) };
  const entries = [["hunger", "배고픔", needs.hunger], ["mood", "기분", needs.mood], ["stress", "스트레스", needs.stress], ["sleepDebt", "수면", needs.sleepDebt], ["hygiene", "위생", needs.hygiene]];
  return <div className="mt-3 grid grid-cols-5 gap-1.5 text-xs">{entries.map(([key, label, value]) => <div key={key} className={`rounded-xl border border-slate-700/70 bg-slate-950/55 p-2 text-center ${needTone(key, value)}`}><div className="font-black tabular-nums">{Math.round(value)}</div><div className="mt-0.5 truncate text-[10px] text-slate-400">{label}</div></div>)}</div>;
}

function ActivityCard({ activity }) {
  if (!activity) return <div className="mt-3 rounded-xl border border-slate-700/70 bg-slate-950/55 p-3 text-sm text-slate-400">AI 대기 중</div>;
  const priority = getPriorityConfig(activity.priority);
  return <div className="mt-3 rounded-xl border border-sky-400/30 bg-sky-400/10 p-3 text-sm"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="hud-label">AI ORDER</div><div className="mt-1 truncate font-semibold text-slate-100">{activity.station} · {activity.action}</div></div><span className={`hud-chip shrink-0 ${priority.tone}`}>{priority.shortLabel}</span></div></div>;
}

function CrewPortrait({ member }) {
  const config = ROLE_ICONS[member.role] ?? { mark: "👤" };
  const fatigue = Math.round(member.fatigue ?? 0);
  const condition = Math.max(0, 100 - fatigue);
  return <div className="relative grid h-28 place-items-center overflow-hidden rounded-2xl border border-cyan-300/20 bg-cyan-300/10"><div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(125,211,252,0.22),transparent_56%)]" /><div className="relative grid h-16 w-16 place-items-center rounded-2xl border border-slate-500/35 bg-slate-950/65 text-3xl">{config.mark}</div><span className="absolute right-2 top-2 hud-chip bg-slate-950/70">{condition}%</span></div>;
}

export default function Crew() {
  const { crew, trainingQueue: legacyTrainingQueue, treatmentQueue: legacyTreatmentQueue, crewActivities, crewActivityLog } = useCrewStore();
  const rawJobs = useJobStore((state) => state.jobs);
  const jobTrainingQueue = useMemo(() => activeLegacyJobs(rawJobs, jobToLegacyTraining), [rawJobs]);
  const jobTreatmentQueue = useMemo(() => activeLegacyJobs(rawJobs, jobToLegacyTreatment), [rawJobs]);
  const recoveryQueue = useMemo(() => activeLegacyJobs(rawJobs, jobToLegacyRecovery), [rawJobs]);
  const trainingQueue = useMemo(() => [...jobTrainingQueue, ...(legacyTrainingQueue ?? [])], [legacyTrainingQueue, jobTrainingQueue]);
  const treatmentQueue = useMemo(() => [...jobTreatmentQueue, ...(legacyTreatmentQueue ?? [])], [legacyTreatmentQueue, jobTreatmentQueue]);
  const startTraining = useJobStore((state) => state.enqueueTraining);
  const startTreatment = useJobStore((state) => state.enqueueTreatment);
  const startRecovery = useJobStore((state) => state.enqueueRecovery);
  const cancelJob = useJobStore((state) => state.cancelJob);
  const currentMinute = useGameStore((state) => state.currentMinute);
  const resources = useGameStore((state) => state.resources);
  const spendCredits = useGameStore((state) => state.spendCredits);
  const addResources = useGameStore((state) => state.addResources);
  const addLog = useGameStore((state) => state.addLog);
  const rooms = useShipInteriorStore((state) => state.rooms);
  const activeCrises = useShipInteriorStore((state) => state.activeCrises ?? []);

  const aiSummary = summarizeCrewAI(crewActivities ?? []);
  const coverage = getRoleCoverage(crew);
  const coverageCounts = coverage.counts ?? {};
  const missingRoles = coverage.missingRoles ?? [];
  const roomCount = Object.keys(rooms ?? {}).length;
  const injuredCrewCount = useMemo(() => crew.filter((member) => member.alive && isInjured(member.injury)).length, [crew]);
  const taskByMemberId = useMemo(() => ({ training: indexByMemberId(trainingQueue), treatment: indexByMemberId(treatmentQueue), recovery: indexByMemberId(recoveryQueue) }), [trainingQueue, treatmentQueue, recoveryQueue]);
  const activityByMemberId = useMemo(() => indexByMemberId(crewActivities ?? []), [crewActivities]);
  const busy = (memberId) => taskByMemberId.training.has(memberId) || taskByMemberId.treatment.has(memberId) || taskByMemberId.recovery.has(memberId);

  const refundCancelledCrewJob = (task, fallbackCost, label) => {
    const refund = Math.floor((task.cost ?? fallbackCost) * (JOB_ECONOMY.cancelRefundRatio ?? 0.5));
    if (refund > 0) addResources({ credits: refund });
    addLog(`${label} 취소: ${refund > 0 ? `₢${refund} 환급.` : "환급 없음."}`);
  };

  const cancelQueuedCrewJob = (task, fallbackCost, label) => {
    if (!canCancelTask(task)) return addLog(`${label} 취소 불가: 이미 진행 중이거나 구버전 작업 큐입니다.`);
    const result = cancelJob(task.id);
    if (!result.ok) return addLog(`${label} 취소 실패: ${result.reason}.`);
    refundCancelledCrewJob(result.job ?? task, fallbackCost, label);
    return null;
  };

  const train = (member, trainingTask) => {
    if (trainingTask) return cancelQueuedCrewJob(trainingTask, TRAINING_COST, `${member.name} 훈련`);
    if (!member.alive || busy(member.id)) return addLog(`${member.name} 훈련 불가: 현재 작업을 확인하세요.`);
    if (!isHealthy(member.injury)) return addLog(`${member.name} 훈련 불가: 부상 회복이 먼저입니다.`);
    if (!spendCredits(TRAINING_COST)) return addLog(`${member.name} 훈련 실패: 크레딧 부족.`);
    const statKey = trainingByRole[member.role] ?? "scouting";
    const completeAt = currentMinute + TRAINING_MINUTES;
    const priority = inferTrainingPriority(member);
    startTraining({ memberId: member.id, statKey, completeAt, cost: TRAINING_COST, duration: TRAINING_MINUTES, priority, createdAt: currentMinute });
    return addLog(`${member.name} 훈련 대기열 등록: ${statLabel[statKey] ?? statKey} +1, 우선순위 ${getPriorityConfig(priority).label}, ₢${TRAINING_COST}, ${formatMinutes(TRAINING_MINUTES)}.`);
  };

  const recover = (member, recoveryTask) => {
    if (recoveryTask) return cancelQueuedCrewJob(recoveryTask, RECOVERY_COST, `${member.name} 회복`);
    if (!member.alive || busy(member.id)) return addLog(`${member.name} 회복 불가: 현재 작업을 확인하세요.`);
    if (!spendCredits(RECOVERY_COST)) return addLog(`${member.name} 회복 실패: 크레딧 부족.`);
    const completeAt = currentMinute + RECOVERY_MINUTES;
    const priority = recoveryPriority(member);
    startRecovery({ memberId: member.id, completeAt, cost: RECOVERY_COST, duration: RECOVERY_MINUTES, fatigueRecovery: RECOVERY_FATIGUE, priority, createdAt: currentMinute });
    return addLog(`${member.name} 회복 절차 대기열 등록: 의무실 슬롯 필요, 우선순위 ${getPriorityConfig(priority).label}, ₢${RECOVERY_COST}, ${formatMinutes(RECOVERY_MINUTES)}.`);
  };

  const treat = (member, treatmentTask) => {
    const rule = treatmentRule(member.injury);
    if (treatmentTask) return cancelQueuedCrewJob(treatmentTask, rule.cost, `${member.name} 치료`);
    if (!member.alive || !isInjured(member.injury) || busy(member.id)) return addLog(`${member.name} 치료 불가: 상태 또는 작업 큐를 확인하세요.`);
    const label = injuryLabel(member.injury);
    if (!spendCredits(rule.cost)) return addLog(`${member.name} 치료 실패: 크레딧 부족.`);
    const completeAt = currentMinute + rule.minutes;
    const priority = inferTreatmentPriority(label);
    startTreatment({ memberId: member.id, injury: label, completeAt, cost: rule.cost, duration: rule.minutes, fatiguePenalty: rule.fatiguePenalty, priority, createdAt: currentMinute });
    return addLog(`${member.name} 치료 대기열 등록: ${label}, 우선순위 ${getPriorityConfig(priority).label}, ₢${rule.cost}, ${formatMinutes(rule.minutes)}.`);
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
      <section>
        <div className="flex items-start justify-between gap-3"><div><div className="section-title"><Users size={18} />승무원 스쿼드</div><p className="mt-2 text-sm text-slate-400">승무원 상태를 카드/컨디션 중심으로 확인합니다.</p></div><div className="flex flex-wrap justify-end gap-1.5"><span className="hud-chip hud-chip-accent">AI {aiSummary.total}</span><span className="hud-chip">긴급 {aiSummary.emergency}</span><span className="hud-chip">부상 {injuredCrewCount}</span></div></div>
        {missingRoles.length > 0 && <div className="mt-3 rounded-xl border border-amber-300/35 bg-amber-300/10 p-3 text-sm leading-6 text-amber-100">역할 공백: {missingRoles.join(", ")}</div>}
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {crew.map((member) => {
            const mainStat = trainingByRole[member.role] ?? "scouting";
            const trainingTask = taskByMemberId.training.get(member.id);
            const treatmentTask = taskByMemberId.treatment.get(member.id);
            const recoveryTask = taskByMemberId.recovery.get(member.id);
            const activity = activityByMemberId.get(member.id);
            const isInjuredNow = isInjured(member.injury);
            const rule = treatmentRule(member.injury);
            const injury = normalizeInjury(member.injury);
            const actionGridClass = isInjuredNow ? "grid-cols-3" : "grid-cols-2";
            return (
              <article key={member.id} className={`mission-contract-card rounded-2xl border p-3 ${member.alive ? "border-slate-700/70 bg-slate-950/60" : "border-red-900/70 bg-red-950/20 opacity-80"}`}>
                <CrewPortrait member={member} />
                <div className="mt-3 flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex items-center gap-2"><RoleIcon role={member.role} size={16} /><div className="truncate font-black text-slate-100">{member.name}</div></div><div className="mt-1 truncate text-xs text-slate-500">{member.role} · {member.trait ?? "일반 대원"}</div></div><span className={`hud-chip shrink-0 ${injuryTone(member.injury, member.alive)}`}>{!member.alive ? "전사" : injuryLabel(member.injury)}</span></div>
                <ActivityCard activity={activity} />
                <div className="mt-3 grid grid-cols-3 gap-2 text-sm"><Info label="피로" value={`${Math.round(member.fatigue ?? 0)}%`} tone={fatigueTone(member.fatigue ?? 0)} /><Info label="사기" value={member.morale ?? "보통"} /><Info label="경험" value={member.experience ?? 0} /></div>
                <NeedGrid member={member} />
                <InjuryProgress injury={member.injury} />
                {trainingTask && <Progress task={trainingTask} currentMinute={currentMinute} label="훈련 진행" />}
                {treatmentTask && <Progress task={treatmentTask} currentMinute={currentMinute} label="치료 진행" />}
                {recoveryTask && <Progress task={recoveryTask} currentMinute={currentMinute} label="회복 진행" />}
                {injury.permanentTraits.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{injury.permanentTraits.map((trait) => <span key={trait} className="hud-chip hud-chip-warn">{PERMANENT_TRAITS[trait]?.label ?? trait}</span>)}</div>}
                <div className="mt-3 flex flex-wrap gap-1.5">{Object.entries(member.stats ?? {}).map(([key, value]) => <span key={key} className={`mission-reward-icon ${key === mainStat ? "border-cyan-300/45 bg-cyan-300/10" : ""}`}>{statLabel[key] ?? key} {value}</span>)}</div>
                <div className={`mt-4 grid ${actionGridClass} gap-2`}>
                  <button className="secondary-button justify-center" disabled={!member.alive || Boolean(treatmentTask || recoveryTask) || (!trainingTask && (!isHealthy(member.injury) || resources.credits < TRAINING_COST)) || (trainingTask && !canCancelTask(trainingTask))} onClick={() => train(member, trainingTask)}>{trainingTask ? canCancelTask(trainingTask) ? "훈련 취소" : "훈련 중" : treatmentTask ? "치료 중" : recoveryTask ? "회복 중" : "훈련"}</button>
                  <button className="secondary-button justify-center" disabled={!member.alive || Boolean(trainingTask || treatmentTask) || (!recoveryTask && resources.credits < RECOVERY_COST) || (recoveryTask && !canCancelTask(recoveryTask))} onClick={() => recover(member, recoveryTask)}>{recoveryTask ? canCancelTask(recoveryTask) ? "회복 취소" : "회복 중" : treatmentTask ? "치료 중" : trainingTask ? "훈련 중" : "회복"}</button>
                  {isInjuredNow && <button className="secondary-button justify-center" disabled={!member.alive || Boolean(trainingTask || recoveryTask) || (!treatmentTask && resources.credits < rule.cost) || (treatmentTask && !canCancelTask(treatmentTask))} onClick={() => treat(member, treatmentTask)}>{treatmentTask ? canCancelTask(treatmentTask) ? "치료 취소" : "치료 중" : recoveryTask ? "회복 중" : "치료"}</button>}
                </div>
              </article>
            );
          })}
        </div>
      </section>
      <div className="grid gap-4">
        <ShipInterior crew={crew} activities={crewActivities ?? []} rooms={rooms} activeCrises={activeCrises} />
        <CrewFacilityStatus />
        <section><div className="section-title">역할 커버리지</div><div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">{Object.entries(coverageCounts).map(([role, value]) => <Info key={role} label={role} value={`${value}명`} />)}</div></section>
        <section className="rounded-2xl border border-slate-700/70 bg-slate-950/60 p-4"><div className="section-title">함내 상황</div><div className="mt-3 grid grid-cols-3 gap-2 text-sm"><Info label="방" value={roomCount} /><Info label="위기" value={activeCrises.length} /><Info label="AI 로그" value={crewActivityLog?.length ?? 0} /></div></section>
        <section className="rounded-2xl border border-slate-700/70 bg-slate-950/60 p-4"><div className="section-title">최근 AI 배정</div><div className="mt-3 grid gap-2">{(crewActivityLog ?? []).slice(0, 6).map((entry, index) => <div key={`${entry}-${index}`} className="rounded-xl border border-slate-700/70 bg-slate-900/70 px-3 py-2 text-xs text-slate-300">{entry}</div>)}{(crewActivityLog ?? []).length === 0 && <div className="text-sm text-slate-500">게임 시간이 흐르면 승무원 AI 배정 기록이 여기에 표시됩니다.</div>}</div></section>
      </div>
    </div>
  );
}
