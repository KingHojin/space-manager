import { Radio } from "lucide-react";
import { useGameStore } from "../../stores/gameStore";

export default function NewsTicker({ onOpenLog }) {
  const news = useGameStore((state) => state.news);
  return (
    <button className="flex h-11 w-full items-center gap-3 border-t border-slate-700/80 bg-slate-900 px-4 text-left" onClick={onOpenLog}>
      <Radio size={16} className="text-cyan-300" />
      <div className="ticker-mask min-w-0 flex-1">
        <div className="ticker-line text-sm text-slate-200">{news[0] || "새로운 뉴스가 없습니다."}</div>
      </div>
      <span className="text-xs text-slate-500">로그 열기</span>
    </button>
  );
}
