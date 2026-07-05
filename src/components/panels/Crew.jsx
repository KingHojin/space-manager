import { Compass, Cross, Crosshair, User, Users, Wrench } from "lucide-react";
import { useGameStore } from "../../stores/gameStore";
import { useCrewStore } from "../../stores/crewStore";
import { statLabel } from "../../utils/format";

const ROLE_ICONS = {
  함교: { icon: Compass, color: "text-cyan-400" },
  포탑: { icon: Crosshair, color: "text-red-400" },
  기관실: { icon: Wrench, color: "text-amber-400" },
  의무실: { icon: Cross, color: "text-emerald-400" },
};

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
  const { crew, trainMember, restMember, treatMember } = useCrewStore();
  const addLog = useGameStore((state) => state.addLog);

  const train = (member) => {
    const statKey = trainingByRole[member.role] ?? "scouting";
    trainMember(member.id, statKey);
    addLog(`${member.name} 훈련 완료: ${statLabel[statKey]} +1, 피로도 증가.`);
  };

  const rest = (member) => {
    restMember(member.id);
    addLog(`${member.name} 휴식 완료: 피로도 감소, 사기 개선.`);
  };

  const treat = (member) => {
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
        <div className="mt-4 grid gap-3">
          {crew.map((member) => {
            const mainStat = trainingByRole[member.role] ?? "scouting";
            return (
              <div key={member.id} className="rounded border border-slate-700/70 bg-slate-950/60 p-4">
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
                  <span className={`hud-chip ${member.injury === "정상" ? "hud-chip-success" : "hud-chip-danger"}`}>{member.injury}</span>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                  <Info label="사기" value={member.morale} />
                  <Info label="피로" value={`${member.fatigue ?? 0}`} tone={fatigueTone(member.fatigue ?? 0)} />
                  <Info label="경험" value={`${member.experience ?? 0}`} />
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {Object.entries(member.stats).map(([key, value]) => (
                    <span key={key} className={`hud-chip ${key === mainStat ? "hud-chip-accent" : ""}`}>
                      {statLabel[key]} {value}
                    </span>
                  ))}
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2">
                  <button className="secondary-button" onClick={() => train(member)}>
                    역할 훈련
                  </button>
                  <button className="secondary-button" onClick={() => rest(member)}>
                    휴식
                  </button>
                  <button className="secondary-button" onClick={() => treat(member)}>
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
              </tr>
            </thead>
            <tbody>
              {crew.map((member) => (
                <tr key={member.id}>
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
