# Phase 20 — Report System

This phase implements `docs/ROADMAP_PHASES.md`'s Phase 6 ("Report System"). As with Room
Job Slots (`docs/PHASE_5_ROOM_JOB_SLOTS.md`) and the Policy System
(`docs/PHASE_19_POLICY_SYSTEM.md`), the sub-PR letters here (A, B, C, ...) are a separate,
informal numbering from the roadmap's phase numbers — this document's "20-A" etc. matches
the task-tracker naming used when this work was requested, not `ROADMAP_PHASES.md`'s
"Phase 6".

## Goal

Deliver events as captain reports with actions, not plain logs. A report is a structured,
categorized inbox entry — "what happened while you weren't watching" — that the player can
scan by category and mark read/acknowledged, distinct from `gameStore.logs`'s flat,
scrolling text feed. Examples from the roadmap: research complete, new signal found,
engine efficiency drop, crew conflict, expedition result. With the Policy System
(Phase 19) now handling a growing share of ship operations automatically, a flat log feed
stops being enough for the player to answer "what did my policies/crew do while I was
looking at another panel" — the report system is the FM-style inbox that answers that.

**This sub-PR (20-A) is foundation only.** It introduces the category catalog, the
persisted report store, and the pure report builder — but nothing in the game actually
*creates* a report yet. No `gameClock.js` process* function calls a report builder, and no
UI reads `reportStore`. Every existing test still passes unchanged, and a new
characterization test pins down that a full multi-tick run under heavy simulated pressure
(every policy enabled, hull/fuel low, an injured crew member, a pending encounter) never
adds a single report. The real event→report wiring is 20-B; the inbox UI is 20-C.

## Architecture

- `src/data/reports.js` — pure data, no store/system imports. `REPORT_CATEGORIES` is the
  single source of category ids, Korean labels, icons, and `defaultPriority`.
  `FALLBACK_REPORT_CATEGORY` is what an unknown/missing category id normalizes to.
  `getReportCategory(id)` looks a category up by id. Same "catalog + pure builder + store
  thin wrapper" pattern as `POLICY_CATALOG` (`src/data/policies.js`) before it.
- `src/systems/reportSystem.js` — pure functions only, no store imports.
  `buildReport({ category, title, body, priority?, currentMinute, meta? })` validates
  `category` against the catalog (falling back rather than throwing), validates `priority`
  against `REPORT_PRIORITIES` (falling back to the category's `defaultPriority`), and
  returns a normalized report *content* object — `{ category, priority, title, body,
  createdAtMinute, meta }`. It does not assign `id`/`read`/`acknowledged`; those are
  `reportStore.addReport()`'s job (same division as `jobMigration.js`'s job shapes vs.
  `jobStore.js`'s `createId()`). Two domain builder examples — `buildPolicyReport` and
  `buildCombatReport` — sit on top of `buildReport` to pin down the shape 20-B's real
  callers will use; see "Domain builder contracts" below.
- `src/stores/reportStore.js` — holds `reports: []` (newest first, capped at 120 — see
  "Retention policy" below) plus lifecycle actions: `addReport`, `markRead`,
  `markAllRead`, `acknowledge`, `clearAcknowledged`. No store-to-store imports. Persisted
  as `space-manager-reports` using the `src/stores/persistVersion.js` version/migrate
  pattern (Phase 18-E), with a defensive `merge` that re-validates every saved report's
  shape and re-applies the 120-entry cap. Two plain (non-store) selector functions,
  `getUnreadCount(reports)` and `getUnacknowledgedCount(reports)`, plus
  `getReportsByCategory(reports, categoryId)`, are exported alongside the store for 20-C
  to use — see "Derived selectors and render stability" below.
- `src/systems/gameClock.js` — **not modified in this PR.** See "gameClock wiring
  decision" below for why.

## Data flow

```
(20-B) gameClock.process* (orchestrator step, already reading store snapshots for its own
                            addLog(...) calls)
  -> systems/reportSystem.buildReport / buildPolicyReport / buildCombatReport / ... (pure)
       <- a normalized report content object
  -> stores/reportStore.addReport(report)   (assigns id, forces read:false/acknowledged:false)
  -> (20-C) UI reads useReportStore((state) => state.reports) and the derived selectors
```

`src/data/reports.js` and `src/systems/reportSystem.js` never import from `src/stores/*.js`.
`src/stores/reportStore.js` never imports another store. In 20-B, `src/systems/gameClock.js`
becomes the only place that reaches into `reportStore` alongside the other stores it already
orchestrates — matching the policy system's shape (`gameClock.processPolicies` is the only
caller that spans `policyStore` + `gameStore` + `crewStore` + `shipInteriorStore`).

## Reports run parallel to logs — never a replacement, never parsed from them

Two rules, both load-bearing for this and every future report sub-PR:

1. **`gameStore.logs`/`gameStore.addLog` are untouched and keep working exactly as they do
   today.** This PR does not modify any log-related code in `gameStore.js`, and no future
   report sub-PR should either. Reports are an additive, higher-level layer on top of the
   same underlying events — a report inbox for scanning "what changed by category," while
   the log feed stays the detailed, chronological, one-line-per-event record it already is.
   A player who never opens the report inbox should see identical logs to today.
2. **A report is always built from the same structured event data a `process*` function
   already has in hand — never by parsing a `gameStore.logs` string.** Log lines are
   free-text meant for a human to read once in a scrolling feed, not a stable data
   contract: several of them are deliberately throttled/suppressed on repeat ticks
   (`policyEngine.js`'s diagnostic throttle, see `PHASE_19_POLICY_SYSTEM.md`) in ways a
   report must not inherit, and their wording can change without warning anything that
   might be regex-matching them. `policyEngine.js`'s `evaluatePolicies` already returns
   `{ actions, logs }` as index-aligned pairs — 20-B's `gameClock.processPolicies` is
   expected to build a report from the same `action.detail` data it already uses to
   compose that tick's `log` string, computed once and used for both, not to re-derive
   anything from the log text afterward. `src/systems/reportSystem.js`'s file header
   restates this rule next to the code it governs.

## Category catalog

Source of truth: `src/data/reports.js`'s `REPORT_CATEGORIES`.

| id | label | icon | default priority | intended source (wired in 20-B) |
| --- | --- | --- | --- | --- |
| `policy` | 정책 자동 집행 | 🛡️ | `info` | policy engine actions (auto-repair, auto-treatment, fuel warning, encounter auto-resolve) |
| `combat` | 전투 결과 | ☠️ | `high` | combat engine outcomes |
| `navigation` | 항해 · 조우 | 🧭 | `medium` | navigation events / encounters |
| `crisis` | 함내 위기 | 🚨 | `critical` | crisis spawn/resolution |
| `work` | 작업 완료 | 🔧 | `info` | training/treatment/repair/module job completion |
| `economy` | 계약 · 거래 | 💰 | `medium` | contract/market/reward events |

Plus `FALLBACK_REPORT_CATEGORY` (`id: "general"`, label 일반), used only when
`buildReport`/`reportStore` receive an unrecognized or missing category id — this never
appears in the table above because it is a safety net, not an intended source.

## Priority vocabulary — reused, not reinvented

A report's `priority` field uses `systems/commandCenter.js`'s existing card-priority
vocabulary verbatim: `"critical" | "high" | "medium" | "low" | "info"` (see
`REPORT_PRIORITIES` in `src/data/reports.js`, and the Phase 18-E boundary comment in
`commandCenter.js` that first drew this line against `systems/priorities.js`'s separate
*activity*-priority vocabulary). A report is a situation/inbox concept, the same category
of thing as a command-center situation card, so it belongs on the card-priority side of
that boundary rather than minting a fourth vocabulary. `src/data/reports.js` does not
import `commandCenter.js` (data files stay dependency-free, matching `data/policies.js`'s
own note on this) — the mapping is documented here and in `reports.js`'s file header
instead. **20-C's UI should reuse `commandCenter.js`'s `PRIORITY_LABEL`/`PRIORITY_TONE`
tables to render a report's priority**, not re-derive new label/tone tables, so a
"critical" card in the command center and a "critical" report in the inbox always look
the same.

## Domain builder contracts (for 20-B)

`buildPolicyReport({ policyId, summary, currentMinute, priority? })` and
`buildCombatReport({ title, summary, outcome, currentMinute, priority? })` in
`src/systems/reportSystem.js` are thin wrappers over `buildReport` that fix the shape
20-B's real gameClock callers will use, the same way Phase 19-A shipped one working
diagnostic rule in `policyEngine.js` instead of a fully empty skeleton (see
`PHASE_19_POLICY_SYSTEM.md`'s "Engine design decision"). Neither is called from anywhere
in this PR — no `gameClock.js` process* function exists yet that would call them. Any
further domain builder 20-B adds for navigation/crisis/work/economy reports should follow
the same shape: accept the structured fields a `process*` function already has on hand
(not raw store objects — see the architecture rule that `reportSystem.js` stays
store-import-free), plus `currentMinute`, and delegate to `buildReport` for the actual
validation/normalization.

## reportStore actions and retention policy

- `addReport(report)` — normalizes the given report-shaped object (typically
  `buildReport`'s output) into the store's canonical shape, auto-generates `id` if the
  caller didn't supply one, unconditionally sets `read: false` and `acknowledged: false`
  (a newly-added report always starts unseen, even if the input object happened to carry
  those fields set to `true`), and unshifts it to the front of `reports` (newest first,
  matching `gameStore.logs`'s own ordering).
- **Retention: a plain 120-entry cap, oldest dropped first** (`.slice(0, 120)` after
  unshifting — the same shape `gameStore.addLog`'s existing 80-entry log cap already uses).
  This is intentionally simple: there is no priority-aware retention (e.g. "never drop an
  unacknowledged critical report before an acknowledged info one"). The Phase 20-A task
  brief calls this out explicitly as a case where a fancier policy would be
  over-engineering for a foundation PR that doesn't even generate reports yet. A future
  PR is free to add priority-aware retention later, but should treat it as a deliberate,
  separately-motivated change, not something this document already promises.
- `markRead(id)` / `markAllRead()` — mark one or all reports read; both are no-ops
  (return the same state reference) when there is nothing to change, matching
  `policyStore.js`'s "no-op for unknown id" convention.
- `acknowledge(id)` — marks a report both `acknowledged: true` **and** `read: true` in one
  call (acknowledging implies having read it — a caller never needs to `markRead` first).
- `clearAcknowledged()` — removes every acknowledged report from `reports` in one call
  (e.g. for a future "clear reviewed reports" UI button in 20-C).

## Derived selectors and render stability

`getUnreadCount(reports)` and `getUnacknowledgedCount(reports)` are plain functions (not
store actions) that reduce a `reports` array to a primitive number — safe to call directly
inside a component body or a zustand selector, since a number has no reference-identity
concerns across renders. `getReportsByCategory(reports, categoryId)` returns a **new**
filtered array on every call (`Array#filter`); it must **not** be called directly inside a
`useReportStore((state) => ...)` selector in 20-C, since that recreates the array every
render and defeats zustand's reference-equality check the same way any derived-array
selector would. The intended 20-C usage is:

```js
const reports = useReportStore((state) => state.reports);
const unread = getUnreadCount(reports); // primitive, fine every render
const combatReports = useMemo(() => getReportsByCategory(reports, "combat"), [reports]);
```

## gameClock wiring decision — not touched in this PR

`src/systems/gameClock.js` is **not modified** in 20-A. Two options were on the table:

1. Wire an empty/no-op hook into `gameClock.js` now (e.g. a `processReports` stub that
   calls nothing), so the eventual 20-B diff is smaller.
2. Leave `gameClock.js` completely untouched and let 20-B add the wiring from scratch.

This PR takes option 2. Reasoning:

- `gameClock.js` already orchestrates a lot (navigation, job scheduler, crew AI, meals,
  needs, room jobs, crises, crew health, policies — see `processTimedJobs`'s call chain).
  Adding a stub step that does nothing yet adds surface area (an import, a function, a
  call site, a test asserting the stub is inert) for zero behavioral benefit — 20-A's
  "no gameplay change" characterization test can already be written and verified without
  it (see `gameClock.integration.test.js`'s new Phase 20-A block, which drives 30 ticks
  under combined pressure and asserts `reportStore.reports` stays empty).
- Every real report needs a **domain-specific** call site (a policy action turning into
  `buildPolicyReport`, a combat result turning into `buildCombatReport`, etc.) — there is
  no single generic `processReports` step analogous to `processPolicies` that would make
  sense to stub out ahead of time. Contrast with Phase 19-A, which *did* wire
  `processPolicies` early because `policyEngine.evaluatePolicies` already had one real
  generic entry point to call; the report system's entry points are the several existing
  `process*` functions themselves, not a new one.
- Keeping `gameClock.js` untouched makes the "20-A changes zero gameplay" guarantee
  trivially inspectable from the diff alone (no changes to the one file that could
  possibly introduce a behavior change), rather than relying on a reader trusting that a
  new stub function is really never called with real effect.

20-B is expected to modify `gameClock.js` directly: each relevant `process*` function
(`processPolicies` for policy reports, and whichever functions own combat/navigation/
crisis/job-completion for the other categories) builds a report via `reportSystem.js`
from the same structured data it already uses for its `addLog` call, and calls
`useReportStore.getState().addReport(...)`.

## Implemented (by sub-PR)

- **A — foundation (this PR).** `data/reports.js` catalog (`REPORT_CATEGORIES`,
  `FALLBACK_REPORT_CATEGORY`, `getReportCategory`), `systems/reportSystem.js`
  (`buildReport` plus the `buildPolicyReport`/`buildCombatReport` domain-builder
  contracts — neither wired anywhere), `stores/reportStore.js` (`reports` array,
  `addReport`/`markRead`/`markAllRead`/`acknowledge`/`clearAcknowledged`, 120-entry cap,
  persisted with a defensive merge, plus the `getUnreadCount`/`getUnacknowledgedCount`/
  `getReportsByCategory` selectors). `space-manager-reports` added to `SaveLoadModal.jsx`
  and `Menu.jsx`'s known persisted-storage-key lists. `gameClock.js` intentionally left
  untouched (see "gameClock wiring decision"). No gameplay or UI change — pinned down by
  a new multi-tick characterization test.
- **B — generators (planned).** Wire `gameClock.js`'s existing `process*` functions to
  call `reportSystem.js` builders and `reportStore.addReport` from structured event data:
  policy actions (`processPolicies`), combat results, navigation encounters, crisis
  spawn/resolution, and work-job completion (training/treatment/repair/module).
- **C — UI (planned).** An inbox panel reading `reportStore` (category filters, read/
  unread/acknowledged states, `clearAcknowledged` action) plus an Overview/command-center
  unread-count badge using `getUnreadCount`.
- **D — stabilization (planned).** Cross-category integration testing once 20-B/20-C
  land, plus a documentation final pass (matching 19-F's role for the policy system).

## Verification (20-A)

- `npm test` — all pre-existing tests pass unchanged, plus new coverage for:
  - `systems/__tests__/reportSystem.test.js` — `buildReport`'s normalization (valid
    input passthrough, unknown/missing category fallback, invalid/omitted priority
    fallback, title/body/createdAtMinute/meta coercion, never-throws-on-empty-input),
    and the `buildPolicyReport`/`buildCombatReport` domain-builder contracts.
  - `stores/__tests__/reportStore.test.js` — `addReport` (newest-first ordering, id
    auto-generation, forced unread/unacknowledged on add, normalization of bad input,
    the 120-entry cap dropping oldest-first), `markRead`/`markAllRead`/`acknowledge`/
    `clearAcknowledged` (including their no-op-on-nothing-to-change behavior), the
    `getUnreadCount`/`getUnacknowledgedCount`/`getReportsByCategory` selectors, and
    persist-merge (empty/missing/malformed persisted state, preserving a valid saved
    report's read/acknowledged status, and re-applying the 120-entry cap).
  - `systems/__tests__/gameClock.integration.test.js`'s new Phase 20-A block — 30 ticks
    with every policy enabled and the ship under combined pressure (mirroring 19-F's
    scenario) still add zero reports, confirming the generator truly isn't wired yet
    while also confirming the scenario is log-worthy (so the zero-reports assertion isn't
    vacuous).
- `npm run build` — passes; `dist/` removed after verifying.
- No UI changes in this PR (inbox panel is 20-C), so no new user-facing surface to
  smoke-test beyond confirming the app still boots with `reportStore` in the store graph
  (implicitly covered by the app not crashing under `npm run build` + the existing
  Playwright home-load smoke test, if run).
