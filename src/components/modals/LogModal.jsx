import { useGameStore } from "../../stores/gameStore";

export default function LogModal() {
  const logs = useGameStore((state) => state.logs);
  return (
    <div className="space-y-2">
      {logs.map((log, index) => (
        <div key={`${log}-${index}`} className="rounded border border-slate-700/70 bg-slate-950/60 px-3 py-2 text-sm text-slate-300">
          {log}
        </div>
      ))}
    </div>
  );
}
