import { Compass, Cross, Crosshair, User, Users, Wrench } from "lucide-react";
import { formatMinutes } from "../../data/moduleRecipes";
import { formatGameDate } from "../../systems/gameClock";
import { summarizeCrewAI } from "../../systems/crewAI";
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
  경상: { cost: 140, minutes: 180, fatiguePenalty: 8 },
  중상: { cost: 420, minutes: 720, fatiguePenalty: 18 },
};
const trainingByRole = { 함교: "piloting", 포탑: "gunnery", 기관실: "engineering", 의무실: "medicine" };

function treatmentRule(injury) {
  return TREATMENT[injury] ?? { cost: 220, minutes: 300, fatiguePenalty: 10 };
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

function Progress({ task, currentMinute, label }) {
  const progress = Math.max(0, Math.min(100, Math.round(((currentMinute - task.startedAt) / Math.max(1, task.duration)) * 100)));
  const priority = getPriorityConfig(task.priority);
  return (
    <div className="mt-3 rounded border border-cyan-400/30 bg-cyan-400/10 p-3">
      <div className="mb-1 flex items-center justify-between text-xs"><span className="hud-label">{label}</span><span className="hud-value">{progress}%</span></div>
      <div className="hud-gauge"><span className="hud-gauge-fill" style={{ width: `${progress}%` }} /></div>
      <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
        <span className="hud-chip">완료 {formatGameDate(task.completeAt)}</span>
        <span className={`hud-chip ${priority.tone}`}>우선 {priority.shortLabel}</span>
      </div>
    </div>
  );
}

function Info({ label, value, tone = "" }) {
  return <div className="rounded border border-slate-700/70 bg-slate-900/70 px-3 py-2"><div className="hud-label">{label}</div><div className={`hud-value mt-1 ${tone}`}>{value}</div></div>;
}

function ActivityCard({ activity }) {
  if (!activity) return null;
  const priority = getPriorityConfig(activity.priority);
  return (
    <div className="mt-3 rounded border border-sky-400/30 bg-sky-400/10 p-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="hud-label">AI CURRENT ORDER</div>
          <div className="mt-1 font-semibold text-slate-100">{activity.station} · {activity.action}</div>
          <div className="mt-1 text-xs text-slate-400">{activity.detail}</div>
        </div>
        <span className={`hud-chip shrink-0 ${priority.tone}`}>{priority.shortLabel}</span>
      </div>
    </div>
  );
}

export default function Crew() {
  const { crew, trainingQueue, treatmentQueue, crewActivities, crewActivityLog, startTraining, startTreatment, restMember } = useCrewStore();
  const currentMinute = useGameStore((state) => state.currentMinute);
  const resources = useGameStore((state) => state.resources);
  const spendCredits = useGameStore((state) => state.spendCredits);
  const addLog = useGameStore((state) => state.addLog);
  const rooms = useShipInteriorStore((state) => state.rooms);
  const aiSummary = summarizeCrewAI(crewActivities ?? []);

  const busy = (memberId) => trainingQueue.some((task) => task.memberId === memberId) || treatmentQueue.some((task) => task.memberId === memberId);

  const train = (member) => {
    if (!member.alive || busy(member.id)) return addLog(`${member.name} 훈련 불가: 현재 작업을 확인하세요.`);
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
    addLog(`${member.name} 휴식 완료: 피로도 감소, 사기 개선.`);
  };

  const treat = (member) => {
    if (!member.alive || member.injury === "정상" || busy(member.id)) return addLog(`${member.name} 치료 불가: 상태 또는 작업 큐를 확인하세요.`);
    const rule = treatmentRule(member.injury);
    if (!spendCredits(rule.cost)) return addLog(`${member.name} 치료 실패: 크레딧 부족.`);
    const completeAt = currentMinute + rule.minutes;
    const priority = inferTreatmentPriority(member.injury);
    startTreatment({ memberId: member.id, injury: member.injury, completeAt, cost: rule.cost, duration: rule.minutes, fatiguePenalty: rule.fatiguePenalty, priority });
    addLog(`${member.name} 치료 시작: ${member.injury}, 우선순위 ${getPriorityConfig(priority).label}, ₢${rule.cost}, ${formatMinutes(rule.minutes)}, 완료 ${formatGameDate(completeAt)}.`);
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
      <section>
        <div className="section-title"><Users size={18} />승무원 스쿼드</div>
        <div className="mt-4 grid grid-cols-4 gap-2 text-sm">
          <Info label="AI 활동" value={`${aiSummary.total}명`} />
          <Info label="긴급" value={`${aiSummary.emergency}명`} tone={aiSummary.emergency > 0 ? "text-red-300" : ""} />
          <Info label="높음" value={`${aiSummary.high}명`} tone={aiSummary.high > 0 ? "text-amber-300" : ""} />
          <Info label="일반" value={`${aiSummary.normal + aiSummary.low}명`} />
        </div>
        <div className="mt-4 rounded border border-slate-700/70 bg-slate-950/60 p-4 text-sm leading-6 text-slate-300">
          승무원은 함선 내부에서 AI 명령에 따라 이동합니다. 방 위치는 현재 업무와 연결되고, 시간이 흐르면 마커가 브릿지·기관실·의무실·생활구역 사이를 이동합니다.
        </div>
        <div className="mt-4 grid gap-3">
          {crew.map((member) => {
            const mainStat = trainingByRole[member.role] ?? "scouting";
            const trainingTask = trainingQueue.find((task) => task.memberId === member.id);
            const treatmentTask = treatmentQueue.find((task) => task.memberId === member.id);
            const activity = (crewActivities ?? []).find((entry) => entry.memberId === member.id);
            const isBusy = Boolean(trainingTask || treatmentTask);
            const rule = treatmentRule(member.injury);
            return (
              <div key={member.id} className={`rounded border p-4 ${member.alive ? "border-slate-700/70 bg-slate-950/60" : "border-red-900/70 bg-red-950/20 opacity-80"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><div className="flex items-center gap-2"><RoleIcon role={member.role} size={16} /><div className="font-semibold text-slate-100">{member.name}</div></div><div className="mt-1 text-xs text-slate-500">{member.role} · {member.trait ?? "일반 대원"}</div></div>
                  <span className={`hud-chip ${!member.alive || member.injury !== "정상" ? "hud-chip-danger" : "hud-chip-success"}`}>{!member.alive ? "전사" : member.injury}</span>
                </div>
                <ActivityCard activity={activity} />
                <div className="mt-3 grid grid-cols-3 gap-2 text-sm"><Info label="사기" value={member.morale} /><Info label="피로" value={`${member.fatigue ?? 0}`} tone={fatigueTone(member.fatigue ?? 0)} /><Info label="경험" value={`${member.experience ?? 0}`} /></div>
                {trainingTask && <Progress task={trainingTask} currentMinute={currentMinute} label="훈련 진행 중" />}
                {treatmentTask && <Progress task={treatmentTask} currentMinute={currentMinute} label="치료 진행 중" />}
                <div className="mt-3 flex flex-wrap gap-1.5">{Object.entries(member.stats).map(([key, value]) => <span key={key} className={`hud-chip ${key === mainStat ? "hud-chip-accent" : ""}`}>{statLabel[key]} {value}</span>)}</div>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  <button className="secondary-button" disabled={!member.alive || isBusy || resources.credits < TRAINING_COST} onClick={() => train(member)}>{trainingTask ? "훈련 중" : treatmentTask ? "치료 중" : `훈련 ₢${TRAINING_COST}`}</button>
                  <button className="secondary-button" disabled={!member.alive || isBusy} onClick={() => rest(member)}>휴식</button>
                  <button className="secondary-button" disabled={!member.alive || member.injury === "정상" || isBusy || resources.credits < rule.cost} onClick={() => treat(member)}>{treatmentTask ? "치료 중" : member.injury === "정상" ? "정상" : `치료 ₢${rule.cost}`}</button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
      <div className="grid gap-4">
        <ShipInterior crew={crew} activities={crewActivities ?? []} rooms={rooms} />
        <section>
          <div className="section-title">스쿼드 종합표</div>
          <div className="mt-4 overflow-auto rounded border border-slate-700/70">
            <table className="data-table"><thead><tr><th>이름</th><th>역할</th><th>현재 AI 행동</th>{Object.values(statLabel).map((label) => <th key={label}>{label}</th>)}<th>피로</th><th>상태</th></tr></thead><tbody>{crew.map((member) => { const activity = (crewActivities ?? []).find((entry) => entry.memberId === member.id); return <tr key={member.id} className={!member.alive ? "opacity-60" : ""}><td className="font-semibold text-slate-100">{member.name}</td><td><span className="inline-flex items-center gap-1.5"><RoleIcon role={member.role} />{member.role}</span></td><td>{activity ? `${activity.station} · ${activity.action}` : "대기"}</td>{Object.keys(statLabel).map((key) => <td key={key} className="font-mono tabular-nums">{member.stats[key]}</td>)}<td><span className={`hud-chip ${fatigueTone(member.fatigue ?? 0)}`}>{member.fatigue ?? 0}</span></td><td><span className={`hud-chip ${!member.alive ? "hud-chip-danger" : member.injury === "정상" ? "hud-chip-success" : "hud-chip-warn"}`}>{!member.alive ? "전사" : member.injury}</span></td></tr>; })}</tbody></table>
          </div>
        </section>

        <section className="rounded border border-slate-700/70 bg-slate-950/60 p-4">
          <div className="section-title">최근 AI 배정 기록</div>
          <div className="mt-3 grid gap-2">
            {(crewActivityLog ?? []).slice(0, 8).map((entry, index) => <div key={`${entry}-${index}`} className="rounded border border-slate-700/70 bg-slate-900/70 px-3 py-2 text-xs text-slate-300">{entry}</div>)}
            {(crewActivityLog ?? []).length === 0 && <div className="text-sm text-slate-500">게임 시간이 흐르면 승무원 AI 배정 기록이 여기에 표시됩니다.</div>}
          </div>
        </section>
      </div>
    </div>
  );
}
