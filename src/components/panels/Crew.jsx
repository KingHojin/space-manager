import { Compass, Cross, Crosshair, User, Users, Wrench } from "lucide-react";
import { formatGameDate } from "../../systems/gameClock";
import { useCrewStore } from "../../stores/crewStore";
import { useGameStore } from "../../stores/gameStore";
import { statLabel } from "../../utils/format";
import { formatMinutes } from "../../data/moduleRecipes";

const ROLE_ICONS = {
  함교: { icon: Compass, color: "text-cyan-400" },
  포탑: { icon: Crosshair, color: "text-red-400" },
  기관실: { icon: Wrench, color: "text-amber-400" },
  의무실: { icon: Cross, color: "text-emerald-400" },
};

const TRAINING_COST = 180;
const TRAINING_MINUTES = 360;

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

const trainingByRole = {
  함교: "piloting",
  포탑: "gunnery",
  기관실: "engineering",
  의무실: "medicine",
};

export default function Crew() {
  const { crew, trainingQueue, startTraining, restMember, treatMember } = useCrewStore();
  const currentMinute = useGameStore((state) => state.currentMinute);
  const resources = useGameStore((state) => state.resources);
  const spendCredits = useGameStore((state) => state.spendCredits);
  const addLog = useGameStore((state) => state.addLog);

  const train = (member) => {
    if (!member.alive) {
      addLog(`${member.name} 훈련 불가: 전사한 승무원입니다.`);
      return;
    }
    if (trainingQueue.some((task) => task.memberId === member.id)) {
      addLog(`${member.name} 훈련 불가: 이미 훈련 중입니다.`);
      return;
    }
    if (!spendCredits(TRAINING_COST)) {
      addLog(`${member.name} 훈련 시작 실패: 크레딧이 부족합니다.`);
      return;
    }
    const statKey = trainingByRole[member.role] ?? "scouting";
    const completeAt = currentMinute + TRAINING_MINUTES;
    startTraining({ memberId: member.id, statKey, completeAt, cost: TRAINING_COST, duration: TRAINING_MINUTES });
    addLog(`${member.name} 역할 훈련 시작: ${statLabel[statKey]} +1 예정, 비용 ₢${TRAINING_COST}, 완료 ${formatGameDate(completeAt)}.`);
  };

  const rest = (member) => {
    if (!member.alive) {
      addLog(`${member.name} 휴식 불가: 전사한 승무원입니다.`);
      return;
    }
    restMember(member.id);
    addLog(`${member.name} 휴식 완료: 피로도 감소, 사기 개선.`);
  };

  const treat = (member) => {
    if (!member.alive) {
      addLog(`${member.name} 치료 불가: 전사한 승무원입니다.`);
      return;
    }
    treatMember(member.id);
    addLog(`${member.name} 의무실 처치 완료.`);
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
      <section>
        <div className="section-title">
          <Users size={18} />
          승무원 스쿼드
        </div>
        <div className="mt-4 rounded border border-slate-700/70 bg-slate-950/60 p-4 text-sm leading-6 text-slate-300">
          역할 훈련은 즉시 완료되지 않습니다. 비용 ₢{TRAINING_COST}와 {formatMinutes(TRAINING_MINUTES)}이 필요하며, 게임 시간이 진행되면 자동 완료됩니다.
        </div>
        <div className="mt-4 grid gap-3">
          {crew.map((member) => {
            const mainStat = trainingByRole[member.role] ?? "scouting";
            const task = trainingQueue.find((entry) => entry.memberId === member.id);
            const progress = task ? Math.round(((currentMinute - task.startedAt) / Math.max(1, task.duration)) * 100) : 0;
            const disabled = !member.alive || Boolean(task) || resources.credits < TRAINING_COST;
            return (
              <div key={member.id} className={`rounded border p-4 ${member.alive ? "border-slate-700/70 bg-slate-950/60" : "border-red-900/70 bg-red-950/20 opacity-80"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <RoleIcon role={member.role} size={16} />
                      <div className="font-semibold text-slate-100">{member.name}</div>
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {member.role} · {member.trait ?? "일반 대원"}
                    </div>
                  </div>
                  <span className={`hud-chip ${!member.alive ? "hud-chip-danger" : member.injury === "정상" ? "hud-chip-success" : "hud-chip-danger"}`}>
                    {!member.alive ? "전사" : member.injury}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                  <Info label="사기" value={member.morale} />
                  <Info label="피로" value={`${member.fatigue ?? 0}`} tone={fatigueTone(member.fatigue ?? 0)} />
                  <Info label="경험" value={`${member.experience ?? 0}`} />
                </div>

                {task && (
                  <div className="mt-3 rounded border border-cyan-400/30 bg-cyan-400/10 p-3">
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="hud-label">훈련 진행 중</span>
                      <span className="hud-value">{Math.max(0, Math.min(100, progress))}%</span>
                    </div>
                    <div className="hud-gauge"><span className="hud-gauge-fill" style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} /></div>
                    <div className="mt-2 text-xs text-slate-400">완료: {formatGameDate(task.completeAt)}</div>
                  </div>
                )}

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {Object.entries(member.stats).map(([key, value]) => (
                    <span key={key} className={`hud-chip ${key === mainStat ? "hud-chip-accent" : ""}`}>
                      {statLabel[key]} {value}
                    </span>
                  ))}
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2">
                  <button className="secondary-button" disabled={disabled} onClick={() => train(member)}>
                    {task ? "훈련 중" : `훈련 ₢${TRAINING_COST}`}
                  </button>
                  <button className="secondary-button" disabled={!member.alive} onClick={() => rest(member)}>
                    휴식
                  </button>
                  <button className="secondary-button" disabled={!member.alive || member.injury === "정상"} onClick={() => treat(member)}>
                    치료
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <div className="section-title">스쿼드 종합표</div>
        <div className="mt-4 overflow-auto rounded border border-slate-700/70">
          <table className="data-table">
            <thead>
              <tr>
                <th>이름</th>
                <th>역할</th>
                {Object.values(statLabel).map((label) => (
                  <th key={label}>{label}</th>
                ))}
                <th>피로</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {crew.map((member) => (
                <tr key={member.id} className={!member.alive ? "opacity-60" : ""}>
                  <td className="font-semibold text-slate-100">{member.name}</td>
                  <td>
                    <span className="inline-flex items-center gap-1.5">
                      <RoleIcon role={member.role} />
                      {member.role}
                    </span>
                  </td>
                  {Object.keys(statLabel).map((key) => (
                    <td key={key} className="font-mono tabular-nums">{member.stats[key]}</td>
                  ))}
                  <td>
                    <span className={`hud-chip ${fatigueTone(member.fatigue ?? 0)}`}>{member.fatigue ?? 0}</span>
                  </td>
                  <td>
                    <span className={`hud-chip ${!member.alive ? "hud-chip-danger" : member.injury === "정상" ? "hud-chip-success" : "hud-chip-warn"}`}>
                      {!member.alive ? "전사" : member.injury}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Info({ label, value, tone = "" }) {
  return (
    <div className="rounded border border-slate-700/70 bg-slate-900/70 px-3 py-2">
      <div className="hud-label">{label}</div>
      <div className={`hud-value mt-1 ${tone}`}>{value}</div>
    </div>
  );
}
