import { describe, expect, it } from "vitest";
import { DEFAULT_CREW_TRAIT_IDS } from "../../data/crewTraits";
import { initialCrew } from "../../data/crew";
import { useCrewStore } from "../crewStore";

describe("crewStore Phase 21-A personality traits", () => {
  it("normalizes initial crew with display-only personality trait ids", () => {
    const crew = useCrewStore.getState().crew;

    for (const member of initialCrew) {
      const stored = crew.find((entry) => entry.id === member.id);
      expect(stored.personalityTraitIds).toEqual(DEFAULT_CREW_TRAIT_IDS[member.id]);
    }
  });

  it("keeps valid recruited trait ids and drops unknown values", () => {
    const id = `trait-test-${Date.now()}`;
    const result = useCrewStore.getState().recruitCrew({
      id,
      name: "테스트 승무원",
      role: "함교",
      trait: "검증 대상",
      personalityTraitIds: ["steady_hand", "unknown_trait", "steady_hand", "curious_mind"],
      stats: { piloting: 1 },
    });

    expect(result.ok).toBe(true);
    const stored = useCrewStore.getState().crew.find((member) => member.id === id);
    expect(stored.personalityTraitIds).toEqual(["steady_hand", "curious_mind"]);
  });
  it("updates relationship affinity when crew AI places living crew in the same room", () => {
    const original = useCrewStore.getState();
    useCrewStore.setState({
      ...original,
      crew: [
        { id: "rel-a", name: "A", alive: true, role: "함교", fatigue: 0, injury: "healthy", needs: { hunger: 0, mood: 90, stress: 0, sleepDebt: 0, hygiene: 100 }, stats: {} },
        { id: "rel-b", name: "B", alive: true, role: "포탑", fatigue: 0, injury: "healthy", needs: { hunger: 0, mood: 90, stress: 0, sleepDebt: 0, hygiene: 100 }, stats: {} },
      ],
      crewActivities: [],
      relationships: {},
      lastCrewAiAt: null,
    });

    useCrewStore.getState().runCrewAI({
      currentMinute: 10,
      rooms: { living: { id: "living", condition: 10, load: 90, activeCrisisId: null, assignedMemberIds: [], tier: 3, modules: [] } },
      activeCrises: [],
    });

    expect(useCrewStore.getState().relationships["rel-a::rel-b"]?.affinity).toBeGreaterThan(0);
    useCrewStore.setState(original, true);
  });

});
