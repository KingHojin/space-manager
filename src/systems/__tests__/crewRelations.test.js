import { describe, expect, it } from "vitest";
import { getRelationshipWorkMultiplier, normalizeRelationships, pairKey, relationshipBand, updateRelationshipsFromActivities } from "../crewRelations";

describe("crew relationships", () => {
  it("creates stable sorted pair keys and bands affinity", () => {
    expect(pairKey("b", "a")).toBe("a::b");
    expect(relationshipBand(40)).toBe("close");
    expect(relationshipBand(-40)).toBe("friction");
    expect(relationshipBand(0)).toBe("neutral");
  });

  it("normalizes saved relationship maps defensively", () => {
    expect(normalizeRelationships({ "b::a": { affinity: 200 } })).toEqual({ "a::b": { crewIds: ["a", "b"], affinity: 100, band: "close", lastSeenAt: null } });
  });


  it("returns small shared-work multipliers from relationship bands", () => {
    const relationships = {
      "a::b": { crewIds: ["a", "b"], affinity: -50, band: "friction" },
      "a::c": { crewIds: ["a", "c"], affinity: 50, band: "close" },
    };
    expect(getRelationshipWorkMultiplier("a", ["a", "b"], relationships)).toBe(0.9);
    expect(getRelationshipWorkMultiplier("a", ["a", "c"], relationships)).toBe(1.04);
    expect(getRelationshipWorkMultiplier("a", ["a", "d"], relationships)).toBe(1);
  });

  it("updates affinity for living crew sharing the same room", () => {
    const next = updateRelationshipsFromActivities({
      relationships: {},
      currentMinute: 120,
      crew: [{ id: "a", alive: true }, { id: "b", alive: true }, { id: "c", alive: false }],
      activities: [
        { memberId: "a", roomId: "galley" },
        { memberId: "b", roomId: "galley" },
        { memberId: "c", roomId: "galley" },
      ],
    });
    expect(next["a::b"]).toMatchObject({ crewIds: ["a", "b"], affinity: 2, band: "neutral", lastSeenAt: 120 });
    expect(next["a::c"]).toBeUndefined();
  });
});
