import { beforeEach, describe, expect, it } from "vitest";
import { ENCOUNTER_TABLE } from "../../data/navEncounters";
import { useCombatStore } from "../../stores/combatStore";
import { useGameStore } from "../../stores/gameStore";
import { useMissionStore } from "../../stores/missionStore";
import { mergePersistedNavState, useNavStore } from "../../stores/navStore";
import { useShipStore } from "../../stores/shipStore";
import { usePolicyStore } from "../../stores/policyStore";
import { applyNavigationEncounter, processTimedJobs } from "../gameClock";
import { generateSector } from "../navigationSystem";

function jumpEncounter() {
  return { ...ENCOUNTER_TABLE.exit[0], options: ENCOUNTER_TABLE.exit[0].options.map((option) => ({ ...option })) };
}

function objectiveReadyState(sectorIndex = 0) {
  const sector = generateSector(`flow-${sectorIndex}`, { sectorIndex, nodeCount: 10 });
  const required = useNavStore.getState().campaign?.status === "completed" ? 5 : Math.min(5, 3 + sectorIndex);
  const fields = sector.nodes.filter((node) => node.type !== "station" && node.type !== "exit");
  const dangerous = fields.find((node) => node.danger >= Math.min(5, 3 + Math.floor(sectorIndex / 2)));
  const selected = Array.from(new Set([dangerous, ...fields].filter(Boolean))).slice(0, required);
  const gate = sector.nodes.find((node) => node.type === "exit");
  return {
    sector,
    sectorIndex,
    currentNodeId: gate.id,
    visited: [sector.nodes[0].id, ...selected.map((node) => node.id), gate.id],
    discovered: sector.nodes.map((node) => node.id),
    pendingEncounter: jumpEncounter(),
    campaign: { expeditionId: "first-frontier", status: "active", sectorsCleared: sectorIndex, highestSectorReached: sectorIndex + 1, totalFieldNodesVisited: selected.length, completedAtMinute: null },
  };
}

beforeEach(() => {
  useNavStore.getState().generateSector("campaign-flow-reset");
  useGameStore.setState({ isPaused: true, gameOver: null });
  const vesselId = useShipStore.getState().activeVesselId;
  useMissionStore.setState({ activeByVesselId: {}, pendingMissionEncountersByVesselId: {} });
  useCombatStore.setState({ combatByVesselId: { [vesselId]: null } });
  usePolicyStore.getState().resetPolicy("encounter-default-choice");
});

describe("campaign gate flow", () => {
  it("hydrates a legacy current sector without campaign metadata and preserves its current node", () => {
    const legacySector = generateSector("legacy-hydration", 8);
    const currentNodeId = legacySector.nodes[2].id;
    const legacy = {
      sector: { ...legacySector, progressionVersion: undefined, sectorIndex: undefined, difficulty: undefined },
      sectorIndex: 2,
      currentNodeId,
      visited: [legacySector.nodes[0].id, currentNodeId],
      discovered: [legacySector.nodes[0].id, currentNodeId],
      fuel: 62,
    };
    const merged = mergePersistedNavState(legacy, useNavStore.getState());
    expect(merged.currentNodeId).toBe(currentNodeId);
    expect(merged.sectorIndex).toBe(2);
    expect(merged.sector.difficulty.sectorNumber).toBe(3);
    expect(merged.campaign).toMatchObject({ status: "active", sectorsCleared: 2, highestSectorReached: 3 });
    expect(merged.fuel).toBe(62);
  });

  it("blocks a stale nextSector option when objective conditions are not met", () => {
    const sector = generateSector("stale-gate", { sectorIndex: 0 });
    useNavStore.setState({ sector, sectorIndex: 0, currentNodeId: sector.nodes.at(-1).id, visited: [sector.nodes[0].id], pendingEncounter: jumpEncounter() });
    const result = useNavStore.getState().resolveEncounter("jump", 10, { allowGateTransit: true });
    expect(result.logs[0]).toContain("관문 진입 차단");
    expect(useNavStore.getState().sectorIndex).toBe(0);
    expect(useNavStore.getState().campaign.status).toBe("active");
  });

  it("requires manual orchestration approval even when the objective is complete", () => {
    useNavStore.setState(objectiveReadyState(0));
    const result = useNavStore.getState().resolveEncounter("jump", 10);
    expect(result.logs[0]).toContain("수동 결재");
    expect(useNavStore.getState().sectorIndex).toBe(0);
  });

  it("blocks manual gate transit while an active mission exists", () => {
    useNavStore.setState(objectiveReadyState(0));
    const vesselId = useShipStore.getState().activeVesselId;
    useMissionStore.setState({ activeByVesselId: { [vesselId]: { id: "mission-active", status: "active" } } });
    const result = applyNavigationEncounter("jump", 20, { manual: true });
    expect(result.logs[0]).toContain("활성 임무");
    expect(useNavStore.getState().pendingEncounter).toBeTruthy();
    expect(useNavStore.getState().sectorIndex).toBe(0);
  });

  it("advances exactly one sector and returns the scaled gate reward", () => {
    useNavStore.setState(objectiveReadyState(0));
    const result = applyNavigationEncounter("jump", 30, { manual: true });
    expect(useNavStore.getState().sectorIndex).toBe(1);
    expect(useNavStore.getState().campaign.sectorsCleared).toBe(1);
    expect(result.effects.some((effect) => effect.kind === "resource" && effect.delta.credits === 240)).toBe(true);
    expect(useNavStore.getState().sector.difficulty.sectorNumber).toBe(2);
  });

  it("persists a one-time expedition milestone, pauses for summary, then allows timed work to resume", () => {
    useNavStore.setState(objectiveReadyState(4));
    useGameStore.setState({ isPaused: false });
    const result = applyNavigationEncounter("jump", 777, { manual: true });
    expect(result.effects.some((effect) => effect.kind === "campaignComplete")).toBe(true);
    expect(useNavStore.getState().campaign).toMatchObject({ status: "completed", sectorsCleared: 5, completedAtMinute: 777 });
    expect(useGameStore.getState().gameOver).toBeNull();
    expect(useGameStore.getState().isPaused).toBe(true);
    useGameStore.getState().setPaused(false);
    expect(processTimedJobs(60)).toBeUndefined();
    expect(useGameStore.getState().isPaused).toBe(false);
  });

  it("never lets policy automation clear a locked gate hold encounter", () => {
    const sector = generateSector("manual-locked-gate", { sectorIndex: 0 });
    const gate = sector.nodes.find((node) => node.type === "exit");
    const locked = {
      id: "exit-objective-locked",
      nodeType: "exit",
      nodeId: gate.id,
      title: "관문 좌표 잠금",
      options: [{ id: "hold", label: "현재 섹터로 복귀", outcome: [] }],
    };
    useNavStore.setState({ sector, currentNodeId: gate.id, pendingEncounter: locked });
    const policies = usePolicyStore.getState().policies;
    usePolicyStore.setState({ policies: { ...policies, "encounter-default-choice": { enabled: true, params: { stance: "safe" } } } });
    processTimedJobs(1);
    expect(useNavStore.getState().pendingEncounter).toEqual(locked);
  });
});

describe("immediate-leg travel billing", () => {
  it("previews and charges only the next leg because every node arrival requires an encounter", () => {
    const sector = {
      id: "leg-sector",
      seed: "leg-sector",
      nodes: [
        { id: "a", type: "station", danger: 1, richness: 1, connections: ["b"] },
        { id: "b", type: "debris", danger: 2, richness: 2, connections: ["a", "c"] },
        { id: "c", type: "exit", danger: 3, richness: 2, connections: ["b"] },
      ],
      edges: [
        { from: "a", to: "b", distance: 5 },
        { from: "b", to: "c", distance: 50 },
      ],
    };
    useNavStore.setState({ sector, currentNodeId: "a", fuel: 100, travel: null, driftState: null, pendingEncounter: null });
    const preview = useNavStore.getState().previewRoute("c", 0);
    expect(preview.ok).toBe(true);
    expect(preview.distance).toBe(5);
    expect(preview.travel.toId).toBe("b");
    expect(preview.travel.fuelCost).toBeCloseTo(5 * 1.15);
  });

  it("caps an overshooting final tick so actual burn equals the preview", () => {
    const sector = {
      id: "billing-sector",
      seed: "billing-sector",
      nodes: [
        { id: "a", type: "station", danger: 1, richness: 1, connections: ["b"] },
        { id: "b", type: "debris", danger: 2, richness: 2, connections: ["a"] },
      ],
      edges: [{ from: "a", to: "b", distance: 5 }],
    };
    useNavStore.setState({ sector, currentNodeId: "a", fuel: 100, travel: null, driftState: null, pendingEncounter: null });
    const preview = useNavStore.getState().previewRoute("b", 0);
    useNavStore.getState().planRoute("b", 0);
    const result = useNavStore.getState().tickTravel(preview.duration + 60, preview.duration + 60);
    const burned = -result.effects.find((effect) => effect.kind === "fuel").delta;
    expect(burned).toBeCloseTo(preview.fuelCost, 8);
  });
});
