import { RARITY_COLORS } from "../../data/constants";

const tone = {
  slate: "border-slate-500/50 bg-slate-600/15 text-slate-200",
  emerald: "border-emerald-400/50 bg-emerald-500/15 text-emerald-200",
  sky: "border-sky-400/50 bg-sky-500/15 text-sky-200",
  violet: "border-violet-400/50 bg-violet-500/15 text-violet-200",
  amber: "border-amber-300/60 bg-amber-400/15 text-amber-100",
};

export default function Badge({ rarity, children }) {
  const color = RARITY_COLORS[rarity] || "slate";
  return <span className={`rounded border px-2 py-0.5 text-xs font-semibold ${tone[color]}`}>{children}</span>;
}
