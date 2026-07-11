import { beforeEach, describe, expect, it, vi } from "vitest";
import { RESOURCES } from "../../data/constants";
import { initialCrew } from "../../data/crew";
import { RECRUIT_COST, getCandidateRecruitCost } from "../../data/recruitment";
import { useCrewStore } from "../../stores/crewStore";
import { mergePersistedGameState, useGameStore } from "../../stores/gameStore";
import { mergeItems, useInventoryStore } from "../../stores/inventoryStore";
import { useNavStore } from "../../stores/navStore";
import { useRecruitStore } from "../../stores/recruitStore";
import { useSkillStore } from "../../stores/skillStore";
import { useReportStore } from "../../stores/reportStore";
import { applyNavigationEncounter, claimGateRequisition, processTimedJobs } from "../gameClock";
import { createGateRequisitionEncounter, normalizeCampaignState } from "../campaignProgression";
import { getPostInvestmentBalance, RESCUE_RESERVE_CREDITS } from "../../components/common/InvestmentBalanceHint";
import { formatRecruitPullLog } from "../../components/panels/Recruit";

function pendingRequisition(sectorNumber = 1, overrides = {}) {
  return {
    claimId: `first-frontier:sector:${sectorNumber}`,
    sectorNumber,
    baseCredits: 120,
    skillPoints: 1,
    isExpeditionFinale: false,
    createdAtMinute: 10,
    ...overrides,
  };
}

function setPending(pending = pendingRequisition()) {
  useNavStore.setState((state) => ({
    campaign: { ...state.campaign, status: "active", pendingRequisition: pending, claimedRequisitions: {} },
    pendingEncounter: null,
    travel: null,
  }));
}

beforeEach(() => {
  vi.restoreAllMocks();
  useNavStore.getState().generateSector("phase23a-reset");
  useGameStore.setState((state) => ({ resources: { ...state.resources, credits: 600 }, isPaused: true, gameOver: null, requisitionReceipts: {} }));
  useInventoryStore.setState({ requisitionReceipts: {} });
  useSkillStore.setState({ availablePoints: 3, earnedPoints: 0, requisitionReceipts: {} });
  useReportStore.setState({ reports: [], requisitionReceipts: {} });
  useCrewStore.setState({ crew: initialCrew.map((member) => ({ ...member, alive: true })) });
  useRecruitStore.setState({ pity: 0, pullHistory: [], candidatePool: [], lastResults: [] });
});

describe("Phase 23-A starting economy and save hydration", () => {
  it("starts new games at ₢600 while preserving an existing saved balance", () => {
    expect(RESOURCES.START_CREDITS).toBe(600);
    useGameStore.getState().resetGame();
    expect(useGameStore.getState().resources.credits).toBe(600);
    const merged = mergePersistedGameState({ resources: { credits: 1437, fuel: 61, oxygen: 72, hull: 83 } }, useGameStore.getState());
    expect(merged.resources).toMatchObject({ credits: 1437, fuel: 61, oxygen: 72, hull: 83 });
    expect(mergePersistedGameState({ resources: { credits: 1437 } }, useGameStore.getState()).requisitionReceipts).toEqual({});
  });

  it("hydrates legacy receipt ledgers empty and computes the rescue reserve boundary", () => {
    expect(useInventoryStore.getState().requisitionReceipts).toEqual({});
    expect(useSkillStore.getState().requisitionReceipts).toEqual({});
    expect(useReportStore.getState().requisitionReceipts).toEqual({});
    expect(getPostInvestmentBalance(600, 240)).toBe(RESCUE_RESERVE_CREDITS);
    expect(getPostInvestmentBalance(599, 240)).toBeLessThan(RESCUE_RESERVE_CREDITS);
  });

  it("starts with two tritanium but preserves a saved inventory quantity", () => {
    expect(mergeItems([]).find((item) => item.id === "tritanium")?.qty).toBe(2);
    expect(mergeItems([{ id: "tritanium", qty: 24 }]).find((item) => item.id === "tritanium")?.qty).toBe(24);
  });
});

describe("pending gate requisition", () => {
  it("defaults legacy saves to no entitlement and drops stale claim ids", () => {
    expect(normalizeCampaignState({ expeditionId: "first-frontier", status: "active" }).pendingRequisition).toBeNull();
    const stale = normalizeCampaignState({
      expeditionId: "first-frontier",
      status: "active",
      pendingRequisition: { ...pendingRequisition(), claimId: "wrong:sector:1" },
      claimedRequisitions: { "wrong:sector:1": { packageId: "maintenance" } },
    });
    expect(stale.pendingRequisition).toBeNull();
    expect(stale.claimedRequisitions).toEqual({});
  });

  it("blocks only travel while time and existing systems keep ticking", () => {
    setPending();
    const target = useNavStore.getState().sector.nodes.find((node) => node.id !== useNavStore.getState().currentNodeId);
    expect(useNavStore.getState().planRoute(target.id, 20)).toMatchObject({ ok: false, reason: "pendingRequisition" });
    const before = useGameStore.getState().currentMinute;
    useGameStore.getState().advanceMinutes(60);
    expect(() => processTimedJobs(60)).not.toThrow();
    expect(useGameStore.getState().currentMinute).toBe(before + 60);
    expect(useNavStore.getState().campaign.pendingRequisition).not.toBeNull();
  });

  it.each([
    ["maintenance", 120, "salvage-scrap", 6],
    ["refit", 260, "tritanium", 2],
    ["personnel", 360, null, 0],
  ])("claims %s raw resources and skill once", (packageId, creditGain, itemId, itemGain) => {
    setPending();
    const beforeCredits = useGameStore.getState().resources.credits;
    const beforeItem = itemId ? useInventoryStore.getState().items.find((item) => item.id === itemId)?.qty ?? 0 : 0;
    const first = claimGateRequisition(packageId, "first-frontier:sector:1", 30);
    expect(first).toMatchObject({ ok: true, newlyClaimed: true });
    expect(useGameStore.getState().resources.credits).toBe(beforeCredits + creditGain);
    if (itemId) expect(useInventoryStore.getState().items.find((item) => item.id === itemId)?.qty).toBe(beforeItem + itemGain);
    expect(useSkillStore.getState()).toMatchObject({ availablePoints: 4, earnedPoints: 1 });
    const second = claimGateRequisition(packageId, "first-frontier:sector:1", 31);
    expect(second).toMatchObject({ ok: false, newlyClaimed: false });
    expect(useGameStore.getState().resources.credits).toBe(beforeCredits + creditGain);
    expect(useSkillStore.getState()).toMatchObject({ availablePoints: 4, earnedPoints: 1 });
  });

  it("completes the finale only after the final package is claimed", () => {
    setPending(pendingRequisition(5, { baseCredits: 216, isExpeditionFinale: true }));
    expect(useNavStore.getState().campaign.status).toBe("active");
    const result = claimGateRequisition("maintenance", "first-frontier:sector:5", 99);
    expect(result.effects.some((effect) => effect.kind === "campaignComplete")).toBe(true);
    expect(useNavStore.getState().campaign).toMatchObject({ status: "completed", completedAtMinute: 99, pendingRequisition: null });
    expect(useNavStore.getState().campaign.claimedRequisitions["first-frontier:sector:5"]).toBeTruthy();
    expect(claimGateRequisition("maintenance", "first-frontier:sector:5", 100)).toMatchObject({ ok: false, reason: "noPendingRequisition" });
    expect(useReportStore.getState().reports.filter((report) => report.meta?.claimId === "first-frontier:sector:5")).toHaveLength(1);
  });

  it("rejects a missing or stale claim id without delivering anything", () => {
    setPending();
    const before = useGameStore.getState().resources.credits;
    expect(claimGateRequisition("maintenance", null, 20)).toMatchObject({ ok: false, reason: "missingClaimId" });
    expect(claimGateRequisition("maintenance", "first-frontier:sector:2", 20)).toMatchObject({ ok: false, reason: "staleClaim" });
    expect(useGameStore.getState().resources.credits).toBe(before);
    expect(useNavStore.getState().campaign.pendingRequisition).not.toBeNull();
  });

  it("rejects an invalid encounter option instead of falling back to the first option", () => {
    useNavStore.setState({ pendingEncounter: { id: "exact-option", title: "test", options: [{ id: "valid", label: "valid", outcome: [{ kind: "resource", delta: { credits: 999 } }] }] } });
    const before = useGameStore.getState().resources.credits;
    expect(applyNavigationEncounter("stale-callback", 20)).toMatchObject({ ok: false, reason: "invalidOption" });
    expect(useGameStore.getState().resources.credits).toBe(before);
    expect(useNavStore.getState().pendingEncounter?.id).toBe("exact-option");
  });

  it("does not let a stale same-package callback claim the next sector requisition", () => {
    const sectorOne = pendingRequisition(1);
    const staleEncounter = createGateRequisitionEncounter(sectorOne);
    const staleOptionId = `claim:${sectorOne.claimId}:maintenance`;
    const sectorTwo = pendingRequisition(2);
    useNavStore.setState((state) => ({
      campaign: { ...state.campaign, status: "active", pendingRequisition: sectorTwo, claimedRequisitions: {} },
      pendingEncounter: createGateRequisitionEncounter(sectorTwo),
    }));
    const before = useGameStore.getState().resources.credits;

    expect(applyNavigationEncounter(staleOptionId, 40, { manual: true, expectedClaimId: staleEncounter.claimId })).toMatchObject({ ok: false });
    expect(useGameStore.getState().resources.credits).toBe(before);
    expect(useNavStore.getState().campaign.pendingRequisition?.claimId).toBe(sectorTwo.claimId);

    const currentOptionId = `claim:${sectorTwo.claimId}:maintenance`;
    expect(applyNavigationEncounter(currentOptionId, 41, { manual: true, expectedClaimId: sectorTwo.claimId })).toMatchObject({ ok: true, newlyClaimed: true });
    expect(useNavStore.getState().campaign.claimedRequisitions[sectorTwo.claimId]).toBeTruthy();
    expect(applyNavigationEncounter(currentOptionId, 42, { manual: true, expectedClaimId: sectorTwo.claimId })).toMatchObject({ ok: false });
  });

  it.each(["credits", "items", "skill", "report"])("recovers after interruption following %s and applies every payout exactly once", (interruptAfter) => {
    setPending();
    const claimId = "first-frontier:sector:1";
    const beforeCredits = useGameStore.getState().resources.credits;
    const beforeScrap = useInventoryStore.getState().items.find((item) => item.id === "salvage-scrap")?.qty ?? 0;
    expect(() => claimGateRequisition("maintenance", claimId, 30, { afterStep: (step) => { if (step === interruptAfter) throw new Error("simulated crash"); } })).toThrow("simulated crash");
    expect(useNavStore.getState().campaign.pendingRequisition?.claimId).toBe(claimId);
    const retry = claimGateRequisition("maintenance", claimId, 31);
    expect(retry).toMatchObject({ ok: true, newlyClaimed: true, finalized: true });
    expect(useGameStore.getState().resources.credits).toBe(beforeCredits + 120);
    expect(useInventoryStore.getState().items.find((item) => item.id === "salvage-scrap")?.qty).toBe(beforeScrap + 6);
    expect(useSkillStore.getState()).toMatchObject({ availablePoints: 4, earnedPoints: 1 });
    expect(useReportStore.getState().reports.filter((report) => report.meta?.claimId === claimId)).toHaveLength(1);
    expect(useNavStore.getState().campaign.pendingRequisition).toBeNull();
  });

  it("keeps earned points through a skill reset", () => {
    useSkillStore.getState().grantPoint(2);
    useSkillStore.getState().applyValidatedReset(0);
    expect(useSkillStore.getState()).toMatchObject({ availablePoints: 5, earnedPoints: 2 });
  });
});

describe("recruitment affordability and refunds", () => {
  it("uses the approved random and rarity-specific prices", () => {
    expect(RECRUIT_COST).toMatchObject({ single: 240, ten: 2160, tenDiscount: 240 });
    expect(getCandidateRecruitCost("common")).toBe(160);
    expect(getCandidateRecruitCost("rare")).toBe(240);
    expect(getCandidateRecruitCost("epic")).toBe(480);
    expect(getCandidateRecruitCost("legendary")).toBe(720);
  });

  it.each([[1, 239], [10, 1079]])("rejects an unaffordable %i-pull atomically", (count, credits) => {
    useGameStore.setState((state) => ({ resources: { ...state.resources, credits } }));
    const beforeCrew = useCrewStore.getState().crew.length;
    expect(useRecruitStore.getState().pull(count)).toMatchObject({ ok: false, reason: "credits" });
    expect(useGameStore.getState().resources.credits).toBe(credits);
    expect(useCrewStore.getState().crew).toHaveLength(beforeCrew);
  });

  it("caps a partially accepted batch refund below the paid batch cost", () => {
    useCrewStore.setState({ crew: Array.from({ length: 9 }, (_, index) => ({ id: `slot-${index}`, name: `Crew ${index}`, alive: true })) });
    useGameStore.setState((state) => ({ resources: { ...state.resources, credits: RECRUIT_COST.ten } }));
    vi.spyOn(Math, "random").mockReturnValue(0);
    const result = useRecruitStore.getState().pull(10);
    expect(result.ok).toBe(true);
    expect(result.refund).toBeGreaterThanOrEqual(0);
    expect(result.refund).toBeLessThanOrEqual(result.cost);
    expect(result.cost).toBe(240);
    expect(useGameStore.getState().resources.credits).toBe(RECRUIT_COST.ten - result.cost + result.refund);
    expect(useCrewStore.getState().crew).toHaveLength(10);
    expect(result.results.filter((entry) => entry.memberId)).toHaveLength(1);
    expect(result.results.filter((entry) => entry.memberId).every((entry) => entry.netCost > 0 && entry.paidCost === 240)).toBe(true);
    expect(formatRecruitPullLog(result)).toBe(`영입 1회 완료: 비용 ₢240, 환급 ₢${result.refund}.`);
  });

  it("reports the actual roll count and charge when four batch slots remain", () => {
    useCrewStore.setState({ crew: Array.from({ length: 6 }, (_, index) => ({ id: `slot-${index}`, name: `Crew ${index}`, alive: true })) });
    useGameStore.setState((state) => ({ resources: { ...state.resources, credits: RECRUIT_COST.ten } }));
    vi.spyOn(Math, "random").mockReturnValue(0);
    const result = useRecruitStore.getState().pull(10);
    expect(result).toMatchObject({ ok: true, cost: 864 });
    expect(result.results).toHaveLength(4);
    expect(formatRecruitPullLog(result)).toBe(`영입 4회 완료: 비용 ₢864, 환급 ₢${result.refund}.`);
  });

  it("refunds a failed paid candidate acceptance exactly once", () => {
    const candidate = useRecruitStore.getState().addCandidate("nav-rookie-pilot", "test").candidate;
    useGameStore.setState((state) => ({ resources: { ...state.resources, credits: 200 } }));
    const originalRecruit = useCrewStore.getState().recruitCrew;
    useCrewStore.setState({ recruitCrew: () => ({ ok: false, reason: "capacity" }) });
    const result = useRecruitStore.getState().recruitFromCandidate(candidate.id);
    useCrewStore.setState({ recruitCrew: originalRecruit });
    expect(result).toMatchObject({ ok: false, reason: "capacity", cost: 160, refunded: 160 });
    expect(useGameStore.getState().resources.credits).toBe(200);
    expect(useRecruitStore.getState().candidatePool).toHaveLength(1);
  });
});
