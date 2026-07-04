import { useGameStore } from "../../stores/gameStore";

export default function SaveLoadModal() {
  const resetGame = useGameStore((state) => state.resetGame);
  const addLog = useGameStore((state) => state.addLog);
  const saveKeys = ["space-manager-game", "space-manager-ship", "space-manager-crew", "space-manager-inventory", "space-manager-exploration"];

  const confirmSaved = () => addLog("저장 확인 완료. 현재 진행도는 localStorage에 자동 저장되어 있습니다.");
  const newGame = () => {
    saveKeys.forEach((key) => localStorage.removeItem(key));
    resetGame();
    window.location.reload();
  };

  return (
    <div className="grid grid-cols-2 gap-3">
      <button className="primary-button" onClick={confirmSaved}>저장 확인</button>
      <button className="secondary-button" onClick={newGame}>새 게임</button>
      <p className="col-span-2 text-sm text-slate-400">
        Zustand persist로 모든 핵심 상태가 브라우저 localStorage에 자동 저장됩니다.
      </p>
    </div>
  );
}
