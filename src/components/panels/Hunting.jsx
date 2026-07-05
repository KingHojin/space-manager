import { PawPrint } from "lucide-react";
import { creatures } from "../../data/creatures";

export default function Hunting() {
  return (
    <section>
      <div className="section-title">
        <PawPrint size={18} />
        사냥 미션
      </div>
      <table className="data-table mt-4">
        <thead>
          <tr>
            <th>대상</th>
            <th>위험도</th>
            <th>약점</th>
            <th>보상</th>
            <th>상태</th>
          </tr>
        </thead>
        <tbody>
          {creatures.map((creature) => (
            <tr key={creature.id}>
              <td className="font-semibold text-slate-100">{creature.name}</td>
              <td>
                <span className={`hud-chip ${creature.danger >= 5 ? "hud-chip-danger" : creature.danger >= 3 ? "hud-chip-warn" : ""}`}>
                  위험 {creature.danger}
                </span>
              </td>
              <td>{creature.weakness}</td>
              <td>{creature.reward}</td>
              <td>
                <span className="hud-chip">정찰 필요</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
