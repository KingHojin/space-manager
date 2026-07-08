// Phase 20-A: report builder — pure functions only, no store imports (same
// architecture rule as every other systems/*.js file: policyEngine.js,
// roomJobs.js, crisisSystem.js — this module must stay callable with plain
// data in unit tests). Importing data/reports.js is fine (pure data);
// importing a `stores/*` module or calling a store's `getState()` is not.
//
// --- reports are built from structured data, never parsed from log strings ---
// This is a hard rule for the whole report system, not just this file: a
// report's title/body/meta must always come from the same structured event
// data the caller already has in hand (e.g. a policy action's `detail`, a
// combat result object, a crisis snapshot) — never by parsing/matching
// gameStore.logs strings. Log lines are free-text meant for a human to read
// once in a scrolling feed; they are not a stable data contract, and several
// of them (e.g. policyEngine.js's throttled diagnostics) are deliberately
// suppressed on repeat ticks in ways a report should NOT inherit. 20-B's
// gameClock.js process* functions are expected to hand a builder the same
// structured values they already pass into their own addLog(...) call
// (computed once, used for both), not re-derive them from the log string
// afterward. See docs/PHASE_20_REPORT_SYSTEM.md for the full data-flow
// diagram.
//
// This module intentionally builds report *content* only (category, priority,
// title, body, createdAtMinute, meta). It does not assign `id`/`read`/
// `acknowledged` — stores/reportStore.js's addReport() owns those, exactly
// like jobStore.js's createId() owns job ids rather than jobMigration.js.

import { FALLBACK_REPORT_CATEGORY, getReportCategory, REPORT_PRIORITIES } from "../data/reports";

function normalizePriority(priority, fallback) {
  return REPORT_PRIORITIES.includes(priority) ? priority : fallback;
}

// buildReport({ category, title, body, priority?, currentMinute, meta? })
//   -> { category, priority, title, body, createdAtMinute, meta }
//
// `category` is validated against data/reports.js's REPORT_CATEGORIES; an
// unknown/missing id falls back to FALLBACK_REPORT_CATEGORY rather than
// throwing, so a caller typo produces a visibly-odd-but-harmless "일반"
// report instead of crashing gameClock's tick loop (same defensive posture
// policyEngine.js takes toward unrecognized policy ids). `priority`, if
// given, must be one of REPORT_PRIORITIES or it is replaced by the
// category's defaultPriority. `title`/`body` are coerced to strings so a
// missing/non-string value never leaks a non-string into reportStore.
export function buildReport({ category, title, body, priority, currentMinute = 0, meta = null } = {}) {
  const definition = getReportCategory(category) ?? FALLBACK_REPORT_CATEGORY;
  return {
    category: definition.id,
    priority: normalizePriority(priority, definition.defaultPriority),
    title: typeof title === "string" && title.length > 0 ? title : definition.label,
    body: typeof body === "string" ? body : "",
    createdAtMinute: typeof currentMinute === "number" && Number.isFinite(currentMinute) ? currentMinute : 0,
    meta: meta && typeof meta === "object" ? meta : null,
  };
}

// --- domain builder contracts (20-B pins these down early, same rationale
// as policyEngine.js's 19-A "one working diagnostic rule" — see
// docs/PHASE_19_POLICY_SYSTEM.md's "Engine design decision"). These two are
// NOT wired to anything yet (no gameClock caller exists in 20-A) — they only
// fix the function signature so 20-B can call them without a redesign. Both
// are thin wrappers over buildReport(); domain-specific ones added in 20-B
// should follow the same shape: accept the structured event fields a
// gameClock process* function already has on hand, plus `currentMinute`, and
// return a buildReport() result.

// buildPolicyReport({ policyId, summary, currentMinute, priority? })
//   -> a "policy" category report. `policyId` is threaded into `meta` (not
//   the title) so 20-C can link back to PolicyModal's per-policy card
//   without parsing the title text. `summary` becomes the report body
//   verbatim — the caller (20-B's gameClock) is expected to compose it from
//   the same structured action/detail data it already builds a `log` string
//   from in policyEngine.js's { action, log } pairs, not from the log string
//   itself (see the file-header "no log parsing" rule).
export function buildPolicyReport({ policyId, summary, currentMinute, priority } = {}) {
  return buildReport({
    category: "policy",
    title: "정책 자동 집행",
    body: summary,
    priority,
    currentMinute,
    meta: { policyId: policyId ?? null },
  });
}

// buildCombatReport({ title, summary, outcome, currentMinute, priority? })
//   -> a "combat" category report. `outcome` (e.g. "victory" | "defeat" |
//   "fled") is threaded into `meta` for 20-C to badge/filter on without
//   string-matching the body text.
export function buildCombatReport({ title, summary, outcome, currentMinute, priority } = {}) {
  return buildReport({
    category: "combat",
    title,
    body: summary,
    priority,
    currentMinute,
    meta: { outcome: outcome ?? null },
  });
}

// --- 20-B domain builders: crisis / work / navigation. Same thin-wrapper
// shape as buildPolicyReport/buildCombatReport above — each just threads a
// domain-specific field into `meta` so 20-C can filter/badge on it without
// string-matching title/body.

// buildCrisisReport({ title, summary, crisisKind, currentMinute, priority? })
//   -> a "crisis" category report. `crisisKind` ("spawned" | "resolved") is
//   threaded into `meta` — gameClock.js's processCrises only ever calls this
//   for those two kinds (see shipInteriorStore.js's tickCrises `crisisEvents`
//   return value); "escalated" crisis events are deliberately NOT reported
//   (the spawn report already exists and ShipInterior's live crisis cards
//   show escalation in real time — see docs/PHASE_20_REPORT_SYSTEM.md's
//   volume-selection table for the full rationale).
export function buildCrisisReport({ title, summary, crisisKind, currentMinute, priority } = {}) {
  return buildReport({
    category: "crisis",
    title,
    body: summary,
    priority,
    currentMinute,
    meta: { crisisKind: crisisKind ?? null },
  });
}

// buildWorkReport({ title, summary, jobType, currentMinute, priority? })
//   -> a "work" category report. `jobType` (jobStore's normalized job.type,
//   e.g. "training" | "treatment" | "recovery" | "module_upgrade" | "decode"
//   | "hull_repair" | "salvage") is threaded into `meta`.
export function buildWorkReport({ title, summary, jobType, currentMinute, priority } = {}) {
  return buildReport({
    category: "work",
    title,
    body: summary,
    priority,
    currentMinute,
    meta: { jobType: jobType ?? null },
  });
}

// buildNavigationReport({ title, summary, navKind, currentMinute, priority? })
//   -> a "navigation" category report. `navKind` (e.g. "missionComplete") is
//   threaded into `meta`.
export function buildNavigationReport({ title, summary, navKind, currentMinute, priority } = {}) {
  return buildReport({
    category: "navigation",
    title,
    body: summary,
    priority,
    currentMinute,
    meta: { navKind: navKind ?? null },
  });
}
