import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CRISIS_CATALOG,
  createCrisisRecord,
  crisisResponseRatePerMinute,
  getCrisisConfig,
  getCrisisResponderSlots,
  scoreCrisisForMember,
  shouldSpawnInternalCrisis,
} from "../crisisSystem";
import { WEAR } from "../../data/constants";

afterEach(() => {
  vi.restoreAllMocks();
});

function member(overrides = {}) {
  return { id: "m1", alive: true, role: "기관실", fatigue: 10, injury: "healthy", stats: { engineering: 10, medicine: 5, gunnery: 5, piloting: 5 }, ...overrides };
}

describe("createCrisisRecord", () => {
  it("builds a record with clamped severity and an escalateAt derived from config", () => {
    const record = createCrisisRecord({ roomId: "engineering", type: "fire", severity: 10, currentMinute: 0 });
    expect(record.roomId).toBe("engineering");
    expect(record.type).toBe("fire");
    expect(record.severity).toBe(3); // clamped to [1,3]
    expect(record.progress).toBe(0);
    expect(record.assignedCrewId).toBeNull();
    expect(record.assignedCrewIds).toEqual([]);
  });

  it("falls back to the overheat catalog entry for an unknown type", () => {
    const record = createCrisisRecord({ roomId: "bridge", type: "not-a-real-type", currentMinute: 5 });
    expect(record.type).toBe("overheat");
  });

  it("computes escalateAt as currentMinute + config.escalateMinutes", () => {
    const record = createCrisisRecord({ roomId: "engineering", type: "overheat", currentMinute: 100 });
    expect(record.escalateAt).toBe(100 + CRISIS_CATALOG.overheat.escalateMinutes);
  });
});

describe("getCrisisConfig", () => {
  it("returns the matching catalog entry", () => {
    expect(getCrisisConfig("fire")).toBe(CRISIS_CATALOG.fire);
  });

  it("falls back to overheat for an unknown type", () => {
    expect(getCrisisConfig("nope")).toBe(CRISIS_CATALOG.overheat);
  });
});

describe("getCrisisResponderSlots", () => {
  it("returns the configured slot count for a known crisis type", () => {
    expect(getCrisisResponderSlots({ type: "fire" })).toBe(CRISIS_CATALOG.fire.responderSlots);
  });

  it("is at least 1", () => {
    expect(getCrisisResponderSlots({ type: "overheat" })).toBeGreaterThanOrEqual(1);
  });
});

describe("scoreCrisisForMember", () => {
  it("returns null for a dead member", () => {
    const crisis = createCrisisRecord({ roomId: "engineering", type: "overheat", currentMinute: 0 });
    expect(scoreCrisisForMember(member({ alive: false }), crisis)).toBeNull();
  });

  it("returns null when the member cannot work due to injury", () => {
    const crisis = createCrisisRecord({ roomId: "engineering", type: "overheat", currentMinute: 0 });
    expect(scoreCrisisForMember(member({ injury: "중상" }), crisis)).toBeNull();
  });

  it("returns null when there is no crisis", () => {
    expect(scoreCrisisForMember(member(), null)).toBeNull();
  });

  it("scores a role-fit member higher than a non-fitting one for the same crisis", () => {
    const crisis = createCrisisRecord({ roomId: "engineering", type: "overheat", currentMinute: 0 });
    const fit = scoreCrisisForMember(member({ role: "기관실" }), crisis);
    const notFit = scoreCrisisForMember(member({ role: "함교" }), crisis);
    expect(fit).toBeGreaterThan(notFit);
  });

  it("scores higher severity crises higher, all else equal", () => {
    const low = createCrisisRecord({ roomId: "engineering", type: "overheat", severity: 1, currentMinute: 0 });
    const high = createCrisisRecord({ roomId: "engineering", type: "overheat", severity: 3, currentMinute: 0 });
    const scoreLow = scoreCrisisForMember(member(), low);
    const scoreHigh = scoreCrisisForMember(member(), high);
    expect(scoreHigh).toBeGreaterThan(scoreLow);
  });
});

describe("crisisResponseRatePerMinute", () => {
  it("is higher for a role-fit responder than a non-fit responder", () => {
    const crisis = createCrisisRecord({ roomId: "engineering", type: "overheat", currentMinute: 0 });
    const fitRate = crisisResponseRatePerMinute(member({ role: "기관실" }), crisis);
    const nonFitRate = crisisResponseRatePerMinute(member({ role: "함교" }), crisis);
    expect(fitRate).toBeGreaterThan(nonFitRate);
  });

  it("is lower for higher severity (baseMinutes scales up with severity)", () => {
    const low = createCrisisRecord({ roomId: "engineering", type: "overheat", severity: 1, currentMinute: 0 });
    const high = createCrisisRecord({ roomId: "engineering", type: "overheat", severity: 3, currentMinute: 0 });
    const rateLow = crisisResponseRatePerMinute(member(), low);
    const rateHigh = crisisResponseRatePerMinute(member(), high);
    expect(rateHigh).toBeLessThan(rateLow);
  });

  it("is reduced by higher fatigue (via the fatigue multiplier clamp)", () => {
    const crisis = createCrisisRecord({ roomId: "engineering", type: "overheat", currentMinute: 0 });
    const rested = crisisResponseRatePerMinute(member({ fatigue: 0 }), crisis);
    const tired = crisisResponseRatePerMinute(member({ fatigue: 200 }), crisis);
    expect(tired).toBeLessThan(rested);
  });
});

describe("shouldSpawnInternalCrisis", () => {
  it("returns null when the room already has an active crisis", () => {
    expect(shouldSpawnInternalCrisis({ room: { id: "engineering", activeCrisisId: "c1", condition: 10, load: 99 }, currentMinute: 3600, deltaMinutes: 1 })).toBeNull();
  });

  it("returns null when there is no room", () => {
    expect(shouldSpawnInternalCrisis({ room: null })).toBeNull();
  });

  it("does not roll unless an hour boundary was crossed, the tick was heavy (>=60min), or load >= 94", () => {
    vi.spyOn(Math, "random").mockReturnValue(0); // would always "succeed" if rolled
    const room = { id: "cargo", condition: 50, load: 50, activeCrisisId: null };
    // currentMinute=10, deltaMinutes=5 -> no hour boundary crossed (floor(5/60)===floor(10/60)), light tick, load<94
    expect(shouldSpawnInternalCrisis({ room, currentMinute: 10, deltaMinutes: 5 })).toBeNull();
  });

  it("rolls overheat for engineering once load >= 94 even mid-hour", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const room = { id: "engineering", condition: 90, load: 94, activeCrisisId: null };
    expect(shouldSpawnInternalCrisis({ room, currentMinute: 10, deltaMinutes: 5 })).toBe("overheat");
  });

  it("returns null when the random roll fails even though canRoll conditions are met", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.999);
    const room = { id: "engineering", condition: 90, load: 85, activeCrisisId: null };
    // heavy tick forces canRoll=true; load>=85 branch requires load>=94 OR random<0.55 to trigger overheat.
    expect(shouldSpawnInternalCrisis({ room, currentMinute: 60, deltaMinutes: 60 })).toBeNull();
  });

  it("can roll a danger-condition crisis when condition is at/under WEAR.dangerCondition on a heavy tick", () => {
    vi.spyOn(Math, "random").mockReturnValue(0); // always pass every probability check
    const room = { id: "cargo", condition: WEAR.dangerCondition, load: 10, activeCrisisId: null };
    const result = shouldSpawnInternalCrisis({ room, currentMinute: 60, deltaMinutes: 60 });
    expect(["power_loss", "fire"]).toContain(result);
  });
});
