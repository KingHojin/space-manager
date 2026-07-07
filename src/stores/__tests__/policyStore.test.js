import { describe, expect, it } from "vitest";
import { usePolicyStore } from "../policyStore";
import { createDefaultPolicyState, POLICY_CATALOG } from "../../data/policies";
import { PERSIST_VERSION } from "../persistVersion";

describe("policyStore initial state", () => {
  it("initializes policies from data/policies.js's catalog defaults", () => {
    const { policies } = usePolicyStore.getState();
    expect(Object.keys(policies).sort()).toEqual(POLICY_CATALOG.map((definition) => definition.id).sort());
    POLICY_CATALOG.forEach((definition) => {
      expect(policies[definition.id].enabled).toBe(definition.defaultEnabled);
      expect(policies[definition.id].params).toEqual(definition.params);
    });
  });

  it("every catalog policy defaults to disabled (Phase 19-A ships with zero active policies)", () => {
    const { policies } = usePolicyStore.getState();
    Object.values(policies).forEach((policyState) => expect(policyState.enabled).toBe(false));
  });
});

describe("setPolicyEnabled", () => {
  it("toggles a known policy id's enabled flag without touching its params", () => {
    const before = usePolicyStore.getState().policies["auto-hull-repair"].params;
    usePolicyStore.getState().setPolicyEnabled("auto-hull-repair", true);
    const after = usePolicyStore.getState().policies["auto-hull-repair"];
    expect(after.enabled).toBe(true);
    expect(after.params).toEqual(before);
    usePolicyStore.getState().setPolicyEnabled("auto-hull-repair", false);
    expect(usePolicyStore.getState().policies["auto-hull-repair"].enabled).toBe(false);
  });

  it("is a no-op for an unknown policy id", () => {
    const before = usePolicyStore.getState().policies;
    usePolicyStore.getState().setPolicyEnabled("not-a-real-policy", true);
    expect(usePolicyStore.getState().policies).toBe(before);
  });

  it("does not affect other policies' enabled state", () => {
    usePolicyStore.getState().setPolicyEnabled("auto-hull-repair", true);
    expect(usePolicyStore.getState().policies["fuel-reserve"].enabled).toBe(false);
    usePolicyStore.getState().setPolicyEnabled("auto-hull-repair", false);
  });
});

describe("setPolicyParam", () => {
  it("updates a single param key while leaving enabled and other params untouched", () => {
    usePolicyStore.getState().setPolicyParam("auto-hull-repair", "hullThreshold", 55);
    const state = usePolicyStore.getState().policies["auto-hull-repair"];
    expect(state.params.hullThreshold).toBe(55);
    expect(state.enabled).toBe(false);
  });

  it("is a no-op for an unknown policy id", () => {
    const before = usePolicyStore.getState().policies;
    usePolicyStore.getState().setPolicyParam("not-a-real-policy", "x", 1);
    expect(usePolicyStore.getState().policies).toBe(before);
  });
});

describe("resetPolicy", () => {
  it("restores a policy's enabled/params to the catalog defaults after it was modified", () => {
    usePolicyStore.getState().setPolicyEnabled("fuel-reserve", true);
    usePolicyStore.getState().setPolicyParam("fuel-reserve", "reserveThreshold", 5);
    usePolicyStore.getState().resetPolicy("fuel-reserve");
    const definition = POLICY_CATALOG.find((entry) => entry.id === "fuel-reserve");
    expect(usePolicyStore.getState().policies["fuel-reserve"]).toEqual({ enabled: definition.defaultEnabled, params: definition.params });
  });

  it("is a no-op for an unknown policy id", () => {
    const before = usePolicyStore.getState().policies;
    usePolicyStore.getState().resetPolicy("not-a-real-policy");
    expect(usePolicyStore.getState().policies).toBe(before);
  });
});

describe("policyStore persist merge (Phase 19-A, following the persistVersion.js pattern)", () => {
  function mergeWith(persistedState) {
    return usePolicyStore.persist.getOptions().merge(persistedState, usePolicyStore.getState());
  }

  it("declares the same PERSIST_VERSION / passthroughMigrate pattern as every other persisted store", () => {
    expect(usePolicyStore.persist.getOptions().version).toBe(PERSIST_VERSION);
  });

  it("falls back to full catalog defaults when there is no persisted state at all", () => {
    const merged = mergeWith(undefined);
    expect(merged.policies).toEqual(createDefaultPolicyState());
  });

  it("fills in a policy id missing from an old save with the catalog default (forward-compatible: catalog grew a new policy)", () => {
    const partialSave = { policies: { "auto-hull-repair": { enabled: true, params: { hullThreshold: 20 } } } };
    const merged = mergeWith(partialSave);
    expect(merged.policies["auto-hull-repair"]).toEqual({ enabled: true, params: { hullThreshold: 20 } });
    // Every other catalog policy not present in the old save gets the catalog default.
    POLICY_CATALOG.filter((definition) => definition.id !== "auto-hull-repair").forEach((definition) => {
      expect(merged.policies[definition.id]).toEqual({ enabled: definition.defaultEnabled, params: definition.params });
    });
  });

  it("silently drops a policy id that exists in the save but was since removed from the catalog", () => {
    const staleSave = { policies: { "auto-hull-repair": { enabled: true, params: { hullThreshold: 40 } }, "long-removed-policy": { enabled: true, params: { anything: 1 } } } };
    const merged = mergeWith(staleSave);
    expect(merged.policies["long-removed-policy"]).toBeUndefined();
    expect(Object.keys(merged.policies).sort()).toEqual(POLICY_CATALOG.map((definition) => definition.id).sort());
  });

  it("merges a saved policy's params over the catalog default so a newly-added param key still gets its default", () => {
    // Simulates a save written before "auto-hull-repair" gained a hypothetical
    // second param: only hullThreshold was ever saved, but the merged params
    // object must still carry every current catalog param key.
    const staleSave = { policies: { "auto-hull-repair": { enabled: true, params: { hullThreshold: 33 } } } };
    const merged = mergeWith(staleSave);
    expect(merged.policies["auto-hull-repair"].params).toMatchObject({ hullThreshold: 33 });
  });

  it("treats a non-boolean saved `enabled` as invalid and falls back to the catalog default", () => {
    const corruptSave = { policies: { "auto-hull-repair": { enabled: "yes", params: {} } } };
    const merged = mergeWith(corruptSave);
    const definition = POLICY_CATALOG.find((entry) => entry.id === "auto-hull-repair");
    expect(merged.policies["auto-hull-repair"].enabled).toBe(definition.defaultEnabled);
  });
});
