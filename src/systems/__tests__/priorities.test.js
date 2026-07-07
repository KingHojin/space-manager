import { describe, expect, it } from "vitest";
import {
  PRIORITY_CONFIG,
  PRIORITY_ORDER,
  comparePriorityTasks,
  getNextPriority,
  getPriorityConfig,
  inferModulePriority,
  inferTrainingPriority,
  inferTreatmentPriority,
  normalizePriority,
} from "../priorities";

describe("normalizePriority", () => {
  it("returns the priority when it is a known key", () => {
    expect(normalizePriority("emergency")).toBe("emergency");
    expect(normalizePriority("high")).toBe("high");
    expect(normalizePriority("low")).toBe("low");
  });

  it("falls back to normal for unknown or missing values", () => {
    expect(normalizePriority("bogus")).toBe("normal");
    expect(normalizePriority(undefined)).toBe("normal");
    expect(normalizePriority(null)).toBe("normal");
  });
});

describe("getPriorityConfig", () => {
  it("returns the config for a normalized priority", () => {
    expect(getPriorityConfig("emergency")).toBe(PRIORITY_CONFIG.emergency);
    expect(getPriorityConfig("unknown-priority")).toBe(PRIORITY_CONFIG.normal);
  });
});

describe("getNextPriority", () => {
  it("cycles forward through PRIORITY_ORDER and wraps around", () => {
    expect(getNextPriority("emergency")).toBe("high");
    expect(getNextPriority("high")).toBe("normal");
    expect(getNextPriority("normal")).toBe("low");
    expect(getNextPriority("low")).toBe("emergency");
  });

  it("treats an unknown priority as normal before advancing", () => {
    expect(getNextPriority("bogus")).toBe(PRIORITY_ORDER[(PRIORITY_ORDER.indexOf("normal") + 1) % PRIORITY_ORDER.length]);
  });
});

describe("comparePriorityTasks", () => {
  it("orders by priority score first (emergency before low)", () => {
    const emergency = { priority: "emergency", completeAt: 100 };
    const low = { priority: "low", completeAt: 1 };
    expect(comparePriorityTasks(emergency, low)).toBeLessThan(0);
    expect(comparePriorityTasks(low, emergency)).toBeGreaterThan(0);
  });

  it("breaks ties on completeAt ascending, treating missing completeAt as 0", () => {
    const earlier = { priority: "normal", completeAt: 10 };
    const later = { priority: "normal", completeAt: 20 };
    expect(comparePriorityTasks(earlier, later)).toBeLessThan(0);

    const noCompleteAt = { priority: "normal" };
    const withCompleteAt = { priority: "normal", completeAt: 5 };
    expect(comparePriorityTasks(noCompleteAt, withCompleteAt)).toBeLessThan(0);
  });

  it("sorts a mixed list into emergency > high > normal > low order", () => {
    const tasks = [
      { id: "low", priority: "low", completeAt: 0 },
      { id: "emergency", priority: "emergency", completeAt: 0 },
      { id: "normal", priority: "normal", completeAt: 0 },
      { id: "high", priority: "high", completeAt: 0 },
    ];
    const sorted = [...tasks].sort(comparePriorityTasks).map((task) => task.id);
    expect(sorted).toEqual(["emergency", "high", "normal", "low"]);
  });
});

describe("inferTreatmentPriority", () => {
  it("maps critical-ish states (object or bare string) to emergency", () => {
    expect(inferTreatmentPriority("중상")).toBe("emergency");
    expect(inferTreatmentPriority("전사")).toBe("emergency");
    expect(inferTreatmentPriority({ state: "critical" })).toBe("emergency");
    expect(inferTreatmentPriority({ state: "incapacitated" })).toBe("emergency");
  });

  it("maps minor states to high", () => {
    expect(inferTreatmentPriority("경상")).toBe("high");
    expect(inferTreatmentPriority({ state: "minor" })).toBe("high");
  });

  it("defaults everything else to normal", () => {
    expect(inferTreatmentPriority("healthy")).toBe("normal");
    expect(inferTreatmentPriority({ state: "healthy" })).toBe("normal");
  });
});

describe("inferTrainingPriority", () => {
  it("returns low for dead or missing members", () => {
    expect(inferTrainingPriority(null)).toBe("low");
    expect(inferTrainingPriority({ alive: false })).toBe("low");
  });

  it("returns low when fatigue is at or above 70", () => {
    expect(inferTrainingPriority({ alive: true, fatigue: 70 })).toBe("low");
    expect(inferTrainingPriority({ alive: true, fatigue: 95 })).toBe("low");
  });

  it("returns normal for a rested, living member", () => {
    expect(inferTrainingPriority({ alive: true, fatigue: 69 })).toBe("normal");
    expect(inferTrainingPriority({ alive: true })).toBe("normal");
  });
});

describe("inferModulePriority", () => {
  it("treats equip actions as high regardless of rarity", () => {
    expect(inferModulePriority({ rarity: "common" }, "equip")).toBe("high");
  });

  it("treats epic/legendary upgrades as high", () => {
    expect(inferModulePriority({ rarity: "epic" }, "upgrade")).toBe("high");
    expect(inferModulePriority({ rarity: "legendary" }, "upgrade")).toBe("high");
  });

  it("defaults other upgrades to normal", () => {
    expect(inferModulePriority({ rarity: "common" }, "upgrade")).toBe("normal");
    expect(inferModulePriority({ rarity: "rare" })).toBe("normal");
  });
});
