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
              <td>{creature.name}</td>
              <td>{creature.danger}</td>
              <td>{creature.weakness}</td>
              <td>{creature.reward}</td>
              <td>정찰 필요</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
