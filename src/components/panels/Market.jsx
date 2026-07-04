import { Store } from "lucide-react";
import { useExplorationStore } from "../../stores/explorationStore";

export default function Market() {
  const currentZoneId = useExplorationStore((state) => state.currentZoneId);
  const docked = currentZoneId === "anchor-station";
  return (
    <section>
      <div className="section-title">
        <Store size={18} />
        정거장 시장
      </div>
      <div className="mt-5 rounded border border-slate-700/70 bg-slate-950/60 p-5">
        <div className="text-xl font-bold text-slate-50">{docked ? "앵커 정거장 거래 가능" : "정거장 도킹 필요"}</div>
        <p className="mt-2 text-sm text-slate-400">
          {docked ? "Phase 4에서 모듈, 연료, 승무원 영입 목록이 이 영역에 연결됩니다." : "앵커 정거장으로 이동하면 시장 기능이 활성화됩니다."}
        </p>
      </div>
    </section>
  );
}
