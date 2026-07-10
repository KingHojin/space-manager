import { describe, expect, it } from "vitest";
import { getAllZones } from "../../data/sectors";
import { useExplorationStore } from "../../stores/explorationStore";
import { useNavStore } from "../../stores/navStore";

// Bug-fix round 21: Menu.jsx / BottomDock.jsx / Combat.jsx used to read
// explorationStore.discoveredZoneIds — a dead field with zero write callers
// since Phase 18-C, frozen forever at its initial value
// ["anchor-station", "blue-drift"] (danger 1 and 2). See
// docs/NEXT_CHAT_HANDOFF.md "알려진 지뢰". The real, currently-updating
// exploration state lives in navStore's sector/discovered/visited.
//
// This file reproduces the exact expressions those three components used
// (the "old" formulas, kept here only as a regression pin showing they were
// permanently frozen) against the expressions they were rewired to use (the
// "new" formulas, mirroring the components' current source), driving real
// navStore state the same way the game loop does (generateSector +
// revealHiddenNodes — the same store actions Exploration.jsx uses).
//
// Phase 22-B makes the last node the sector's deterministic danger ceiling.
// Sector 1's ceiling is 3 (later sectors rise through 4/5/6/7), so revealing
// the whole first sector still guarantees danger rises above the dead legacy
// ceiling of 2 without relying on an RNG-dependent field-node roll.

function oldMaxDanger() {
  const discoveredZoneIds = useExplorationStore.getState().discoveredZoneIds;
  return Math.max(1, ...getAllZones().filter((zone) => discoveredZoneIds.includes(zone.id)).map((zone) => zone.danger));
}

function newMaxDanger() {
  const { sector, discovered } = useNavStore.getState();
  return Math.max(1, ...(sector?.nodes ?? []).filter((node) => discovered.includes(node.id)).map((node) => node.danger));
}

function oldExploredPercent() {
  const discoveredZoneIds = useExplorationStore.getState().discoveredZoneIds;
  const totalZones = getAllZones().length;
  return Math.round((discoveredZoneIds.length / Math.max(1, totalZones)) * 100);
}

function newExploredPercent() {
  const { sector, discovered } = useNavStore.getState();
  const totalZones = sector?.nodes?.length ?? 0;
  return Math.round((discovered.length / Math.max(1, totalZones)) * 100);
}

function oldHasHighDangerZone() {
  const discoveredZoneIds = useExplorationStore.getState().discoveredZoneIds;
  return getAllZones().some((zone) => discoveredZoneIds.includes(zone.id) && zone.danger >= 4);
}

function newHasHighDangerZone() {
  const { sector, discovered } = useNavStore.getState();
  return (sector?.nodes ?? []).some((node) => discovered.includes(node.id) && node.danger >= 4);
}

describe("Combat.jsx maxDanger (pickEnemyFleet input)", () => {
  it("old dead-field formula stays pinned at 2 forever, even as exploration fully progresses", () => {
    useNavStore.getState().generateSector("dead-field-seed-1");
    expect(oldMaxDanger()).toBe(2);
    useNavStore.getState().revealHiddenNodes(20);
    expect(oldMaxDanger()).toBe(2);
  });

  it("new navStore-based formula rises above the old fixed ceiling once the sector is explored", () => {
    useNavStore.getState().generateSector("dead-field-seed-2");
    const before = newMaxDanger();
    const revealed = useNavStore.getState().revealHiddenNodes(20);
    expect(revealed.length).toBeGreaterThan(0);
    const after = newMaxDanger();
    expect(after).toBeGreaterThanOrEqual(before);
    // Sector 1's exit is its fixed danger ceiling of 3.
    expect(after).toBeGreaterThan(2);
    expect(after).toBeGreaterThanOrEqual(3);
  });

  it("new formula only counts nodes that are actually discovered, not the whole sector", () => {
    // Synthetic sector with a manually controlled discovered set, so this
    // pins the "scoped to discovered nodes only" behavior deterministically
    // instead of depending on generateSector's random initial reveal radius.
    const sector = {
      id: "synthetic",
      name: "synthetic",
      seed: "synthetic",
      nodes: [
        { id: "n0", type: "station", danger: 1, connections: ["n1"] },
        { id: "n1", type: "exit", danger: 7, connections: ["n0"] },
      ],
      edges: [],
    };
    useNavStore.setState({ sector, currentNodeId: "n0", discovered: ["n0"] });
    expect(newMaxDanger()).toBe(1);
    useNavStore.setState({ discovered: ["n0", "n1"] });
    expect(newMaxDanger()).toBe(7);
  });
});

describe("Menu.jsx 탐사율/구역 (exploredPercent)", () => {
  it("old dead-field formula never moves regardless of navStore exploration progress", () => {
    useNavStore.getState().generateSector("dead-field-seed-4");
    const before = oldExploredPercent();
    useNavStore.getState().revealHiddenNodes(20);
    expect(oldExploredPercent()).toBe(before);
  });

  it("new navStore-based formula increases as more nodes are discovered", () => {
    useNavStore.getState().generateSector("dead-field-seed-5");
    const before = newExploredPercent();
    useNavStore.getState().revealHiddenNodes(20);
    const after = newExploredPercent();
    expect(after).toBeGreaterThan(before);
    expect(after).toBe(100);
  });
});

describe("BottomDock.jsx 위험 구역 발견 뱃지 (hasHighDangerZone)", () => {
  it("old dead-field formula can never be true — discoveredZoneIds is pinned to danger-1/2 zones only", () => {
    useNavStore.getState().generateSector("dead-field-seed-6");
    expect(oldHasHighDangerZone()).toBe(false);
    useNavStore.getState().revealHiddenNodes(20);
    expect(oldHasHighDangerZone()).toBe(false);
  });

  it("new navStore-based formula flips true once a discovered node has danger >= 4", () => {
    // Synthetic sector with a manually controlled discovered set, for the
    // same determinism reason as the maxDanger scoping test above.
    const sector = {
      id: "synthetic-2",
      name: "synthetic-2",
      seed: "synthetic-2",
      nodes: [
        { id: "n0", type: "station", danger: 1, connections: ["n1"] },
        { id: "n1", type: "exit", danger: 5, connections: ["n0"] },
      ],
      edges: [],
    };
    useNavStore.setState({ sector, currentNodeId: "n0", discovered: ["n0"] });
    expect(newHasHighDangerZone()).toBe(false);
    useNavStore.setState({ discovered: ["n0", "n1"] });
    expect(newHasHighDangerZone()).toBe(true);
  });
});
