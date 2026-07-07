// Phase 19-A/19-B: policy engine — pure functions only, no store imports (see
// the architecture rule at the top of every systems/*.js file: this module
// must stay callable with plain data in unit tests, exactly like
// roomJobs.js and crisisSystem.js do). Importing data/constants.js is fine
// (pure data, same as roomJobs.js importing WEAR from data/constants) —
// what's forbidden is importing a `stores/*` module or calling a store's
// `getState()`.
//
// Contract: evaluatePolicies(...) -> { actions: [...], logs: [string] }.
// `actions` and `logs` are always the same length and index-aligned — every
// rule below produces at most one { action, log } pair per tick (never a
// log without a matching action, or vice versa). That invariant is what
// lets gameClock.js's processPolicies correlate a log message with the
// action that produced it (e.g. to throttle repeated warnings) without
// having to parse the log text.
//
// Action `kind` vocabulary so far:
//   - "diagnostic": informational only. gameClock.js never mutates a store
//     for these — they only ever produce a log line (subject to
//     gameClock's own throttling for repeat warnings).
//   - "enqueue-ship-work": gameClock.js's applyPolicyActions() calls
//     jobStore.enqueueShipWork(action.detail.job) and consumes
//     action.detail.job.payload.inputItems from inventoryStore. This is the
//     *only* action kind that mutates gameplay state right now.
//
// 19-B implements auto-hull-repair (real enqueue, not just diagnostic) and
// fuel-reserve (diagnostic warning only — auto-refuel needs a market/price
// model that's out of scope here). auto-treatment and
// encounter-default-choice remain no-ops, recognized by id, until 19-C/19-D.

import { JOB_DURATION, JOB_ECONOMY } from "../data/constants";

const DEFAULT_HULL_THRESHOLD = 40;
const DEFAULT_FUEL_RESERVE_THRESHOLD = 30;
const HULL_REPAIR_SCRAP_ITEM_ID = "salvage-scrap";
const HULL_REPAIR_ROOM_ID = "engineering";

function itemQty(items, itemId) {
  return (items ?? []).find((item) => item.id === itemId)?.qty ?? 0;
}

// jobs: a plain snapshot of jobStore.getActiveJobs() (backlog/assigned/
// in_progress jobs) — gameClock.js reads the store, this function only
// looks at the array it's handed.
// items: a plain snapshot of inventoryStore.items.
function evaluateAutoHullRepair(policyState, resources, jobs, items) {
  if (!policyState?.enabled) return null;
  const threshold = policyState.params?.hullThreshold ?? DEFAULT_HULL_THRESHOLD;
  const hull = resources?.hull ?? 100;
  if (hull >= threshold) return null;

  // Already have a repair queued/running: stay completely silent. This is
  // the primary anti-spam mechanism — once the enqueue below fires once,
  // every subsequent tick lands here and produces nothing, instead of
  // re-enqueuing or re-warning every tick until the job completes.
  const hasActiveRepairJob = (jobs ?? []).some((job) => job.type === "hull_repair");
  if (hasActiveRepairJob) return null;

  const scrapCost = JOB_ECONOMY.hullRepair.salvageScrapCost;
  const scrapQty = itemQty(items, HULL_REPAIR_SCRAP_ITEM_ID);
  if (scrapQty < scrapCost) {
    return {
      action: {
        policyId: "auto-hull-repair",
        kind: "diagnostic",
        detail: { reason: "insufficient-scrap", hull, threshold, scrapQty, scrapCost },
      },
      log: `정책: 자동 수리 대기 — 선체 ${Math.round(hull)}% (임계값 ${threshold}%) · 폐자재 부족(${scrapQty}/${scrapCost}).`,
    };
  }

  // Same payload shape Ship.jsx's handleRepair (ScrapRepairCard's onRepair)
  // passes to jobStore.enqueueShipWork — reusing the exact same gameplay
  // numbers (JOB_ECONOMY.hullRepair, JOB_DURATION.hull_repair) so an
  // auto-triggered repair is indistinguishable from a manual one.
  return {
    action: {
      policyId: "auto-hull-repair",
      kind: "enqueue-ship-work",
      detail: {
        reason: "threshold-breach",
        hull,
        threshold,
        job: {
          type: "hullRepair",
          roomId: HULL_REPAIR_ROOM_ID,
          cost: scrapCost,
          duration: JOB_DURATION.hull_repair,
          priority: "high",
          payload: {
            hullDelta: JOB_ECONOMY.hullRepair.hullDelta,
            inputItems: [{ itemId: HULL_REPAIR_SCRAP_ITEM_ID, qty: scrapCost }],
          },
        },
      },
    },
    log: `정책: 자동 정비 예약 — 선체 ${Math.round(hull)}% (임계값 ${threshold}% 미만) · 폐자재 ${scrapCost}개 소모 · 기관실 슬롯 대기.`,
  };
}

// fuel-reserve: warning only. Auto-purchasing fuel would need a market/
// price model this PR doesn't build, so this rule stops at surfacing the
// warning to the player (see data/policies.js's description, which already
// hedges with "가능하면" for the auto-supply half of this policy).
function evaluateFuelReserve(policyState, resources) {
  if (!policyState?.enabled) return null;
  const threshold = policyState.params?.reserveThreshold ?? DEFAULT_FUEL_RESERVE_THRESHOLD;
  const fuel = resources?.fuel ?? 100;
  if (fuel >= threshold) return null;
  return {
    action: {
      policyId: "fuel-reserve",
      kind: "diagnostic",
      detail: { reason: "low-fuel", fuel, threshold },
    },
    log: `정책: 연료 예비율 경고 — 연료 ${Math.round(fuel)}% (임계값 ${threshold}% 미만). 자동 보급은 아직 지원되지 않습니다 — 직접 보급하세요.`,
  };
}

// evaluatePolicies({ policies, resources, crew, rooms, currentMinute, jobs, items })
//   -> { actions: [{ policyId, kind, detail }], logs: [string] }
//
// `policies` is policyStore's `policies` map ({ [policyId]: { enabled,
// params } }). `resources`/`crew`/`rooms`/`currentMinute`/`jobs`/`items` are
// plain snapshots the caller (gameClock.js) reads out of gameStore/
// crewStore/shipInteriorStore/jobStore/inventoryStore — this function never
// reaches into a store itself. Unknown/unrecognized policy ids in `policies`
// are silently ignored (same posture as data/policies.js's catalog-only
// merge).
export function evaluatePolicies({ policies = {}, resources = {}, crew = [], rooms = {}, currentMinute = 0, jobs = [], items = [] } = {}) {
  void crew;
  void rooms;
  void currentMinute;

  const results = [];

  const hullResult = evaluateAutoHullRepair(policies["auto-hull-repair"], resources, jobs, items);
  if (hullResult) results.push(hullResult);

  const fuelResult = evaluateFuelReserve(policies["fuel-reserve"], resources);
  if (fuelResult) results.push(fuelResult);

  // auto-treatment / encounter-default-choice: recognized by the catalog,
  // evaluated as no-ops until 19-C/19-D land.

  return {
    actions: results.map((result) => result.action),
    logs: results.map((result) => result.log),
  };
}
