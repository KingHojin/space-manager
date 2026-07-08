import { describe, expect, it } from "vitest";
import { contracts, getContractById } from "../../data/contracts";
import { processTimedJobs } from "../gameClock";
import { hasVisitedNodeType } from "../navigationSystem";
import { useContractStore } from "../../stores/contractStore";
import { useGameStore } from "../../stores/gameStore";
import { useNavStore } from "../../stores/navStore";

// Regression coverage for the "survey contracts can never be completed" bug.
//
// Root cause: survey-type contracts (data/contracts.js) used to carry a
// targetZoneId pointing at a fixed legacy zone id from data/sectors.js
// (e.g. "blue-drift"). Market.jsx's canCompleteContract checked that id
// against explorationStore.scannedZoneIds — a field with zero write callers
// since Phase 18-C (scanZone/exploreZone/moveToZone are dead actions), frozen
// forever at its initial value ["anchor-station"]. Since live navigation runs
// entirely on navStore's procedurally generated sector (whose node ids never
// match the old fixed zone vocabulary anyway), the survey contract's
// condition could never become true through any player action.
//
// Fix: survey contracts now carry `targetNodeType` (live node-type vocabulary
// from data/navEncounters.js) and are completed by visiting a matching node
// in the *current* sector, checked via the pure hasVisitedNodeType helper
// against navStore's real sector/visited state.
//
// This test reproduces Market.jsx's canCompleteContract survey branch
// directly against the real stores (no explorationStore involved) to prove
// the fix end-to-end: accept the contract, actually navigate to and arrive
// at a matching node purely through gameClock ticks (the real game-loop
// path), and confirm completion becomes possible.
function canCompleteContract(contract, { acceptedIds, sector, visited, items }) {
  if (!acceptedIds.includes(contract.id)) return false;
  if (contract.type === "survey") return hasVisitedNodeType(sector, visited, contract.targetNodeType);
  if (!contract.itemId) return true;
  return (items.find((item) => item.id === contract.itemId)?.qty ?? 0) >= (contract.itemQty ?? 1);
}

function tick(minutes, times = 1) {
  for (let i = 0; i < times; i += 1) {
    useGameStore.getState().advanceMinutes(minutes);
    processTimedJobs(minutes);
  }
}

describe("survey contract data shape (bug-fix rewiring)", () => {
  it("blue-drift-survey targets a live node type, not a dead legacy zone id", () => {
    const contract = getContractById("blue-drift-survey");
    expect(contract.type).toBe("survey");
    expect(contract.targetNodeType).toBe("nebula");
    expect(contract.targetZoneId).toBeUndefined();
  });

  it("drops the dead targetZoneId field from item-based contract types too (no reader left in src/)", () => {
    contracts
      .filter((contract) => contract.type !== "survey")
      .forEach((contract) => {
        expect(contract.itemId).toBeTruthy();
        expect(contract.targetZoneId).toBeUndefined();
      });
  });
});

describe("survey contract completion end-to-end (previously impossible)", () => {
  it("cannot be completed immediately after accepting, before visiting a matching node", () => {
    useNavStore.getState().generateSector("survey-fix-seed-1");
    useContractStore.setState({ acceptedIds: [], completedIds: [] });
    const contract = getContractById("blue-drift-survey");
    useContractStore.getState().acceptContract(contract.id);

    const { sector, visited } = useNavStore.getState();
    const ready = canCompleteContract(contract, { acceptedIds: useContractStore.getState().acceptedIds, sector, visited, items: [] });
    expect(ready).toBe(false);
  });

  it("becomes completable after navigating to and arriving at a nebula node via real gameClock ticks", () => {
    useNavStore.getState().generateSector("survey-fix-seed-2");
    useContractStore.setState({ acceptedIds: [], completedIds: [] });
    const contract = getContractById("blue-drift-survey");
    useContractStore.getState().acceptContract(contract.id);

    // generateSector's node[1] is deterministically type "nebula" (see
    // systems/navigationSystem.js#generateSector's NODE_TYPES indexing) and is
    // always directly connected to node[0] (the starting station), so this is
    // a reachable, deterministic target regardless of seed.
    const nav = useNavStore.getState();
    const nebulaNode = nav.sector.nodes.find((node) => node.type === "nebula");
    expect(nebulaNode).toBeTruthy();
    expect(nav.visited).not.toContain(nebulaNode.id);

    const currentMinute = useGameStore.getState().currentMinute;
    const plan = useNavStore.getState().planRoute(nebulaNode.id, currentMinute);
    expect(plan.ok).toBe(true);

    const steps = Math.max(4, Math.ceil(plan.travel.duration / 5) + 2);
    tick(5, steps);

    expect(useNavStore.getState().travel).toBeNull();
    expect(useNavStore.getState().currentNodeId).toBe(nebulaNode.id);
    expect(useNavStore.getState().visited).toContain(nebulaNode.id);

    const finalState = useNavStore.getState();
    const ready = canCompleteContract(contract, {
      acceptedIds: useContractStore.getState().acceptedIds,
      sector: finalState.sector,
      visited: finalState.visited,
      items: [],
    });
    expect(ready).toBe(true);
  });

  it("stays incomplete if the contract was never accepted, even after visiting a matching node", () => {
    useNavStore.getState().generateSector("survey-fix-seed-3");
    useContractStore.setState({ acceptedIds: [], completedIds: [] });
    const contract = getContractById("blue-drift-survey");

    const nav = useNavStore.getState();
    const nebulaNode = nav.sector.nodes.find((node) => node.type === "nebula");
    const plan = useNavStore.getState().planRoute(nebulaNode.id, useGameStore.getState().currentMinute);
    tick(5, Math.max(4, Math.ceil(plan.travel.duration / 5) + 2));
    expect(useNavStore.getState().currentNodeId).toBe(nebulaNode.id);

    const finalState = useNavStore.getState();
    const ready = canCompleteContract(contract, {
      acceptedIds: useContractStore.getState().acceptedIds,
      sector: finalState.sector,
      visited: finalState.visited,
      items: [],
    });
    expect(ready).toBe(false);
  });
});
