import { describe, expect, it } from "vitest";
import { generateSector, hasVisitedNodeType, isDocked, nodeToZone, routeDistance } from "../navigationSystem";

describe("routeDistance", () => {
  const sector = {
    edges: [
      { from: "a", to: "b", distance: 5 },
      { from: "b", to: "c", distance: 7 },
    ],
  };

  it("returns 0 for a route shorter than 2 nodes or a missing sector", () => {
    expect(routeDistance(sector, [])).toBe(0);
    expect(routeDistance(sector, ["a"])).toBe(0);
    expect(routeDistance(null, ["a", "b"])).toBe(0);
  });

  it("sums the distance of each consecutive edge along the route", () => {
    expect(routeDistance(sector, ["a", "b", "c"])).toBe(12);
  });

  it("looks up edges regardless of stored from/to order (edgeId is sorted)", () => {
    const reversedSector = { edges: [{ from: "b", to: "a", distance: 5 }] };
    expect(routeDistance(reversedSector, ["a", "b"])).toBe(5);
  });

  it("defaults an unlisted edge's distance to 1", () => {
    expect(routeDistance(sector, ["a", "z"])).toBe(1);
  });
});

describe("nodeToZone", () => {
  it("derives pos from x/y when pos is missing", () => {
    const zone = nodeToZone({ id: "n1", x: 10, y: 20, type: "wreck" });
    expect(zone.pos).toEqual({ x: 10, y: 20 });
  });

  it("preserves an existing pos field untouched", () => {
    const zone = nodeToZone({ id: "n1", pos: { x: 1, y: 2 }, x: 999, y: 999, type: "wreck" });
    expect(zone.pos).toEqual({ x: 1, y: 2 });
  });

  it("defaults distance to 0 when missing", () => {
    expect(nodeToZone({ id: "n1", type: "wreck" }).distance).toBe(0);
  });

  it("preserves an existing distance value", () => {
    expect(nodeToZone({ id: "n1", type: "wreck", distance: 4 }).distance).toBe(4);
  });
});

describe("generateSector (sanity check backing routeDistance/nodeToZone usage)", () => {
  it("produces a fully connected graph of nodes for a given seed", () => {
    const sector = generateSector("test-seed-1", 8);
    expect(sector.nodes.length).toBeGreaterThanOrEqual(7);
    expect(sector.nodes[0].type).toBe("station");
    expect(sector.nodes[sector.nodes.length - 1].type).toBe("exit");
  });

  it("is deterministic for the same seed", () => {
    const sectorA = generateSector("determinism-seed", 8);
    const sectorB = generateSector("determinism-seed", 8);
    expect(sectorB.nodes.map((node) => node.id)).toEqual(sectorA.nodes.map((node) => node.id));
    expect(sectorB.edges).toEqual(sectorA.edges);
  });
});

// hasVisitedNodeType backs the survey-contract completion check in Market.jsx
// (see data/contracts.js for why survey contracts moved off the dead
// explorationStore.scannedZoneIds field onto navStore's live sector/visited).
describe("hasVisitedNodeType", () => {
  const sector = {
    nodes: [
      { id: "n0", type: "station" },
      { id: "n1", type: "nebula" },
      { id: "n2", type: "debris" },
    ],
  };

  it("is true when a node of the given type has been visited", () => {
    expect(hasVisitedNodeType(sector, ["n0", "n1"], "nebula")).toBe(true);
  });

  it("is false when no visited node matches the given type", () => {
    expect(hasVisitedNodeType(sector, ["n0"], "nebula")).toBe(false);
  });

  it("is false when a node of the type exists in the sector but has not been visited", () => {
    expect(hasVisitedNodeType(sector, ["n0", "n2"], "nebula")).toBe(false);
  });

  it("is false when no node of the given type exists in the sector at all", () => {
    expect(hasVisitedNodeType(sector, ["n0", "n1", "n2"], "exit")).toBe(false);
  });

  it("is false for a missing sector, empty visited list, or missing nodeType", () => {
    expect(hasVisitedNodeType(null, ["n0"], "nebula")).toBe(false);
    expect(hasVisitedNodeType(sector, [], "nebula")).toBe(false);
    expect(hasVisitedNodeType(sector, ["n0", "n1"], undefined)).toBe(false);
    expect(hasVisitedNodeType({ nodes: [] }, ["n0"], "nebula")).toBe(false);
  });
});

describe("isDocked", () => {
  it("is docked at a station node with no active travel", () => {
    expect(isDocked({ id: "n0", type: "station" }, null)).toBe(true);
  });

  it("is not docked at a non-station node (e.g. nebula), even with no active travel", () => {
    expect(isDocked({ id: "n1", type: "nebula" }, null)).toBe(false);
  });

  it("is not docked at a station node while travel is in progress", () => {
    expect(isDocked({ id: "n0", type: "station" }, { fromId: "n0", toId: "n1", progress: 40 })).toBe(false);
  });

  it("is not docked at a station node while drift is active", () => {
    expect(isDocked({ id: "n0", type: "station" }, null, { reason: "fuel_empty" })).toBe(false);
  });

  it("is not docked when there is no current node", () => {
    expect(isDocked(null, null)).toBe(false);
    expect(isDocked(undefined, null)).toBe(false);
  });
});
