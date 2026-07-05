import { Compass, Cross, Crosshair, User, Users, Wrench } from "lucide-react";
import { formatMinutes } from "../../data/moduleRecipes";
import { formatGameDate } from "../../systems/gameClock";
import { summarizeCrewAI } from "../../systems/crewAI";
import { INJURY_CATALOG, PERMANENT_TRAITS, getRoleCoverage, injuryLabel, isHealthy, isInjured, normalizeInjury } from "../../systems/injurySystem";
import { getPriorityConfig, inferTrainingPriority, inferTreatmentPriority } from "../../systems/priorities";
import { useCrewStore } from "../../stores/crewStore";
import { useGameStore } from "../../stores/gameStore";
import { useShipInteriorStore } from "../../stores/shipInteriorStore";
import { statLabel } from "../../utils/format";
import ShipInterior from "../ship/ShipInterior";

const ROLE_ICONS = {
  함교: { icon: Compass, color: "text-cyan-400" },
  포탑: { icon: Crosshair, color: "text-red-400" },
  기관실: { icon: Wrench, color: "text-amber-400" },
  의무실: { icon: Cross, color: "text-emerald-400" },
};
const TRAINING_COST = 180;
const TRAINING_MINUTES = 360;
const TREATMENT = {
  minor: { cost: 140, minutes: 180, fatiguePenalty: 8 },
  serious: { cost: 420, minutes: 720, fatiguePenalty: 18 },
  critical: { cost: 720, minutes: 1080, fatiguePenalty: 28 },
  incapacitated: { cost: 980, minutes: 1440, fatiguePenalty: 35 },
};
const trainingByRole = { 함교: "piloting", 포탑: "gunnery", 기관실: "engineering", 의무실: "medicine" };
const defaultNeeds = { hunger: 0, mood: 60, stress: 20, sleepDebt: 0, hygiene: 80 };

function treatmentRule(injury) {
  const state = normalizeInjury(injury).state;
  return TREATMENT[state] ?? { cost: 220, minutes: 300, fatiguePenalty: 10 };
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
  const progress = Math.max(0, Math.min(100, Math.round(((currentMinute - task.startedAt) / Math.max(1, task.duration)) * 100)));
  const priority = getPriorityConfig(task.priority);
  return <div className="mt-3 rounded border border-cyan-400/30 bg-cyan-400/10 p-3"><div className="mb-1 flex items-center justify-between text-xs"><span className="hud-label">{label}</span><span className="hud-value">{progress}%</span></div><div className="hud-gauge"><span className="hud-gauge-fill" style={{ width: `${progress}%` }} /></div><div className="mt-2 flex flex-wrap gap-1.5 text-xs"><span className="hud-chip">완료 {formatGameDate(task.completeAt)}</span><span className={`hud-chip ${priority.tone}`}>우선 {priority.shortLabel}</span></div></div>;
}

function InjuryProgress({ injury }) {
  const normalized = normalizeInjury(injury);
  if (normalized.state === "healthy") return null;
  const label = INJURY_CATALOG[normalized.state]?.label ?? "부상";
  return <div className="mt-3 rounded border border-red-400/25 bg-red-400/10 p-3"><div className="mb-1 flex items-center justify-between text-xs"><span className="hud-label">{label} 회복률</span><span className="hud-value">{Math.round(normalized.recoveryProgress ?? 0)}%</span></div><div className="hud-gauge hud-gauge-warn"><span className="hud-gauge-fill" style={{ width: `${normalized.recoveryProgress ?? 0}%` }} /></div><div className="mt-2 flex flex-wrap gap-1.5 text-xs">{normalized.treatedBy && <span className="hud-chip hud-chip-accent">치료 중</span>}{(normalized.untreatedMinutes ?? 0) > 0 && <span className="hud-chip hud-chip-warn">미치료 {formatMinutes(Math.round(normalized.untreatedMinutes))}</span>}</div></div>;
}

function Info({ label, value, tone = "" }) {
  return <div className="rounded border border-slate-700/70 bg-slate-900/70 px-3 py-2"><div className="hud-label">{label}</div><div className={`hud-value mt-1 ${tone}`}>{value}</div></div>;
}

function NeedGrid({ member }) {
  const needs = { ...defaultNeeds, ...(member.needs ?? {}) };
  const entries = [
    ["hunger", "배고픔", needs.hunger],
    ["mood", "기분", needs.mood],
    ["stress", "스트레스", needs.stress],
    ["sleepDebt", "수면부채", needs.sleepDebt],
    ["hygiene", "위생", needs.hygiene],
  ];
  return <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">{entries.map(([key, label, value]) => <Info key={key} label={label} value={`${Math.round(value)}`} tone={needTone(key, value)} />)}</div>;
}

function ActivityCard({ activity }) {
  if (!activity) return null;
  const priority = getPriorityConfig(activity.priority);
  return <div className="mt-3 rounded border border-sky-400/30 bg-sky-400/10 p-3 text-sm"><div className="flex items-start justify-between gap-2"><div><div className="hud-label">AI CURRENT ORDER</div><div className="mt-1 font-semibold text-slate-100">{activity.station} · {activity.action}</div><div className="mt-1 text-xs text-slate-400">{activity.detail}</div></div><span className={`hud-chip shrink-0 ${priority.tone}`}>{priority.shortLabel}</span></div></div>;
}

export default function Crew() {
  const { crew, trainingQueue, treatmentQueue, crewActivities, crewActivityLog, startTraining, startTreatment, restMember } = useCrewStore();
  const currentMinute = useGameStore((state) => state.currentMinute);
  const resources = useGameStore((state) => state.resources);
  const spendCredits = useGameStore((state) => state.spendCredits);
  const addLog = useGameStore((state) => state.addLog);
  const rooms = useShipInteriorStore((state) => state.rooms);
  const activeCrises = useShipInteriorStore((state) => state.activeCrises ?? []);
  const aiSummary = summarizeCrewAI(crewActivities ?? []);
  const coverage = getRoleCoverage(crew);
  const busy = (memberId) => trainingQueue.some((task) => task.memberId === memberId) || treatmentQueue.some((task) => task.memberId === memberId);

  const train = (member) => {
    if (!member.alive || busy(member.id)) return addLog(`${member.name} 훈련 불가: 현재 작업을 확인하세요.`);
    if (!isHealthy(member.injury)) return addLog(`${member.name} 훈련 불가: 부상 회복이 먼저입니다.`);
    if (!spendCredits(TRAINING_COST)) return addLog(`${member.name} 훈련 실패: 크레딧 부족.`);
    const statKey = trainingByRole[member.role] ?? "scouting";
    const completeAt = currentMinute + TRAINING_MINUTES;
    const priority = inferTrainingPriority(member);
    startTraining({ memberId: member.id, statKey, completeAt, cost: TRAINING_COST, duration: TRAINING_MINUTES, priority });
    addLog(`${member.name} 훈련 시작: ${statLabel[statKey]} +1, 우선순위 ${getPriorityConfig(priority).label}, ₢${TRAINING_COST}, 완료 ${formatGameDate(completeAt)}.`);
  };

  const rest = (member) => {
    if (!member.alive || busy(member.id)) return addLog(`${member.name} 휴식 불가: 현재 작업을 확인하세요.`);
    restMember(member.id);
    addLog(`${member.name} 휴식 완료: 피로·배고픔·스트레스 감소, 기분 개선.`);
  };

  const treat = (member) => {
    if (!member.alive || !isInjured(member.injury) || busy(member.id)) return addLog(`${member.name} 치료 불가: 상태 또는 작업 큐를 확인하세요.`);
    const rule = treatmentRule(member.injury);
    if (!spendCredits(rule.cost)) return addLog(`${member.name} 치료 실패: 크레딧 부족.`);
    const completeAt = currentMinute + rule.minutes;
    const priority = inferTreatmentPriority(injuryLabel(member.injury));
    startTreatment({ memberId: member.id, injury: member.injury, completeAt, cost: rule.cost, duration: rule.minutes, fatiguePenalty: rule.fatiguePenalty, priority });
    addLog(`${member.name} 치료 시작: ${injuryLabel(member.injury)}, 우선순위 ${getPriorityConfig(priority).label}, ₢${rule.cost}, ${formatMinutes(rule.minutes)}, 완료 ${formatGameDate(completeAt)}.`);
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
      <section>
        <div className="section-title"><Users size={18} />승무원 스쿼드</div>
        <div className="mt-4 grid grid-cols-4 gap-2 text-sm"><Info label="AI 활동" value={`${aiSummary.total}명`} /><Info label="긴급" value={`${aiSummary.emergency}명`} tone={aiSummary.emergency > 0 ? "text-red-300" : ""} /><Info label="역할 공백" value={`${coverage.missingRoles.length}개`} tone={coverage.missingRoles.length > 0 ? "text-amber-300" : ""} /><Info label="부상" value={`${crew.filter((member) => member.alive && isInjured(member.injury)).length}명`} /></div>
        {coverage.missingRoles.length > 0 && <div className="mt-3 rounded border border-amber-300/35 bg-amber-300/10 p-3 text-sm leading-6 text-amber-100">역할 공백: {coverage.missingRoles.join(", ")} · 해당 역할 승무원이 중상 이상이면 함선 페널티가 발생합니다.</div>}
        <div className="mt-4 rounded border border-slate-700/70 bg-slate-950/60 p-4 text-sm leading-6 text-slate-300">승무원은 함선 내부에서 AI 명령에 따라 이동합니다. 이제 피로·배고픔·기분·스트레스·수면부채·위생이 시간과 표류 상황에 따라 변합니다.</div>
        <div className="mt-4 grid gap-3">
          {crew.map((member) => {
            const mainStat = trainingByRole[member.role] ?? "scouting";
            const trainingTask = trainingQueue.find((task) => task.memberId === member.id);
            const treatmentTask = treatmentQueue.find((task) => task.memberId === member.id);
            const activity = (crewActivities ?? []).find((entry) => entry.memberId === member.id);
            const isBusy = Boolean(trainingTask || treatmentTask);
            const rule = treatmentRule(member.injury);
            const injury = normalizeInjury(member.injury);
            return (
              <div key={member.id} className={`rounded border p-4 ${member.alive ? "border-slate-700/70 bg-slate-950/60" : "border-red-900/70 bg-red-950/20 opacity-80"}`}>
                <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex items-center gap-2"><RoleIcon role={member.role} size={16} /><div className="font-semibold text-slate-100">{member.name}</div></div><div className="mt-1 text-xs text-slate-500">{member.role} · {member.trait ?? "일반 대원"}</div></div><span className={`hud-chip ${injuryTone(member.injury, member.alive)}`}>{!member.alive ? "전사" : injuryLabel(member.injury)}</span></div>
                <ActivityCard activity={activity} />
                <div className="mt-3 grid grid-cols-3 gap-2 text-sm"><Info label="사기" value={member.morale} /><Info label="피로" value={`${Math.round(member.fatigue ?? 0)}`} tone={fatigueTone(member.fatigue ?? 0)} /><Info label="경험" value={`${member.experience ?? 0}`} /></div>
                <NeedGrid member={member} />
                <InjuryProgress injury={member.injury} />
                {trainingTask && <Progress task={trainingTask} currentMinute={currentMinute} label="훈련 진행 중" />}
                {treatmentTask && <Progress task={treatmentTask} currentMinute={currentMinute} label="치료 예약 진행" />}
                {injury.permanentTraits.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{injury.permanentTraits.map((trait) => <span key={trait} className="hud-chip hud-chip-warn">{PERMANENT_TRAITS[trait]?.label ?? trait}</span>)}</div>}
                <div className="mt-3 flex flex-wrap gap-1.5">{Object.entries(member.stats).map(([key, value]) => <span key={key} className={`hud-chip ${key === mainStat ? "hud-chip-accent" : ""}`}>{statLabel[key]} {value}</span>)}</div>
                <div className="mt-4 grid grid-cols-3 gap-2"><button className="secondary-button" disabled={!member.alive || isBusy || !isHealthy(member.injury) || resources.credits < TRAINING_COST} onClick={() => train(member)}>{trainingTask ? "훈련 중" : treatmentTask ? "치료 중" : `훈련 ₢${TRAINING_COST}`}</button><button className="secondary-button" disabled={!member.alive || isBusy} onClick={() => rest(member)}>휴식</button><button className="secondary-button" disabled={!member.alive || !isInjured(member.injury) || isBusy || resources.credits < rule.cost} onClick={() => treat(member)}>{treatmentTask ? "치료 중" : !isInjured(member.injury) ? "정상" : `치료 ₢${rule.cost}`}</button></div>
              </div>
            );
          })}
        </div>
      </section>
      <div className="grid gap-4">
        <ShipInterior crew={crew} activities={crewActivities ?? []} rooms={rooms} activeCrises={activeCrises} />
        <section>
          <div className="section-title">스쿼드 종합표</div>
          <div className="mt-4 overflow-auto rounded border border-slate-700/70">
            <table className="data-table"><thead><tr><th>이름</th><th>역할</th><th>현재 AI 행동</th>{Object.values(statLabel).map((label) => <th key={label}>{label}</th>)}<th>피로</th><th>배고픔</th><th>기분</th><th>스트레스</th><th>상태</th></tr></thead><tbody>{crew.map((member) => { const activity = (crewActivities ?? []).find((entry) => entry.memberId === member.id); const needs = { ...defaultNeeds, ...(member.needs ?? {}) }; return <tr key={member.id} className={!member.alive ? "opacity-60" : ""}><td className="font-semibold text-slate-100">{member.name}</td><td><span className="inline-flex items-center gap-1.5"><RoleIcon role={member.role} />{member.role}</span></td><td>{activity ? `${activity.station} · ${activity.action}` : "대기"}</td>{Object.keys(statLabel).map((key) => <td key={key} className="font-mono tabular-nums">{member.stats[key]}</td>)}<td><span className={`hud-chip ${fatigueTone(member.fatigue ?? 0)}`}>{Math.round(member.fatigue ?? 0)}</span></td><td><span className={`hud-chip ${needTone("hunger", needs.hunger)}`}>{Math.round(needs.hunger)}</span></td><td><span className={`hud-chip ${needTone("mood", needs.mood)}`}>{Math.round(needs.mood)}</span></td><td><span className={`hud-chip ${needTone("stress", needs.stress)}`}>{Math.round(needs.stress)}</span></td><td><span className={`hud-chip ${injuryTone(member.injury, member.alive)}`}>{!member.alive ? "전사" : injuryLabel(member.injury)}</span></td></tr>; })}</tbody></table>
          </div>
        </section>
        <section className="rounded border border-slate-700/70 bg-slate-950/60 p-4"><div className="section-title">최근 AI 배정 기록</div><div className="mt-3 grid gap-2">{(crewActivityLog ?? []).slice(0, 8).map((entry, index) => <div key={`${entry}-${index}`} className="rounded border border-slate-700/70 bg-slate-900/70 px-3 py-2 text-xs text-slate-300">{entry}</div>)}{(crewActivityLog ?? []).length === 0 && <div className="text-sm text-slate-500">게임 시간이 흐르면 승무원 AI 배정 기록이 여기에 표시됩니다.</div>}</div></section>
      </div>
    </div>
  );
}
