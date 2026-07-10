import { useEffect, useId, useRef } from "react";
import { AlertOctagon, RotateCcw } from "lucide-react";
import { getGameOverCause } from "../../systems/gameOverSystem";
import { formatGameDate } from "../../systems/gameClock";

function clearGameSaves() {
  Object.keys(window.localStorage)
    .filter((key) => key.startsWith("space-manager-"))
    .forEach((key) => window.localStorage.removeItem(key));
  window.location.reload();
}

export default function GameOverOverlay({ gameOver }) {
  const restartRef = useRef(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!gameOver) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => restartRef.current?.focus());
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
    };
  }, [gameOver]);

  if (!gameOver) return null;
  const cause = getGameOverCause(gameOver.cause);

  return (
    <div className="game-over-backdrop fixed inset-0 z-[100] grid place-items-center p-4 backdrop-blur-sm">
      <section
        className="game-over-panel w-full max-w-lg p-6 text-center"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full border border-red-400/40 bg-red-500/10 text-red-300">
          <AlertOctagon size={34} />
        </div>
        <div className="mt-5 text-xs font-bold uppercase tracking-[0.2em] text-red-300">항해 종료</div>
        <h1 id={titleId} className="mt-2 text-3xl font-black text-white">{cause.title}</h1>
        <p id={descriptionId} className="mt-3 text-sm leading-6 text-slate-300">{cause.summary}</p>
        <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.035] p-4 text-left text-sm text-slate-300">
          <div className="flex justify-between gap-4"><span>종료 시각</span><strong className="text-slate-100">{formatGameDate(gameOver.atMinute)}</strong></div>
          <div className="mt-2 flex justify-between gap-4"><span>종료 원인</span><strong className="text-red-200">{cause.title}</strong></div>
        </div>
        <button ref={restartRef} className="primary-button mt-6 flex w-full items-center justify-center gap-2" onClick={clearGameSaves}>
          <RotateCcw size={17} />새 항해 시작
        </button>
      </section>
    </div>
  );
}
