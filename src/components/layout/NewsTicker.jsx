import { Radio } from "lucide-react";
import { useGameStore } from "../../stores/gameStore";

export default function NewsTicker({ onOpenLog }) {
  const news = useGameStore((state) => state.news);
  const latest = news[0] || "새로운 뉴스가 없습니다.";
  return (
    <button className="app-news-ticker flex h-11 w-full items-center gap-3 px-4 text-left" onClick={onOpenLog} aria-label={`최근 알림: ${latest}. 전체 로그 열기`}>
      <Radio size={16} className="shrink-0 text-blue-300" aria-hidden="true" />
      <div className="ticker-mask min-w-0 flex-1">
        <div className="ticker-line text-sm text-slate-200" aria-live="polite" aria-atomic="true">{latest}</div>
      </div>
      <span className="shrink-0 text-xs text-slate-500">전체 로그</span>
    </button>
  );
}
