import { useGameStore } from "../stores/gameStore";
import { useInventoryStore } from "../stores/inventoryStore";
import { useNavStore } from "../stores/navStore";
import { useReportStore } from "../stores/reportStore";
import { useSkillStore } from "../stores/skillStore";
import { buildNavigationReport } from "./reportSystem";

export function settleGateRequisition({ packageId, claimId, optionId, currentMinute = 0, afterStep } = {}) {
  const prepared = useNavStore.getState().prepareGateRequisitionClaim(packageId, claimId, optionId, currentMinute);
  if (!prepared.ok || !prepared.newlyClaimed) return prepared;
  const effect = prepared.effects.find((entry) => entry.kind === "gateRequisition");
  const checkpoint = (step) => { if (afterStep) afterStep(step); };

  useGameStore.getState().applyRequisitionCredits(claimId, (effect.baseCredits ?? 0) + (effect.bonusCredits ?? 0));
  checkpoint("credits");
  useInventoryStore.getState().applyRequisitionItems(claimId, effect.items ?? []);
  checkpoint("items");
  useSkillStore.getState().applyRequisitionPoint(claimId, effect.skillPoints ?? 0);
  checkpoint("skill");
  const itemSummary = (effect.items ?? []).map(({ itemId, qty }) => `${itemId} x${qty}`).join(", ");
  useReportStore.getState().applyRequisitionReport(claimId, buildNavigationReport({
    id: `gate-requisition:${claimId}`,
    title: effect.isExpeditionFinale ? "최종 관문 보급 수령" : `섹터 ${effect.sectorNumber} 관문 보급`,
    summary: `기본 보급 ₢${effect.baseCredits ?? 0} · 선택 ${effect.packageLabel}${effect.bonusCredits ? ` ₢${effect.bonusCredits}` : ""}${itemSummary ? ` · ${itemSummary}` : ""} · 스킬 포인트 +${effect.skillPoints ?? 0}.`,
    navKind: "gateRequisition",
    currentMinute,
    details: { claimId, sectorNumber: effect.sectorNumber, packageId, credits: (effect.baseCredits ?? 0) + (effect.bonusCredits ?? 0), items: effect.items ?? [], skillPoints: effect.skillPoints ?? 0 },
  }));
  checkpoint("report");

  const finalized = useNavStore.getState().finalizeGateRequisitionClaim(claimId, prepared.claim, currentMinute);
  if (!finalized.ok) return { ...finalized, effects: prepared.effects };
  if (finalized.completedCampaign) {
    useGameStore.getState().setPaused(true);
    useGameStore.getState().addLog(`원정 완주 기록: ${effect.sectorNumber}개 섹터 항로 개척. 장기 함대 캠페인의 첫 이정표를 달성했습니다.`);
  }
  useGameStore.getState().addLog(`관문 보급 수령: ${packageId} · 기본 ₢${effect.baseCredits ?? 0} · 스킬 포인트 +${effect.skillPoints ?? 0}.`);
  return { ...prepared, finalized: true };
}
