export const RESCUE_RESERVE_CREDITS = 360;

export function getPostInvestmentBalance(credits, cost = 0) {
  return Math.max(0, (credits ?? 0) - Math.max(0, cost ?? 0));
}

export default function InvestmentBalanceHint({ credits = 0, cost = 0, label = "결재 후" }) {
  const balance = getPostInvestmentBalance(credits, cost);
  const belowReserve = balance < RESCUE_RESERVE_CREDITS;
  return <div className={`mt-1 text-xs ${belowReserve ? "text-amber-200" : "text-slate-400"}`}>{label} ₢{balance}{belowReserve ? ` · 구조 예비금 ₢${RESCUE_RESERVE_CREDITS} 미만` : ""}</div>;
}
