import { describe, expect, it } from "vitest";
import { normalizeCrewTraitIds } from "../crewTraits";

describe("normalizeCrewTraitIds", () => {
  it("uses fallback ids only when no saved ids are present", () => {
    expect(normalizeCrewTraitIds(["hotshot"], ["steady_hand", "by_the_book"])).toEqual(["hotshot"]);
    expect(normalizeCrewTraitIds([], ["steady_hand", "by_the_book"])).toEqual(["steady_hand", "by_the_book"]);
  });

  it("drops unknown ids, removes duplicates, and caps the display set", () => {
    expect(normalizeCrewTraitIds(["steady_hand", "unknown", "steady_hand", "curious_mind", "hotshot", "caretaker"])).toEqual(["steady_hand", "curious_mind", "hotshot"]);
  });
});
