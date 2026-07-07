import { describe, expect, it } from "vitest";
import { processTimedJobs } from "../gameClock";
import { useCrewStore } from "../../stores/crewStore";
import { useGameStore } from "../../stores/gameStore";
import { useShipInteriorStore } from "../../stores/shipInteriorStore";
import { GAME_TIME } from "../../data/constants";

// Multi-tick integration scenario: drive processTimedJobs the same way the real
// game loop (useGameClock's setInterval effect) does, across many ticks, using
// the stores' real default state (no mocking). This is a characterization test
// for cross-store orchestration, not a determinism test — Math.random is left
// live on purpose to exercise crisis-spawn / injury / combat-adjacent branches.
describe("gameClock.processTimedJobs multi-tick integration", () => {
  it("runs 30 ticks of 15 game-minutes without throwing, keeping room stats in range and activities in sync with crew", () => {
    const TICKS = 30;
    const DELTA_MINUTES = 15;

    expect(() => {
      for (let tick = 0; tick < TICKS; tick += 1) {
        useGameStore.getState().advanceMinutes(DELTA_MINUTES);
        processTimedJobs(DELTA_MINUTES);
      }
    }).not.toThrow();

    // Game clock advanced by the expected total amount.
    const expectedMinute = GAME_TIME.START_MINUTE + TICKS * DELTA_MINUTES;
    expect(useGameStore.getState().currentMinute).toBe(expectedMinute);

    // Every room's condition/load must stay within the valid [0, 100] range.
    const rooms = useShipInteriorStore.getState().rooms;
    Object.values(rooms).forEach((room) => {
      expect(room.condition).toBeGreaterThanOrEqual(0);
      expect(room.condition).toBeLessThanOrEqual(100);
      expect(room.load).toBeGreaterThanOrEqual(0);
      expect(room.load).toBeLessThanOrEqual(100);
    });

    // crewActivities is produced 1:1 for every crew member (alive or dead).
    const crewState = useCrewStore.getState();
    expect(crewState.crewActivities).toHaveLength(crewState.crew.length);
    const activityMemberIds = crewState.crewActivities.map((activity) => activity.memberId).sort();
    const crewIds = crewState.crew.map((member) => member.id).sort();
    expect(activityMemberIds).toEqual(crewIds);

    // Resources stay within their normalized bounds (percent resources clamp to [0,100]).
    const resources = useGameStore.getState().resources;
    expect(resources.fuel).toBeGreaterThanOrEqual(0);
    expect(resources.fuel).toBeLessThanOrEqual(100);
    expect(resources.oxygen).toBeGreaterThanOrEqual(0);
    expect(resources.oxygen).toBeLessThanOrEqual(100);
    expect(resources.hull).toBeGreaterThanOrEqual(0);
    expect(resources.hull).toBeLessThanOrEqual(100);
    expect(resources.credits).toBeGreaterThanOrEqual(0);
  });
});
