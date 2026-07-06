import { JOB_ECONOMY } from "../data/constants";

export function computeJobRefund(job = {}) {
  const ratio = JOB_ECONOMY.cancelRefundRatio ?? 0.5;
  const items = [];
  (job.payload?.inputItems ?? []).forEach(({ itemId, qty }) => {
    const refundQty = Math.max(1, Math.floor((qty ?? 0) * ratio));
    if (itemId && refundQty > 0) items.push({ itemId, qty: refundQty });
  });
  const creditBase = job.payload?.creditCost ?? (job.type === "recovery" ? job.cost : 0);
  const credits = creditBase > 0 ? Math.floor(creditBase * ratio) : 0;
  return { items, credits };
}
