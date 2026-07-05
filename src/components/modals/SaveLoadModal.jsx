import { useState } from "react";
import { useGameStore } from "../../stores/gameStore";

const saveKeys = [
  "space-manager-game",
  "space-manager-ship",
  "space-manager-crew",
  "space-manager-inventory",
  "space-manager-exploration",
  "space-manager-factions",
  "space-manager-contracts",
];

export default function SaveLoadModal() {
  const [payload, setPayload] = useState("");
  const resetGame = useGameStore((state) => state.resetGame);
  const addLog = useGameStore((state) => state.addLog);

  const confirmSaved = () => addLog("저장 확인 완료. 현재 진행도는 localStorage에 자동 저장되어 있습니다.");

  const exportSave = () => {
    const data = Object.fromEntries(saveKeys.map((key) => [key, localStorage.getItem(key)]));
    setPayload(JSON.stringify({ version: 2, exportedAt: new Date().toISOString(), data }, null, 2));
    addLog("저장 데이터 내보내기 완료.");
  };

  const importSave = () => {
    try {
      const parsed = JSON.parse(payload);
      const data = parsed.data ?? parsed;
      saveKeys.forEach((key) => {
        if (typeof data[key] === "string") localStorage.setItem(key, data[key]);
      });
      addLog("저장 데이터 가져오기 완료. 화면을 다시 불러옵니다.");
      window.location.reload();
    } catch {
      addLog("저장 데이터 가져오기 실패: JSON 형식을 확인하세요.");
    }
  };

  const newGame = () => {
    saveKeys.forEach((key) => localStorage.removeItem(key));
    resetGame();
    window.location.reload();
  };

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <button className="primary-button" onClick={confirmSaved}>저장 확인</button>
        <button className="secondary-button" onClick={exportSave}>내보내기</button>
        <button className="secondary-button" onClick={importSave}>가져오기</button>
        <button className="secondary-button" onClick={newGame}>새 게임</button>
      </div>
      <p className="text-sm text-slate-400">
        모든 핵심 상태는 자동 저장됩니다. 세력 평판과 계약 진행도까지 함께 내보내기/가져오기에 포함됩니다.
      </p>
      <textarea
        className="min-h-48 rounded border border-slate-700 bg-slate-950 p-3 font-mono text-xs text-slate-200 outline-none focus:border-cyan-400"
        value={payload}
        onChange={(event) => setPayload(event.target.value)}
        placeholder="저장 데이터 JSON이 여기에 표시됩니다."
      />
    </div>
  );
}
