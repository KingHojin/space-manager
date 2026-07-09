import { describe, expect, it } from "vitest";
import { initialCrew } from "../../data/crew";
import { statLabel } from "../../utils/format";
import { getShipStatus, getSituationCards } from "../commandCenter";
import { useGameStore } from "../../stores/gameStore";
import { useNavStore } from "../../stores/navStore";
import { useRecruitStore } from "../../stores/recruitStore";

// Bug-fix round 21 — independent review fixes. Each block reproduces the
// exact broken expression a component used (kept as a regression pin) next
// to the fixed behavior, against real data/stores.

// ---------------------------------------------------------------------------
// Fix 1: StatsModal crew totals showed NaN for 조리 (cooking) on every fresh
// game — statLabel has 6 keys but data/crew.js's 4 starters only define 5
// stats, and `acc[key] += member.stats[key]` turns 0 + undefined into NaN.
// ---------------------------------------------------------------------------
describe("StatsModal crew stat totals (NaN fix)", () => {
  it("reproduces the bug: the old formula yields NaN for cooking with the shipped starter crew", () => {
    const totals = initialCrew.reduce(
      (acc, member) => {
        Object.keys(statLabel).forEach((key) => {
          acc[key] += member.stats[key];
        });
        return acc;
      },
      Object.fromEntries(Object.keys(statLabel).map((key) => [key, 0])),
    );
    expect(Number.isNaN(totals.cooking)).toBe(true);
  });

  it("fixed formula (missing stat counts as 0) yields finite totals for every statLabel key", () => {
    const totals = initialCrew.reduce(
      (acc, member) => {
        Object.keys(statLabel).forEach((key) => {
          acc[key] += member.stats?.[key] ?? 0;
        });
        return acc;
      },
      Object.fromEntries(Object.keys(statLabel).map((key) => [key, 0])),
    );
    Object.keys(statLabel).forEach((key) => {
      expect(Number.isFinite(totals[key])).toBe(true);
    });
    expect(totals.cooking).toBe(0);
    expect(totals.piloting).toBe(14 + 7 + 8 + 6);
  });
});

// ---------------------------------------------------------------------------
// Fix 2: Market's "연료 보급" only raised gameStore.resources.fuel, never
// navStore.fuel — but navStore.fuel is what buildTravelPlan gates on
// (`fuel <= 0` -> { ok:false, reason:"drifting" }) and what tickTravel
// burns. This drives the fixed buyService flow (spendCredits + addResources
// + navStore.refuel) against the real stores and proves route planning is
// restored, and pins the old flow's failure.
// ---------------------------------------------------------------------------
describe("Market fuel service refuels the travel-gating navStore.fuel", () => {
  const FUEL_SERVICE_CHANGES = { fuel: 35 }; // same catalog value as Market.jsx services[0]

  function connectedTargetId() {
    const nav = useNavStore.getState();
    return nav.sector.nodes.find((node) => node.id === nav.currentNodeId)?.connections?.[0];
  }

  it("reproduces the bug: the old flow (gameStore only) leaves navStore.fuel at 0 and route planning blocked", () => {
    useNavStore.getState().generateSector("market-fuel-bug");
    useNavStore.setState({ fuel: 0 });
    useGameStore.getState().addResources({ credits: 10000, fuel: -100 });

    // Old buyService body: spendCredits + addResources(changes) only.
    expect(useGameStore.getState().spendCredits(280)).toBe(true);
    useGameStore.getState().addResources(FUEL_SERVICE_CHANGES);

    expect(useGameStore.getState().resources.fuel).toBeGreaterThan(0);
    expect(useNavStore.getState().fuel).toBe(0); // travel meter untouched
    const plan = useNavStore.getState().planRoute(connectedTargetId(), 0);
    expect(plan.ok).toBe(false);
    expect(plan.reason).toBe("drifting");
  });

  it("fixed flow also calls navStore.refuel(changes.fuel), unblocking route planning", () => {
    useNavStore.getState().generateSector("market-fuel-fix");
    useNavStore.setState({ fuel: 0 });
    useGameStore.getState().addResources({ credits: 10000 });

    // Fixed buyService body: spendCredits + addResources(changes) + refuel.
    expect(useGameStore.getState().spendCredits(280)).toBe(true);
    useGameStore.getState().addResources(FUEL_SERVICE_CHANGES);
    useNavStore.getState().refuel(FUEL_SERVICE_CHANGES.fuel);

    expect(useNavStore.getState().fuel).toBe(35);
    const plan = useNavStore.getState().planRoute(connectedTargetId(), 0);
    expect(plan.ok).toBe(true);
    useNavStore.setState({ travel: null, route: [useNavStore.getState().currentNodeId] });
  });
});

// ---------------------------------------------------------------------------
// Fix 3: Overview.jsx hardcoded `pendingCombatEncounter: null` into both
// getShipStatus and getSituationCards, so the home screen could never show
// the "긴급 교전" critical alert. These tests pin the pure-function contract
// the rewired call site now exercises: passing the live flag produces the
// critical status/card, and null (the old hardcode) suppresses it.
// ---------------------------------------------------------------------------
describe("Overview 긴급 교전 wiring (commandCenter contract)", () => {
  const healthyResources = { hull: 100, fuel: 100, oxygen: 100, credits: 500 };
  const combatFlag = { id: "raider-wing", title: "미확인 적성 함선 접촉", enemyId: "raider-wing", fallback: true };

  it("getShipStatus reports 긴급 교전 when the live flag is passed (old null call could never reach this)", () => {
    const withFlag = getShipStatus({ resources: healthyResources, activeTravel: null, pendingTravelEvent: null, pendingCombatEncounter: combatFlag, activeCrises: [] });
    expect(withFlag.label).toBe("긴급 교전");
    const withNull = getShipStatus({ resources: healthyResources, activeTravel: null, pendingTravelEvent: null, pendingCombatEncounter: null, activeCrises: [] });
    expect(withNull.label).not.toBe("긴급 교전");
  });

  it("getSituationCards surfaces the pending-combat critical card first when the flag is passed", () => {
    const cards = getSituationCards({ resources: healthyResources, activeTravel: null, pendingTravelEvent: null, pendingCombatEncounter: combatFlag, crew: [], rooms: [], activeCrises: [] });
    const combatCard = cards.find((card) => card.id === "pending-combat");
    expect(combatCard).toBeTruthy();
    expect(combatCard.priority).toBe("critical");
    // critical sorts to the top of the queue the Overview renders
    expect(cards[0].priority).toBe("critical");
    const withoutFlag = getSituationCards({ resources: healthyResources, activeTravel: null, pendingTravelEvent: null, pendingCombatEncounter: null, crew: [], rooms: [], activeCrises: [] });
    expect(withoutFlag.find((card) => card.id === "pending-combat")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Fix 4: Exploration.jsx's "영입 후보 N명" used navStore.recruitCandidates —
// a write-only mirror that only ever grows (addRecruitCandidate) and is
// never shrunk when a candidate is recruited/dismissed. The live list is
// recruitStore.candidatePool. This proves the divergence and the fix.
// ---------------------------------------------------------------------------
describe("Exploration 영입 후보 count source (recruitStore.candidatePool)", () => {
  it("navStore.recruitCandidates never shrinks when the candidate is consumed from recruitStore", () => {
    useNavStore.setState({ recruitCandidates: [] });
    useRecruitStore.setState({ candidatePool: [] });

    // Same pair of writes gameClock.applyNavEffect's recruitOffer branch
    // does, using a real catalog template id (data/recruitment.js).
    const templateId = "nav-rookie-pilot";
    const result = useRecruitStore.getState().addCandidate(templateId, "navigation");
    useNavStore.getState().addRecruitCandidate(templateId);
    expect(result.ok).toBe(true);
    expect(useRecruitStore.getState().candidatePool.length).toBe(1);
    expect(useNavStore.getState().recruitCandidates.length).toBe(1);

    // Player dismisses the candidate — the live pool empties, the mirror doesn't.
    useRecruitStore.getState().removeCandidate(result.candidate.id);
    expect(useRecruitStore.getState().candidatePool.length).toBe(0); // what the UI now shows
    expect(useNavStore.getState().recruitCandidates.length).toBe(1); // stale mirror (old UI source)
  });
});
