import { describe, expect, it } from "vitest";
import { evaluatePolicies } from "../policyEngine";
import { createDefaultPolicyState } from "../../data/policies";
import { JOB_DURATION, JOB_ECONOMY } from "../../data/constants";

const SCRAP_COST = JOB_ECONOMY.hullRepair.salvageScrapCost;
const HULL_DELTA = JOB_ECONOMY.hullRepair.hullDelta;

describe("evaluatePolicies", () => {
  it("returns an empty result when called with no arguments at all", () => {
    expect(evaluatePolicies()).toEqual({ actions: [], logs: [] });
  });

  it("returns an empty result when every catalog policy is at its default (all disabled) state", () => {
    const policies = createDefaultPolicyState();
    const result = evaluatePolicies({ policies, resources: { hull: 5 }, crew: [], rooms: {}, currentMinute: 100 });
    // Hull is far below the default 40% threshold, but auto-hull-repair is
    // disabled by default, so nothing should fire.
    expect(result).toEqual({ actions: [], logs: [] });
  });

  describe("auto-hull-repair", () => {
    it("enabled + hull below threshold + no active repair job + insufficient scrap produces a diagnostic warning, no enqueue action", () => {
      const policies = createDefaultPolicyState();
      policies["auto-hull-repair"] = { enabled: true, params: { hullThreshold: 40 } };
      // No `items` passed -> salvage-scrap qty defaults to 0, which is below
      // JOB_ECONOMY.hullRepair.salvageScrapCost, so this must land in the
      // "insufficient scrap" branch, not enqueue anything.
      const result = evaluatePolicies({ policies, resources: { hull: 25 }, crew: [], rooms: {}, currentMinute: 0 });
      expect(result.logs).toHaveLength(1);
      expect(result.logs[0]).toContain("정책");
      expect(result.logs[0]).toContain("25");
      expect(result.logs[0]).toContain(`0/${SCRAP_COST}`);
      expect(result.actions).toEqual([
        {
          policyId: "auto-hull-repair",
          kind: "diagnostic",
          detail: { reason: "insufficient-scrap", hull: 25, threshold: 40, scrapQty: 0, scrapCost: SCRAP_COST },
        },
      ]);
    });

    it("enabled + hull below threshold + no active repair job + sufficient scrap produces an enqueue-ship-work action matching Ship.jsx's manual-repair payload", () => {
      const policies = createDefaultPolicyState();
      policies["auto-hull-repair"] = { enabled: true, params: { hullThreshold: 40 } };
      const items = [{ id: "salvage-scrap", qty: SCRAP_COST }];
      const result = evaluatePolicies({ policies, resources: { hull: 25 }, jobs: [], items });
      expect(result.logs).toHaveLength(1);
      expect(result.actions).toEqual([
        {
          policyId: "auto-hull-repair",
          kind: "enqueue-ship-work",
          detail: {
            reason: "threshold-breach",
            hull: 25,
            threshold: 40,
            job: {
              type: "hullRepair",
              roomId: "engineering",
              cost: SCRAP_COST,
              duration: JOB_DURATION.hull_repair,
              priority: "high",
              payload: {
                hullDelta: HULL_DELTA,
                inputItems: [{ itemId: "salvage-scrap", qty: SCRAP_COST }],
              },
            },
          },
        },
      ]);
    });

    it("does not re-enqueue when a hull_repair job is already active, even with sufficient scrap — silent, no log", () => {
      const policies = createDefaultPolicyState();
      policies["auto-hull-repair"] = { enabled: true, params: { hullThreshold: 40 } };
      const items = [{ id: "salvage-scrap", qty: 999 }];
      const jobs = [{ id: "job-1", type: "hull_repair", status: "in_progress" }];
      const result = evaluatePolicies({ policies, resources: { hull: 10 }, jobs, items });
      expect(result).toEqual({ actions: [], logs: [] });
    });

    it("a hull_repair job in the 'backlog' status also counts as active (jobStore.getActiveJobs() semantics)", () => {
      const policies = createDefaultPolicyState();
      policies["auto-hull-repair"] = { enabled: true, params: { hullThreshold: 40 } };
      const items = [{ id: "salvage-scrap", qty: 999 }];
      const jobs = [{ id: "job-1", type: "hull_repair", status: "backlog" }];
      const result = evaluatePolicies({ policies, resources: { hull: 10 }, jobs, items });
      expect(result).toEqual({ actions: [], logs: [] });
    });

    it("a queued job of a different type does not block the repair enqueue", () => {
      const policies = createDefaultPolicyState();
      policies["auto-hull-repair"] = { enabled: true, params: { hullThreshold: 40 } };
      const items = [{ id: "salvage-scrap", qty: SCRAP_COST }];
      const jobs = [{ id: "job-1", type: "salvage", status: "in_progress" }];
      const result = evaluatePolicies({ policies, resources: { hull: 10 }, jobs, items });
      expect(result.actions).toHaveLength(1);
      expect(result.actions[0].kind).toBe("enqueue-ship-work");
    });

    it("enabled + hull at or above threshold produces no log/action (boundary is exclusive)", () => {
      const policies = createDefaultPolicyState();
      policies["auto-hull-repair"] = { enabled: true, params: { hullThreshold: 40 } };
      expect(evaluatePolicies({ policies, resources: { hull: 40 } })).toEqual({ actions: [], logs: [] });
      expect(evaluatePolicies({ policies, resources: { hull: 90 } })).toEqual({ actions: [], logs: [] });
    });

    it("disabled never fires even when hull is critically low", () => {
      const policies = createDefaultPolicyState();
      policies["auto-hull-repair"] = { enabled: false, params: { hullThreshold: 40 } };
      expect(evaluatePolicies({ policies, resources: { hull: 1 } })).toEqual({ actions: [], logs: [] });
    });

    it("respects a custom hullThreshold param instead of the catalog default", () => {
      const policies = createDefaultPolicyState();
      policies["auto-hull-repair"] = { enabled: true, params: { hullThreshold: 80 } };
      const result = evaluatePolicies({ policies, resources: { hull: 70 } });
      expect(result.logs).toHaveLength(1);
      expect(result.actions[0].detail.threshold).toBe(80);
    });

    it("never mutates a store or enqueues a job itself — actions are plain descriptors only", () => {
      const policies = createDefaultPolicyState();
      policies["auto-hull-repair"] = { enabled: true, params: { hullThreshold: 40 } };
      const result = evaluatePolicies({ policies, resources: { hull: 10 } });
      expect(result.actions[0].kind).toBe("diagnostic");
      expect(result.actions[0]).not.toHaveProperty("jobId");
    });
  });

  describe("fuel-reserve", () => {
    it("enabled + fuel below reserveThreshold produces a diagnostic warning log/action", () => {
      const policies = createDefaultPolicyState();
      policies["fuel-reserve"] = { enabled: true, params: { reserveThreshold: 30 } };
      const result = evaluatePolicies({ policies, resources: { fuel: 15 } });
      expect(result.logs).toHaveLength(1);
      expect(result.logs[0]).toContain("정책");
      expect(result.logs[0]).toContain("15");
      expect(result.actions).toEqual([
        { policyId: "fuel-reserve", kind: "diagnostic", detail: { reason: "low-fuel", fuel: 15, threshold: 30 } },
      ]);
    });

    it("enabled + fuel at or above reserveThreshold produces no log/action (boundary is exclusive)", () => {
      const policies = createDefaultPolicyState();
      policies["fuel-reserve"] = { enabled: true, params: { reserveThreshold: 30 } };
      expect(evaluatePolicies({ policies, resources: { fuel: 30 } })).toEqual({ actions: [], logs: [] });
      expect(evaluatePolicies({ policies, resources: { fuel: 90 } })).toEqual({ actions: [], logs: [] });
    });

    it("disabled never fires even when fuel is critically low", () => {
      const policies = createDefaultPolicyState();
      policies["fuel-reserve"] = { enabled: false, params: { reserveThreshold: 30 } };
      expect(evaluatePolicies({ policies, resources: { fuel: 1 } })).toEqual({ actions: [], logs: [] });
    });

    it("never enqueues a job or mutates resources — diagnostic only (auto-refuel is out of scope for 19-B)", () => {
      const policies = createDefaultPolicyState();
      policies["fuel-reserve"] = { enabled: true, params: { reserveThreshold: 30 } };
      const result = evaluatePolicies({ policies, resources: { fuel: 5 } });
      expect(result.actions[0].kind).toBe("diagnostic");
    });
  });

  it("auto-treatment and encounter-default-choice are recognized but produce no actions/logs even when enabled (19-C/19-D territory)", () => {
    const policies = createDefaultPolicyState();
    policies["auto-treatment"] = { enabled: true, params: { minSeverity: "minor" } };
    policies["encounter-default-choice"] = { enabled: true, params: { stance: "aggressive" } };
    const result = evaluatePolicies({
      policies,
      resources: { hull: 100, fuel: 100 },
      crew: [{ id: "m1", alive: true, injury: "중상" }],
      rooms: {},
      currentMinute: 0,
    });
    expect(result).toEqual({ actions: [], logs: [] });
  });

  it("ignores unknown policy ids in the policies map without throwing", () => {
    const policies = { ...createDefaultPolicyState(), "some-future-policy": { enabled: true, params: {} } };
    expect(() => evaluatePolicies({ policies, resources: { hull: 100 } })).not.toThrow();
  });

  it("actions and logs are always index-aligned (every action has exactly one corresponding log, and vice versa)", () => {
    const policies = createDefaultPolicyState();
    policies["auto-hull-repair"] = { enabled: true, params: { hullThreshold: 40 } };
    policies["fuel-reserve"] = { enabled: true, params: { reserveThreshold: 30 } };
    const result = evaluatePolicies({ policies, resources: { hull: 10, fuel: 5 } });
    expect(result.actions).toHaveLength(2);
    expect(result.logs).toHaveLength(2);
    expect(result.actions[0].policyId).toBe("auto-hull-repair");
    expect(result.actions[1].policyId).toBe("fuel-reserve");
  });
});
