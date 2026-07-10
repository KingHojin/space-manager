import { describe, expect, it } from "vitest";
import { deriveCrewMood, getMoodWorkMultiplier } from "../crewMood";

describe("crew mood derivation", () => {
  it("derives readable mood bands from needs without exceeding the small work multiplier band", () => {
    const inspired = { alive: true, fatigue: 5, needs: { mood: 92, hunger: 5, stress: 5, sleepDebt: 4, hygiene: 90 } };
    const low = { alive: true, fatigue: 90, needs: { mood: 20, hunger: 90, stress: 85, sleepDebt: 80, hygiene: 20 } };

    expect(deriveCrewMood(inspired).band).toBe("inspired");
    expect(getMoodWorkMultiplier(inspired)).toBe(1.12);
    expect(deriveCrewMood(low).band).toBe("low");
    expect(getMoodWorkMultiplier(low)).toBe(0.88);
  });

  it("treats dead crew as unavailable and neutral for work math", () => {
    expect(deriveCrewMood({ alive: false })).toMatchObject({ score: 0, band: "unavailable" });
    expect(getMoodWorkMultiplier({ alive: false })).toBe(1);
  });
});
