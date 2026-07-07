// Phase 19-A: policy engine — pure functions only, no store imports (see the
// architecture rule at the top of every systems/*.js file: this module must
// stay callable with plain data in unit tests, exactly like roomJobs.js and
// crisisSystem.js do).
//
// Design decision — "empty skeleton" vs "one working diagnostic rule":
// evaluatePolicies below implements ONE real rule end-to-end
// (auto-hull-repair's threshold check) as a *diagnostic-only* log line. It
// does NOT enqueue a repair job — that lands in 19-B once jobStore's
// enqueueShipWork is wired in. This was chosen over a fully empty skeleton
// for three reasons:
//   1. It pins down the final { actions, logs } contract against a real
//      candidate rule instead of a guess, so 19-B only has to add the
//      enqueue call, not redesign the return shape.
//   2. It gives policyEngine.test.js a real branch to assert on (ON +
//      below-threshold produces a log/action; OFF, or ON + above-threshold,
//      produces neither) instead of only a tautological "always empty" case.
//   3. It still cannot change gameplay this PR: it only returns data
//      (an action descriptor + a log string) — it never mutates a store or
//      enqueues a job itself, so the caller (gameClock.js's
//      processPolicies) deciding to only log, not act, is what keeps this
//      PR's gameplay behavior identical to before the policy system existed.
//
// The other three catalog policies (auto-treatment, fuel-reserve,
// encounter-default-choice) are intentionally left as no-op — recognized by
// id so a future typo is easy to spot, but they never push to `actions` or
// `logs` yet. Their real rules are 19-C, 19-B, and 19-D respectively.

const DEFAULT_HULL_THRESHOLD = 40;

function evaluateAutoHullRepair(policyState, resources) {
  if (!policyState?.enabled) return null;
  const threshold = policyState.params?.hullThreshold ?? DEFAULT_HULL_THRESHOLD;
  const hull = resources?.hull ?? 100;
  if (hull >= threshold) return null;
  return {
    action: { policyId: "auto-hull-repair", kind: "diagnostic", detail: { hull, threshold } },
    log: `정책 진단: 선체 ${Math.round(hull)}% (임계값 ${threshold}% 미만) — 자동 정비 예약은 19-B에서 구현됩니다.`,
  };
}

// evaluatePolicies({ policies, resources, crew, rooms, currentMinute })
//   -> { actions: [{ policyId, kind, detail }], logs: [string] }
//
// `policies` is policyStore's `policies` map ({ [policyId]: { enabled,
// params } }). `resources`/`crew`/`rooms`/`currentMinute` are plain
// snapshots the caller (gameClock.js) reads out of gameStore/crewStore/
// shipInteriorStore — this function never reaches into a store itself.
// Unknown/unrecognized policy ids in `policies` are silently ignored (same
// posture as data/policies.js's catalog-only merge).
export function evaluatePolicies({ policies = {}, resources = {}, crew = [], rooms = {}, currentMinute = 0 } = {}) {
  void crew;
  void rooms;
  void currentMinute;

  const actions = [];
  const logs = [];

  const hullResult = evaluateAutoHullRepair(policies["auto-hull-repair"], resources);
  if (hullResult) {
    actions.push(hullResult.action);
    logs.push(hullResult.log);
  }

  // auto-treatment / fuel-reserve / encounter-default-choice: recognized by
  // the catalog, evaluated as no-ops until 19-C/19-B/19-D land.

  return { actions, logs };
}
