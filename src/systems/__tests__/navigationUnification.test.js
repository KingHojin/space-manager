import { describe, expect, it } from "vitest";
import { processTimedJobs } from "../gameClock";
import { useExplorationStore } from "../../stores/explorationStore";
import { useGameStore } from "../../stores/gameStore";
import { useNavStore } from "../../stores/navStore";

// Phase 18-C: explorationStore's zone-travel tick (processTravel/consumeTravelFuel
// in gameClock, plus their helpers in systems/travelSystem.js) has been removed.
// navStore.travel + tickTravel/tickDrift (processNavigation in gameClock) is now
// the single live travel path — it was already the only one Exploration.jsx (the
// real navigation UI) ever wrote to; explorationStore.startTravel had zero
// callers anywhere in src/. These tests pin down:
//   1. gameClock ticks actually drive a navStore.planRoute travel to arrival,
//      end to end, through processTimedJobs — the real game-loop entry point.
//   2. The legacy zone-travel action surface is gone from explorationStore.
//   3. systems/travelSystem.js no longer exists (it had zero importers left
//      once processTravel/consumeTravelFuel were removed from gameClock).
//   4. A stale legacy activeTravel value sitting in explorationStore (as it
//      would for a save written before this change) is inert under ticking —
//      nothing in the tick path reads or mutates it anymore.

function tick(minutes, times = 1) {
  for (let i = 0; i < times; i += 1) {
    useGameStore.getState().advanceMinutes(minutes);
    processTimedJobs(minutes);
  }
}

describe("navigation unification (Phase 18-C)", () => {
  it("removes the legacy zone-travel action surface from explorationStore", () => {
    const state = useExplorationStore.getState();
    expect(state.startTravel).toBeUndefined();
    expect(state.registerTravelFuelTick).toBeUndefined();
    expect(state.registerTravelRoll).toBeUndefined();
    expect(state.setPendingTravelEvent).toBeUndefined();
    expect(state.resolvePendingTravelEvent).toBeUndefined();
    expect(state.dismissPendingTravelEvent).toBeUndefined();
    expect(state.completeTravel).toBeUndefined();
    // pendingCombatEncounter is a *live* feature (navEncounters' combat effect
    // still writes it via gameClock's applyNavEffect) and must be kept.
    expect(state.setPendingCombatEncounter).toBeInstanceOf(Function);
    expect(state.clearPendingCombatEncounter).toBeInstanceOf(Function);
  });

  it("deletes systems/travelSystem.js entirely — it had zero live callers once processTravel was removed", async () => {
    await expect(import("../travelSystem")).rejects.toThrow();
  });

  it("drives a navStore.planRoute travel all the way to arrival purely through gameClock ticks", () => {
    const nav = useNavStore.getState();
    const fromId = nav.currentNodeId;
    const toId = nav.sector.nodes.find((node) => node.id === fromId)?.connections?.[0];
    expect(toId).toBeTruthy();

    const currentMinute = useGameStore.getState().currentMinute;
    const plan = useNavStore.getState().planRoute(toId, currentMinute);
    expect(plan.ok).toBe(true);
    expect(useNavStore.getState().travel).toBeTruthy();

    // Tick well past the planned duration in small steps so intermediate
    // progress (not just the final arrival tick) is exercised too.
    const steps = Math.max(4, Math.ceil(plan.travel.duration / 5) + 2);
    tick(5, steps);

    expect(useNavStore.getState().travel).toBeNull();
    expect(useNavStore.getState().currentNodeId).toBe(toId);
  });

  it("leaves a stale legacy activeTravel (simulating a pre-Phase-18-C save) completely untouched while ticking", () => {
    const staleTravel = { fromZoneId: "anchor-station", toZoneId: "blue-drift", startedAt: 0, completeAt: 1, duration: 1, fuelCost: 5 };
    const staleLog = ["레거시 세이브 잔재 로그"];
    useExplorationStore.setState({ activeTravel: staleTravel, pendingTravelEvent: null, travelLog: staleLog });

    expect(() => tick(15, 5)).not.toThrow();

    // Untouched — proves the tick path no longer reads/writes these fields at all.
    expect(useExplorationStore.getState().activeTravel).toEqual(staleTravel);
    expect(useExplorationStore.getState().travelLog).toEqual(staleLog);
  });

  // Round 20 cleanup: navStore.getNavCard had zero callers anywhere in src/
  // (grep across components/ and systems/ found only its own definition).
  it("removes the unused navStore.getNavCard helper", () => {
    expect(useNavStore.getState().getNavCard).toBeUndefined();
  });
});
