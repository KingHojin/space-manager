import { describe, expect, it } from "vitest";
import { canFitPower, modulePowerCost, reactorCapacity, totalPowerDraw } from "../powerSystem";
import { POWER } from "../../data/constants";

describe("reactorCapacity", () => {
  it("returns the base capacity for the given grade at engineeringTier 1", () => {
    expect(reactorCapacity("shuttle", 1)).toBe(POWER.reactorBaseByGrade.shuttle);
    expect(reactorCapacity("cruiser", 1)).toBe(POWER.reactorBaseByGrade.cruiser);
  });

  it("adds reactorPerEngineeringTier per tier above 1", () => {
    expect(reactorCapacity("shuttle", 3)).toBe(POWER.reactorBaseByGrade.shuttle + 2 * POWER.reactorPerEngineeringTier);
  });

  it("falls back to the shuttle base for an unknown grade", () => {
    expect(reactorCapacity("not-a-grade", 1)).toBe(POWER.reactorBaseByGrade.shuttle);
  });
});

describe("modulePowerCost / totalPowerDraw", () => {
  it("looks up cost by rarity, defaulting to 1 for unknown rarity", () => {
    expect(modulePowerCost({ rarity: "legendary" })).toBe(POWER.moduleCostByRarity.legendary);
    expect(modulePowerCost({ rarity: "not-a-rarity" })).toBe(1);
    expect(modulePowerCost(undefined)).toBe(1);
  });

  it("sums module power costs across a list", () => {
    const modules = [{ rarity: "common" }, { rarity: "rare" }, { rarity: "epic" }];
    expect(totalPowerDraw(modules)).toBe(
      POWER.moduleCostByRarity.common + POWER.moduleCostByRarity.rare + POWER.moduleCostByRarity.epic,
    );
  });

  it("returns 0 for an empty list", () => {
    expect(totalPowerDraw([])).toBe(0);
  });
});

describe("canFitPower", () => {
  it("allows adding a module when draw stays within capacity", () => {
    const installed = [{ rarity: "common" }]; // draw = 1
    expect(canFitPower(installed, { rarity: "common" }, null, 5)).toBe(true);
  });

  it("rejects adding a module that would exceed capacity", () => {
    const installed = [{ rarity: "legendary" }, { rarity: "legendary" }]; // draw = 8
    expect(canFitPower(installed, { rarity: "legendary" }, null, 9)).toBe(false);
  });

  it("accounts for a replacing module's cost being freed up first", () => {
    const installed = [{ rarity: "legendary", id: "old" }]; // draw = 4
    // Without replacement context this would not fit in capacity 4; with replacingModule freeing 4, it fits.
    expect(canFitPower(installed, { rarity: "legendary" }, { rarity: "legendary", id: "old" }, 4)).toBe(true);
  });

  it("fits exactly at the capacity boundary (<=)", () => {
    const installed = [];
    expect(canFitPower(installed, { rarity: "rare" }, null, POWER.moduleCostByRarity.rare)).toBe(true);
  });
});
