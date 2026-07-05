import { Compass, Cross, Crosshair, User, Users, Wrench } from "lucide-react";
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

export default function Crew() {
  const crew = useCrewStore((state) => state.crew);
  return (
    <section>
      <div className="section-title">
        <Users size={18} />
        승무원 스쿼드
      </div>
      <table className="data-table mt-4">
        <thead>
          <tr>
            <th>이름</th>
            <th>역할</th>
            {Object.values(statLabel).map((label) => (
              <th key={label}>{label}</th>
            ))}
            <th>사기</th>
            <th>부상</th>
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
                <span className="hud-chip">{member.morale}</span>
              </td>
              <td>
                <span className={`hud-chip ${member.injury === "정상" ? "hud-chip-success" : "hud-chip-danger"}`}>{member.injury}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
