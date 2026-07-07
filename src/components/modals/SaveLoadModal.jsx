import { useState } from "react";
import { useGameStore } from "../../stores/gameStore";

const STORAGE_KEY_PREFIX = "space-manager";

const knownSaveKeys = [
  "space-manager-game",
  "space-manager-ship",
  "space-manager-crew",
  "space-manager-inventory",
  "space-manager-exploration",
  "space-manager-factions",
  "space-manager-contracts",
  "space-manager-skills",
  "space-manager-jobs",
  "space-manager-nav",
  "space-manager-ship-interior",
  "space-manager-recruit",
  "space-manager-missions",
];

function getPersistedKeys() {
  if (typeof window === "undefined" || !window.localStorage) return knownSaveKeys;
  const keys = new Set(knownSaveKeys);
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key?.startsWith(STORAGE_KEY_PREFIX)) keys.add(key);
  }
  return [...keys];
}

function clearPersistedGameState() {
  getPersistedKeys().forEach((key) => localStorage.removeItem(key));
}

export default function SaveLoadModal() {
  const [payload, setPayload] = useState("");
  const addLog = useGameStore((state) => state.addLog);

  const confirmSaved = () => addLog("저장 확인 완료. 현재 진행도는 localStorage에 자동 저장되어 있습니다.");

  const exportSave = () => {
    const keys = getPersistedKeys();
    const data = Object.fromEntries(keys.map((key) => [key, localStorage.getItem(key)]));
    // This `version: 4` is the export "key bundle" format version — it
    // describes the shape of this wrapper object (which localStorage keys
    // get bundled, and how) and is independent of each store's own zustand
    // `persist` `version` (see src/stores/persistVersion.js, Phase 18-E).
    // `data[key]` below is the raw JSON string each store already writes to
    // localStorage (`{ state, version }`, per-store persist version inside),
    // so bumping a store's persist version does not require bumping this
    // bundle version — only a change to the bundle's own top-level shape does.
    setPayload(JSON.stringify({ version: 4, exportedAt: new Date().toISOString(), data }, null, 2));
    addLog("저장 데이터 내보내기 완료.");
  };

  const importSave = () => {
    try {
      const parsed = JSON.parse(payload);
      const data = parsed.data ?? parsed;
      // Phase 18-E fix: addLog() must run BEFORE the raw localStorage writes
      // below, not after. addLog is a useGameStore set() call, and zustand's
      // persist middleware flushes every set() straight to storage — calling
      // it after we've already written the imported "space-manager-game"
      // blob re-serializes the (still pre-import, in-memory) gameStore state
      // over top of it, silently clobbering the just-imported game data a
      // moment before the reload picks it back up. Logging first means any
      // such flush happens before clearPersistedGameState()/the import loop
      // overwrite it with the real imported values, which are what survive.
      addLog("저장 데이터 가져오기 완료. 화면을 다시 불러옵니다.");
      clearPersistedGameState();
      Object.entries(data).forEach(([key, value]) => {
        if (key.startsWith(STORAGE_KEY_PREFIX) && typeof value === "string") localStorage.setItem(key, value);
      });
      window.location.reload();
    } catch {
      addLog("저장 데이터 가져오기 실패: JSON 형식을 확인하세요.");
    }
  };

  const newGame = () => {
    const ok = window.confirm("현재 브라우저에 저장된 Space Manager 진행 상태를 전부 초기화할까요? 작업 큐, 회복 상태, 항해, 함선, 인벤토리, 임무 진행이 새 게임 상태로 돌아갑니다.");
    if (!ok) return;
    clearPersistedGameState();
    window.location.reload();
  };

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <button className="primary-button" onClick={confirmSaved}>저장 확인</button>
        <button className="secondary-button" onClick={exportSave}>내보내기</button>
        <button className="secondary-button" onClick={importSave}>가져오기</button>
        <button className="secondary-button border-red-400/50 bg-red-950/40 text-red-100" onClick={newGame}>새 게임</button>
      </div>
      <p className="text-sm text-slate-400">
        모든 핵심 상태는 자동 저장됩니다. 새 게임은 현재 브라우저의 Space Manager 저장소 전체를 지우고 다시 시작합니다.
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
