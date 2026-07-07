import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  INJURY_STATE_ORDER,
  applyInjury,
  canWorkWithInjury,
  chooseTreatmentTarget,
  getRoleCoverage,
  improveInjuryOneStage,
  injuryLabel,
  injuryPriority,
  injuryRank,
  injuryWorkSpeedMultiplier,
  isHealthy,
  isInjured,
  isSeriousOrWorse,
  normalizeInjury,
  rollPermanentTrait,
  shouldWorsenInjury,
  treatmentRatePerHour,
  worsenInjuryOneStage,
} from "../injurySystem";

describe("normalizeInjury", () => {
  it("normalizes a bare Korean-string injury into an object", () => {
    expect(normalizeInjury("중상")).toEqual({
      state: "serious",
      recoveryProgress: 0,
      treatedBy: null,
      permanentTraits: [],
      untreatedMinutes: 0,
    });
  });

  it("defaults unrecognized strings and missing values to healthy", () => {
    expect(normalizeInjury("nonsense")).toMatchObject({ state: "healthy" });
    expect(normalizeInjury(undefined)).toMatchObject({ state: "healthy" });
  });

  it("clamps recoveryProgress and untreatedMinutes on object input, dedupes traits", () => {
    const result = normalizeInjury({
      state: "minor",
      recoveryProgress: 250,
      untreatedMinutes: -5,
      permanentTraits: ["scarred", "scarred", "trauma"],
    });
    expect(result.recoveryProgress).toBe(100);
    expect(result.untreatedMinutes).toBe(0);
    expect(result.permanentTraits).toEqual(["scarred", "trauma"]);
  });

  it("falls back to healthy for an unrecognized object state", () => {
    expect(normalizeInjury({ state: "not-a-state" }).state).toBe("healthy");
  });
});

describe("injury queries (label/priority/rank/canWork/isHealthy/isInjured)", () => {
  it("healthy", () => {
    expect(isHealthy("healthy")).toBe(true);
    expect(isInjured("healthy")).toBe(false);
    expect(canWorkWithInjury("healthy")).toBe(true);
    expect(injuryLabel("healthy")).toBe("정상");
    expect(injuryPriority("healthy")).toBe("info");
    expect(injuryRank("healthy")).toBe(0);
  });

  it("minor can still work but is injured", () => {
    expect(isHealthy("경상")).toBe(false);
    expect(isInjured("경상")).toBe(true);
    expect(canWorkWithInjury("경상")).toBe(true);
    expect(injuryWorkSpeedMultiplier("경상")).toBe(0.8);
  });

  it("serious/critical/incapacitated cannot work", () => {
    expect(canWorkWithInjury("중상")).toBe(false);
    expect(canWorkWithInjury("위독")).toBe(false);
    expect(canWorkWithInjury("전투불능")).toBe(false);
    expect(injuryWorkSpeedMultiplier("중상")).toBe(0);
  });

  it("isSeriousOrWorse is true from serious upward, false below", () => {
    expect(isSeriousOrWorse("healthy")).toBe(false);
    expect(isSeriousOrWorse("경상")).toBe(false);
    expect(isSeriousOrWorse("중상")).toBe(true);
    expect(isSeriousOrWorse("위독")).toBe(true);
    expect(isSeriousOrWorse("전투불능")).toBe(true);
  });
});

describe("applyInjury", () => {
  it("upgrades to a strictly worse state and resets progress/treatment", () => {
    const member = { injury: normalizeInjury("healthy") };
    const next = applyInjury(member, "minor");
    expect(next.state).toBe("minor");
    expect(next.recoveryProgress).toBe(0);
    expect(next.treatedBy).toBeNull();
    expect(next.untreatedMinutes).toBe(0);
  });

  it("never downgrades an existing worse injury via applyInjury", () => {
    const member = { injury: normalizeInjury("serious") };
    const next = applyInjury(member, "minor");
    expect(next.state).toBe("serious");
  });

  it("accepts Korean incoming labels and maps them through STRING_TO_STATE", () => {
    const member = { injury: normalizeInjury("healthy") };
    expect(applyInjury(member, "전사").state).toBe("incapacitated");
  });
});

describe("improveInjuryOneStage / worsenInjuryOneStage", () => {
  it("improve steps down the INJURY_STATE_ORDER by one, floors at healthy", () => {
    expect(improveInjuryOneStage("중상").state).toBe("minor");
    expect(improveInjuryOneStage("healthy").state).toBe("healthy");
  });

  it("worsen steps up the INJURY_STATE_ORDER by one, ceilings at incapacitated", () => {
    expect(worsenInjuryOneStage("경상").state).toBe("serious");
    expect(worsenInjuryOneStage("전투불능").state).toBe("incapacitated");
  });

  it("both reset recoveryProgress/treatedBy/untreatedMinutes", () => {
    const injury = { state: "minor", recoveryProgress: 80, treatedBy: "medic-1", untreatedMinutes: 30, permanentTraits: [] };
    expect(improveInjuryOneStage(injury)).toMatchObject({ recoveryProgress: 0, treatedBy: null, untreatedMinutes: 0 });
    expect(worsenInjuryOneStage(injury)).toMatchObject({ recoveryProgress: 0, treatedBy: null, untreatedMinutes: 0 });
  });
});

describe("rollPermanentTrait", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns null when the roll is above the 0.35 threshold", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.9);
    expect(rollPermanentTrait([])).toBeNull();
  });

  it("returns a trait not already held when the roll succeeds", () => {
    // First call feeds the threshold check (<=0.35 passes), second call picks the pool index.
    vi.spyOn(Math, "random").mockReturnValueOnce(0.1).mockReturnValueOnce(0);
    const trait = rollPermanentTrait(["chronic_fatigue"]);
    expect(["trauma", "scarred"]).toContain(trait);
  });

  it("returns null when every trait is already held", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    expect(rollPermanentTrait(["chronic_fatigue", "trauma", "scarred"])).toBeNull();
  });
});

describe("getRoleCoverage", () => {
  it("counts only alive, work-capable members per role and flags required roles with zero coverage", () => {
    const crew = [
      { id: "1", role: "함교", alive: true, injury: "healthy" },
      { id: "2", role: "기관실", alive: true, injury: "중상" }, // can't work -> not counted
      { id: "3", role: "의무실", alive: false, injury: "healthy" }, // dead -> not counted
    ];
    const { counts, missingRoles } = getRoleCoverage(crew);
    expect(counts.함교).toBe(1);
    expect(counts.기관실).toBe(0);
    expect(counts.의무실).toBe(0);
    expect(missingRoles).toEqual(expect.arrayContaining(["기관실", "의무실"]));
    // 조리실 is marked required: false, so it must not appear even though coverage is 0.
    expect(missingRoles).not.toContain("조리실");
  });
});

describe("chooseTreatmentTarget", () => {
  it("picks the alive, injured (not incapacitated) member with the highest injury rank", () => {
    const crew = [
      { id: "a", alive: true, injury: "경상" },
      { id: "b", alive: true, injury: "중상" },
      { id: "c", alive: true, injury: "전투불능" }, // excluded: incapacitated
      { id: "d", alive: false, injury: "위독" }, // excluded: dead
    ];
    expect(chooseTreatmentTarget(crew)?.id).toBe("b");
  });

  it("breaks ties on untreatedMinutes descending", () => {
    const crew = [
      { id: "a", alive: true, injury: { state: "serious", untreatedMinutes: 10 } },
      { id: "b", alive: true, injury: { state: "serious", untreatedMinutes: 40 } },
    ];
    expect(chooseTreatmentTarget(crew)?.id).toBe("b");
  });

  it("returns null when nobody needs treatment", () => {
    expect(chooseTreatmentTarget([{ id: "a", alive: true, injury: "healthy" }])).toBeNull();
    expect(chooseTreatmentTarget([])).toBeNull();
  });
});

describe("treatmentRatePerHour", () => {
  it("returns 0 for healthy", () => {
    expect(treatmentRatePerHour({ injury: "healthy" })).toBe(0);
  });

  it("scales with medic presence and active medic count for minor/serious/critical/incapacitated", () => {
    expect(treatmentRatePerHour({ injury: "경상", hasMedic: false })).toBe(4);
    expect(treatmentRatePerHour({ injury: "경상", hasMedic: true, activeMedicCount: 0 })).toBe(22);
    expect(treatmentRatePerHour({ injury: "경상", hasMedic: true, activeMedicCount: 2 })).toBe(34);
    expect(treatmentRatePerHour({ injury: "중상", hasMedic: false })).toBe(0);
    expect(treatmentRatePerHour({ injury: "중상", hasMedic: true, activeMedicCount: 1 })).toBe(20);
    expect(treatmentRatePerHour({ injury: "위독", hasMedic: true, activeMedicCount: 1 })).toBe(13);
    expect(treatmentRatePerHour({ injury: "전투불능", hasMedic: false })).toBe(0.35);
    expect(treatmentRatePerHour({ injury: "전투불능", hasMedic: true, activeMedicCount: 1 })).toBe(3);
  });
});

describe("shouldWorsenInjury", () => {
  it("never worsens while healthy (worsenAfterMinutes is Infinity)", () => {
    expect(shouldWorsenInjury({ injury: "healthy", deltaMinutes: 1e9 })).toBe(false);
  });

  it("never worsens while actively being treated", () => {
    expect(shouldWorsenInjury({ injury: { state: "minor", untreatedMinutes: 1000 }, deltaMinutes: 100, isBeingTreated: true })).toBe(false);
  });

  it("worsens once untreatedMinutes + deltaMinutes crosses the (medic-adjusted) threshold", () => {
    // minor worsenAfterMinutes = 720, with medic threshold stays 720.
    expect(shouldWorsenInjury({ injury: { state: "minor", untreatedMinutes: 719 }, deltaMinutes: 1, hasMedic: true })).toBe(true);
    expect(shouldWorsenInjury({ injury: { state: "minor", untreatedMinutes: 700 }, deltaMinutes: 1, hasMedic: true })).toBe(false);
  });

  it("lowers the threshold to 70% when no medic is present", () => {
    // serious worsenAfterMinutes = 540; without a medic threshold = 378.
    expect(shouldWorsenInjury({ injury: { state: "serious", untreatedMinutes: 377 }, deltaMinutes: 1, hasMedic: false })).toBe(true);
    expect(shouldWorsenInjury({ injury: { state: "serious", untreatedMinutes: 377 }, deltaMinutes: 1, hasMedic: true })).toBe(false);
  });

  it("incapacitated never worsens further (worsenAfterMinutes is Infinity)", () => {
    expect(shouldWorsenInjury({ injury: { state: "incapacitated", untreatedMinutes: 1e6 }, deltaMinutes: 1e6, hasMedic: false })).toBe(false);
  });
});

describe("INJURY_STATE_ORDER sanity", () => {
  it("is the canonical worsening order", () => {
    expect(INJURY_STATE_ORDER).toEqual(["healthy", "minor", "serious", "critical", "incapacitated"]);
  });
});
