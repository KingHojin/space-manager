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
//     action.detail.job.payload.inputItems from inventoryStore.
//   - "enqueue-treatment-job": gameClock.js's applyPolicyActions() spends
//     action.detail.job.cost via gameStore.spendCredits (skipping silently
//     if that fails — a race against the credits snapshot this module was
//     handed) and, only on success, calls
//     jobStore.enqueueTreatment(action.detail.job).
//   - "resolve-encounter" (19-D, encounter-default-choice): gameClock.js's
//     applyPolicyActions() re-checks that navStore's pendingEncounter is
//     still the same encounter (by id) and, if so, calls the existing
//     applyNavigationEncounter(action.detail.optionId, currentMinute) —
//     this module never decides *how* an encounter option is applied, only
//     *which* optionId to pick.
//
// 19-B implements auto-hull-repair (real enqueue, not just diagnostic) and
// fuel-reserve (diagnostic warning only — auto-refuel needs a market/price
// model that's out of scope here). 19-C implements auto-treatment (real
// enqueue, mirroring 19-B's shape). 19-D implements encounter-default-choice
// (see evaluateEncounterDefaultChoice below): navStore's pendingEncounter has
// no timeout/expiry concept (see navStore.js — arriveNode sets it, and it
// blocks planRoute indefinitely until resolveEncounter is called), so this
// policy is "resolve immediately on encounter, by stance" rather than
// "resolve after a wait". Any option whose outcome contains a
// `{kind:"combat"}` effect is *never* auto-selected, no matter how it would
// score — gameClock.js's applyNavEffect turns that effect into
// explorationStore.setPendingCombatEncounter(...), and this project's
// standing rule is that emergency combat is never triggered automatically.

import { JOB_DURATION, JOB_ECONOMY } from "../data/constants";
import { INJURY_STATE_ORDER, injuryLabel, injuryRank, isInjured, treatmentRule } from "./injurySystem";
import { inferTreatmentPriority } from "./priorities";

const DEFAULT_HULL_THRESHOLD = 40;
const DEFAULT_FUEL_RESERVE_THRESHOLD = 30;
const DEFAULT_TREATMENT_MIN_SEVERITY = "minor";
const HULL_REPAIR_SCRAP_ITEM_ID = "salvage-scrap";
const HULL_REPAIR_ROOM_ID = "engineering";
const DEFAULT_ENCOUNTER_STANCE = "balanced";

// Scoring weights for evaluateEncounterDefaultChoice, below. These are a
// deliberately simple, transparent heuristic over navEncounters.js's outcome
// effect shapes — there is no "true" risk/reward number attached to an
// encounter option in the data, so this module derives one from the same
// effect kinds gameClock.js's applyNavEffect already knows how to apply.
//
// - Resource loss (negative `resource`/`fuel` deltas) contributes to risk.
//   `credits` is excluded from risk entirely: losing credits is a cost, not
//   a survival risk, and every real "hail/ambush"-style option in
//   navEncounters.js that costs credits is a safe, deliberate trade (e.g.
//   station-refuel's "buy-fuel"), not a hazard a "safe" stance should be
//   scared away from.
// - Resource gain (positive `resource`/`fuel` deltas) contributes to
//   reward, `credits` included at full weight — per the design brief,
//   reward is "특히 credits"-driven.
// - `spawnCrisis` adds a flat risk penalty proportional to severity: it has
//   no resource delta of its own but is unambiguously a hazard (it's the
//   same effect crisisSystem.js turns into an active ship crisis).
// - `recruitOffer` / `nextSector` add a flat reward bonus: both are
//   strategic upside (a new crew candidate, sector progression) that a
//   pure resource-delta sum would otherwise score as zero.
// - `combat` is deliberately NOT scored here — options containing it are
//   filtered out of the candidate pool entirely, before scoring ever runs
//   (see evaluateEncounterDefaultChoice).
const ENCOUNTER_RISK_RESOURCE_WEIGHTS = { hull: 1, oxygen: 1, fuel: 1 };
const ENCOUNTER_REWARD_RESOURCE_WEIGHTS = { hull: 1, oxygen: 1, fuel: 1, credits: 1 };
const ENCOUNTER_CRISIS_RISK_PER_SEVERITY = 15;
const ENCOUNTER_RECRUIT_OFFER_REWARD = 40;
const ENCOUNTER_NEXT_SECTOR_REWARD = 30;

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

// Any crew member with an active training/treatment/recovery job has that
// job's payload.targetCrewId set to their id (see jobStore.enqueueTraining/
// enqueueTreatment/enqueueRecovery) — a single check against `jobs`
// (jobStore.getActiveJobs()'s backlog/assigned/in_progress snapshot) is
// therefore equivalent to Crew.jsx's `busy(memberId)` helper without having
// to special-case job type.
function isCrewMemberBusy(jobs, memberId) {
  return (jobs ?? []).some((job) => job.payload?.targetCrewId === memberId);
}

// auto-treatment: queues at most ONE treatment job per tick, mirroring
// auto-hull-repair's "one repair job at a time" posture (both share the
// same one-slot-room constraint in practice — medbay's slotCapacity is 1,
// see data/constants.js's ROOM_CONFIG). When several crew members qualify
// at once, the most severely injured (highest injuryRank) is treated first;
// ties keep crew array order (Array.prototype.sort is stable). Any
// candidate left over this tick simply gets picked up on a later tick, once
// the current target's job has taken them out of the busy set — over
// several ticks this drains the whole backlog one member at a time, exactly
// like a player manually clicking "치료" on each injured crew member in
// turn would.
function evaluateAutoTreatment(policyState, resources, crew, jobs) {
  if (!policyState?.enabled) return null;
  const minSeverity = policyState.params?.minSeverity ?? DEFAULT_TREATMENT_MIN_SEVERITY;
  const minRankIndex = INJURY_STATE_ORDER.indexOf(minSeverity);
  const minRank = minRankIndex >= 0 ? minRankIndex : INJURY_STATE_ORDER.indexOf(DEFAULT_TREATMENT_MIN_SEVERITY);

  const candidates = (crew ?? []).filter(
    (member) => member?.alive && isInjured(member.injury) && injuryRank(member.injury) >= minRank && !isCrewMemberBusy(jobs, member.id),
  );
  if (candidates.length === 0) return null;

  const target = [...candidates].sort((a, b) => injuryRank(b.injury) - injuryRank(a.injury))[0];
  const label = injuryLabel(target.injury);
  const rule = treatmentRule(target.injury);
  const name = target.name ?? "승무원";
  const credits = resources?.credits ?? 0;

  if (credits < rule.cost) {
    return {
      action: {
        policyId: "auto-treatment",
        kind: "diagnostic",
        detail: { reason: "insufficient-credits", memberId: target.id, injury: label, cost: rule.cost, credits },
      },
      log: `정책: 자동 치료 대기 — ${name} ${label}, 크레딧 부족 (₢${credits}/${rule.cost}).`,
    };
  }

  // Same payload shape Crew.jsx's treat() (via jobStore.enqueueTreatment)
  // uses — reusing the exact same gameplay numbers (systems/injurySystem.js's
  // treatmentRule, shared with Crew.jsx) so an auto-queued treatment is
  // indistinguishable from a manually-queued one. `createdAt`/`completeAt`
  // are deliberately omitted here: gameClock.js's applyPolicyActions stamps
  // createdAt with the real tick's currentMinute when it actually enqueues,
  // the same way it does for enqueue-ship-work.
  const priority = inferTreatmentPriority(label);
  return {
    action: {
      policyId: "auto-treatment",
      kind: "enqueue-treatment-job",
      detail: {
        memberId: target.id,
        job: { memberId: target.id, injury: label, cost: rule.cost, duration: rule.minutes, fatiguePenalty: rule.fatiguePenalty, priority },
      },
    },
    log: `정책: 자동 치료 예약 — ${name} ${label}, 우선순위 ${priority}, ₢${rule.cost}, ${rule.minutes}분.`,
  };
}

function optionHasCombatOutcome(option) {
  return (option?.outcome ?? []).some((effect) => effect?.kind === "combat");
}

function optionRequiresManualChoice(option) {
  return Boolean(option?.manualOnly || (option?.outcome ?? []).some((effect) => effect?.manualOnly));
}

// Sums a single encounter option's outcome effects into { risk, reward }
// scalars, per the weighting scheme documented above the *_WEIGHTS
// constants. Never called on an option that contains a `combat` effect —
// evaluateEncounterDefaultChoice filters those out before scoring.
function scoreEncounterOption(option) {
  let risk = 0;
  let reward = 0;
  (option?.outcome ?? []).forEach((effect) => {
    if (effect?.kind === "resource" && effect.delta) {
      Object.entries(effect.delta).forEach(([key, value]) => {
        if (typeof value !== "number" || value === 0) return;
        if (value < 0) {
          if (key === "credits") return; // credits excluded from risk — see weights comment.
          risk += Math.abs(value) * (ENCOUNTER_RISK_RESOURCE_WEIGHTS[key] ?? 1);
        } else {
          reward += value * (ENCOUNTER_REWARD_RESOURCE_WEIGHTS[key] ?? 1);
        }
      });
    } else if (effect?.kind === "fuel" && typeof effect.delta === "number" && effect.delta !== 0) {
      if (effect.delta < 0) risk += Math.abs(effect.delta) * ENCOUNTER_RISK_RESOURCE_WEIGHTS.fuel;
      else reward += effect.delta * ENCOUNTER_REWARD_RESOURCE_WEIGHTS.fuel;
    } else if (effect?.kind === "spawnCrisis") {
      risk += (effect.severity ?? 1) * ENCOUNTER_CRISIS_RISK_PER_SEVERITY;
    } else if (effect?.kind === "recruitOffer") {
      reward += ENCOUNTER_RECRUIT_OFFER_REWARD;
    } else if (effect?.kind === "nextSector") {
      reward += ENCOUNTER_NEXT_SECTOR_REWARD;
    }
  });
  return { risk, reward };
}

// encounter-default-choice (19-D): navStore's pendingEncounter has no
// timeout — see the file header comment — so this rule fires immediately
// whenever a pending encounter exists and picks one option by `stance`:
//   - "safe": lowest riskScore (ties keep option array order).
//   - "aggressive": highest rewardScore.
//   - "balanced" (default): highest (rewardScore - riskScore).
// Any option whose outcome contains a `combat` effect is removed from the
// candidate pool *before* scoring, unconditionally — this policy must never
// be the thing that starts a fight (see this project's standing "no
// automated emergency combat" rule, and gameClock.js's applyNavEffect,
// which turns `combat` into explorationStore.setPendingCombatEncounter).
// pendingCombatEncounter: `encounter` (a snapshot of navStore.pendingEncounter)
// and `pendingCombatEncounter` (a snapshot of
// explorationStore.pendingCombatEncounter) are both plain data handed in by
// gameClock.js — this function never reaches into either store.
function evaluateEncounterDefaultChoice(policyState, encounter, pendingCombatEncounter) {
  if (!policyState?.enabled) return null;
  if (!encounter) return null;
  // A combat encounter is already awaiting manual resolution elsewhere
  // (e.g. spawned by a different navigation effect this same tick) — leave
  // the pending nav encounter alone until that clears, as an extra safety
  // margin on top of the per-option combat exclusion below.
  if (pendingCombatEncounter) return null;

  const stance = policyState.params?.stance ?? DEFAULT_ENCOUNTER_STANCE;
  const options = encounter.options ?? [];
  const candidates = options.filter((option) => !optionHasCombatOutcome(option) && !optionRequiresManualChoice(option));

  if (candidates.length === 0) {
    return {
      action: {
        policyId: "encounter-default-choice",
        kind: "diagnostic",
        detail: { reason: "all-combat", encounterId: encounter.id ?? null },
      },
      log: `정책: 조우 자동 대응 보류 — 모든 선택지가 전투로 이어짐, 수동 결재 필요 (${encounter.title ?? "조우"}).`,
    };
  }

  const scored = candidates.map((option) => ({ option, ...scoreEncounterOption(option) }));
  let chosen;
  if (stance === "safe") {
    chosen = scored.reduce((best, current) => (current.risk < best.risk ? current : best));
  } else if (stance === "aggressive") {
    chosen = scored.reduce((best, current) => (current.reward > best.reward ? current : best));
  } else {
    chosen = scored.reduce((best, current) => (current.reward - current.risk > best.reward - best.risk ? current : best));
  }

  return {
    action: {
      policyId: "encounter-default-choice",
      kind: "resolve-encounter",
      detail: { encounterId: encounter.id ?? null, optionId: chosen.option.id, stance, label: chosen.option.label },
    },
    log: `정책: 조우 자동 대응 — ${encounter.title ?? "조우"} · ${chosen.option.label} (${stance}).`,
  };
}

// evaluatePolicies({ policies, resources, crew, rooms, currentMinute, jobs,
// items, pendingEncounter, pendingCombatEncounter })
//   -> { actions: [{ policyId, kind, detail }], logs: [string] }
//
// `policies` is policyStore's `policies` map ({ [policyId]: { enabled,
// params } }). `resources`/`crew`/`rooms`/`currentMinute`/`jobs`/`items`/
// `pendingEncounter`/`pendingCombatEncounter` are plain snapshots the caller
// (gameClock.js) reads out of gameStore/crewStore/shipInteriorStore/
// jobStore/inventoryStore/navStore/explorationStore — this function never
// reaches into a store itself. Unknown/unrecognized policy ids in `policies`
// are silently ignored (same posture as data/policies.js's catalog-only
// merge).
export function evaluatePolicies({
  policies = {},
  resources = {},
  crew = [],
  rooms = {},
  currentMinute = 0,
  jobs = [],
  items = [],
  pendingEncounter = null,
  pendingCombatEncounter = null,
} = {}) {
  void rooms;
  void currentMinute;

  const results = [];

  const hullResult = evaluateAutoHullRepair(policies["auto-hull-repair"], resources, jobs, items);
  if (hullResult) results.push(hullResult);

  const fuelResult = evaluateFuelReserve(policies["fuel-reserve"], resources);
  if (fuelResult) results.push(fuelResult);

  const treatmentResult = evaluateAutoTreatment(policies["auto-treatment"], resources, crew, jobs);
  if (treatmentResult) results.push(treatmentResult);

  const encounterResult = evaluateEncounterDefaultChoice(policies["encounter-default-choice"], pendingEncounter, pendingCombatEncounter);
  if (encounterResult) results.push(encounterResult);

  return {
    actions: results.map((result) => result.action),
    logs: results.map((result) => result.log),
  };
}
