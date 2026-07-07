import { describe, expect, it } from "vitest";
import { evaluatePolicies } from "../policyEngine";
import { createDefaultPolicyState } from "../../data/policies";

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

  it("auto-hull-repair enabled + hull below threshold produces exactly one diagnostic log and action", () => {
    const policies = createDefaultPolicyState();
    policies["auto-hull-repair"] = { enabled: true, params: { hullThreshold: 40 } };
    const result = evaluatePolicies({ policies, resources: { hull: 25 }, crew: [], rooms: {}, currentMinute: 0 });
    expect(result.logs).toHaveLength(1);
    expect(result.logs[0]).toContain("정책 진단");
    expect(result.logs[0]).toContain("25");
    expect(result.actions).toEqual([
      { policyId: "auto-hull-repair", kind: "diagnostic", detail: { hull: 25, threshold: 40 } },
    ]);
  });

  it("auto-hull-repair enabled + hull at or above threshold produces no log/action (boundary is exclusive)", () => {
    const policies = createDefaultPolicyState();
    policies["auto-hull-repair"] = { enabled: true, params: { hullThreshold: 40 } };
    expect(evaluatePolicies({ policies, resources: { hull: 40 } })).toEqual({ actions: [], logs: [] });
    expect(evaluatePolicies({ policies, resources: { hull: 90 } })).toEqual({ actions: [], logs: [] });
  });

  it("auto-hull-repair disabled never fires even when hull is critically low", () => {
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

  it("never mutates a store or enqueues a job — actions are plain descriptors only", () => {
    const policies = createDefaultPolicyState();
    policies["auto-hull-repair"] = { enabled: true, params: { hullThreshold: 40 } };
    const result = evaluatePolicies({ policies, resources: { hull: 10 } });
    expect(result.actions[0].kind).toBe("diagnostic");
    expect(result.actions[0]).not.toHaveProperty("jobId");
  });

  it("auto-treatment, fuel-reserve, and encounter-default-choice are recognized but produce no actions/logs even when enabled (19-B/C/D territory)", () => {
    const policies = createDefaultPolicyState();
    policies["auto-treatment"] = { enabled: true, params: { minSeverity: "minor" } };
    policies["fuel-reserve"] = { enabled: true, params: { reserveThreshold: 30 } };
    policies["encounter-default-choice"] = { enabled: true, params: { stance: "aggressive" } };
    const result = evaluatePolicies({
      policies,
      resources: { hull: 100, fuel: 5 },
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
});
