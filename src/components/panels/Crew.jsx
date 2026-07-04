import { Users } from "lucide-react";
import { useCrewStore } from "../../stores/crewStore";
import { statLabel } from "../../utils/format";

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
              <td>{member.role}</td>
              {Object.keys(statLabel).map((key) => (
                <td key={key} className="font-mono tabular-nums">{member.stats[key]}</td>
              ))}
              <td>{member.morale}</td>
              <td>{member.injury}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
