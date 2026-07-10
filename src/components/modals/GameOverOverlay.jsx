import { AlertOctagon, RotateCcw } from "lucide-react";
import { getGameOverCause } from "../../systems/gameOverSystem";

function clearGameSaves() {
  Object.keys(window.localStorage)
    .filter((key) => key.startsWith("space-manager-"))
    .forEach((key) => window.localStorage.removeItem(key));
  window.location.reload();
}

export default function GameOverOverlay({ gameOver }) {
  if (!gameOver) return null;
  const cause = getGameOverCause(gameOver.cause);

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/95 p-4 backdrop-blur-sm">
      <section className="w-full max-w-lg rounded-xl border border-red-400/40 bg-slate-900 p-6 text-center shadow-2xl shadow-red-950/50">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full border border-red-400/50 bg-red-500/10 text-red-300">
          <AlertOctagon size={34} />
        </div>
        <div className="mt-5 text-xs font-black uppercase tracking-[0.28em] text-red-300">Voyage Terminated</div>
        <h1 className="mt-2 text-3xl font-black text-white">{cause.title}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-300">{cause.summary}</p>
        <div className="mt-5 rounded border border-slate-700 bg-slate-950/70 p-4 text-left text-sm text-slate-300">
          <div className="flex justify-between gap-4"><span>종료 시각</span><strong className="text-slate-100">{gameOver.atMinute}</strong></div>
          <div className="mt-2 flex justify-between gap-4"><span>원인 코드</span><strong className="text-red-200">{gameOver.cause}</strong></div>
        </div>
        <button className="primary-button mt-6 flex w-full items-center justify-center gap-2" onClick={clearGameSaves}>
          <RotateCcw size={17} />새 항해 시작
        </button>
      </section>
    </div>
  );
}
