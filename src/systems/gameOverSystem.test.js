import { describe, expect, it } from "vitest";
import { evaluateGameOver, getGameOverCause } from "./gameOverSystem";

describe("gameOverSystem", () => {
  it("ends the voyage when hull reaches zero", () => {
    expect(evaluateGameOver({ resources: { hull: 0 }, crew: [{ alive: true }] })).toBe("hull_destroyed");
  });

  it("ends the voyage when every crew member is dead", () => {
    expect(evaluateGameOver({ resources: { hull: 50 }, crew: [{ alive: false }, { alive: false }] })).toBe("all_crew_lost");
  });

  it("does not end a viable voyage", () => {
    expect(evaluateGameOver({ resources: { hull: 1 }, crew: [{ alive: true }, { alive: false }] })).toBeNull();
  });

  it("does not treat an empty pre-hydration crew list as a defeat", () => {
    expect(evaluateGameOver({ resources: { hull: 100 }, crew: [] })).toBeNull();
  });

  it("provides a safe fallback for unknown causes", () => {
    expect(getGameOverCause("unknown").title).toBe("항해 종료");
  });
});
