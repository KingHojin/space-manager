import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createDefaultPolicyState, getPolicyDefinition, POLICY_CATALOG } from "../data/policies";
import { passthroughMigrate, PERSIST_VERSION } from "./persistVersion";

// Phase 19-A: policyStore holds ONLY { enabled, params } per policy id, keyed
// off data/policies.js's POLICY_CATALOG. It has no store-to-store imports
// (architecture rule) and no automation logic of its own — evaluating what a
// policy should DO with its enabled/params state lives in the pure
// systems/policyEngine.js, and gameClock.js is the only place that reads
// this store's state and feeds it into that engine (same separation as
// shipInteriorStore holding room state vs systems/roomJobs.js deciding what
// to do with it).

// Merges a persisted `policies` blob against the current catalog:
//   - a policy id present in the save AND the catalog keeps its saved
//     enabled/params (params merged over the catalog default so a save from
//     before a new param was added still gets that new param's default).
//   - a policy id in the catalog but MISSING from the save (a save written
//     before that policy existed) gets the catalog default.
//   - a policy id in the save but NOT in the catalog (a policy that was
//     since removed) is silently dropped — we only ever iterate
//     POLICY_CATALOG below, never Object.keys(savedPolicies).
function mergePolicies(savedPolicies) {
  const defaults = createDefaultPolicyState();
  if (!savedPolicies || typeof savedPolicies !== "object") return defaults;
  const merged = {};
  POLICY_CATALOG.forEach((definition) => {
    const saved = savedPolicies[definition.id];
    merged[definition.id] = saved
      ? {
          enabled: typeof saved.enabled === "boolean" ? saved.enabled : definition.defaultEnabled,
          params: { ...definition.params, ...(saved.params && typeof saved.params === "object" ? saved.params : {}) },
        }
      : defaults[definition.id];
  });
  return merged;
}

export const usePolicyStore = create(
  persist(
    (set) => ({
      policies: createDefaultPolicyState(),

      setPolicyEnabled: (policyId, enabled) =>
        set((state) => {
          if (!state.policies[policyId]) return state;
          return { policies: { ...state.policies, [policyId]: { ...state.policies[policyId], enabled: Boolean(enabled) } } };
        }),

      setPolicyParam: (policyId, key, value) =>
        set((state) => {
          if (!state.policies[policyId]) return state;
          return {
            policies: {
              ...state.policies,
              [policyId]: { ...state.policies[policyId], params: { ...state.policies[policyId].params, [key]: value } },
            },
          };
        }),

      resetPolicy: (policyId) =>
        set((state) => {
          const definition = getPolicyDefinition(policyId);
          if (!definition) return state;
          return { policies: { ...state.policies, [policyId]: { enabled: definition.defaultEnabled, params: { ...definition.params } } } };
        }),
    }),
    {
      name: "space-manager-policies",
      version: PERSIST_VERSION,
      migrate: passthroughMigrate,
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...(persistedState ?? {}),
        policies: mergePolicies(persistedState?.policies),
      }),
    },
  ),
);
