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

| id | label | icon | default priority | actual source (as of 20-D) |
| --- | --- | --- | --- | --- |
| `policy` | 정책 자동 집행 | 🛡️ | `info` | `gameClock.js`'s `applyPolicyActions` — auto-hull-repair enqueue, auto-treatment enqueue, encounter-default-choice resolve. Diagnostic-only policy branches (warnings) never file a report. |
| `combat` | 전투 결과 | ☠️ | `high`/varies | `Combat.jsx`, at the engaged→won/lost/retreated transition. `priority` varies by outcome (won=`high`, lost=`critical`, retreated=`medium`) — see the volume-selection table below. |
| `navigation` | 항해 · 조우 | 🧭 | `medium` | `Exploration.jsx`'s `handleCompleteMission` only — mission completion. Manual node arrivals and manually-resolved (player-clicked) encounters are deliberately NOT reported (see the volume-selection table). |
| `crisis` | 함내 위기 | 🚨 | `critical`/`info` | `gameClock.js`'s `processCrises` (`tickCrises`'s internal ambient/escalation spawns) AND `applyNavEffect`'s `spawnCrisis` effect handler (encounter/drift-triggered spawns, wired in 20-D). Both funnel through the same `reportCrisisEvent` helper. `spawned` → `critical`, `resolved` → `info`; `escalated` is never reported. |
| `work` | 작업 완료 | 🔧 | `info` | `gameClock.js`'s `applyUnifiedJob` — every completed jobStore job (training/treatment/recovery/module_upgrade/decode/hull_repair/salvage), regardless of whether it was enqueued manually (UI) or by a policy. |
| `economy` | 계약 · 거래 | 💰 | `medium` | **Not wired as of 20-D** — no generator exists yet. See "Known limitations" below. |

Plus `FALLBACK_REPORT_CATEGORY` (`id: "general"`, label 일반), used only when
`buildReport`/`reportStore` receive an unrecognized or missing category id — this never
appears in the table above because it is a safety net, not an intended source.

## Volume-selection principle and table

`systems/reportSystem.js`, `systems/gameClock.js`, and the UI call sites (`Combat.jsx`,
`Exploration.jsx`) all reference "this PR's volume-selection table" in their comments —
this is that table, finalized here in 20-D (20-B introduced the principle but never
landed it in this doc; see "Documentation gap" under "Known limitations" for why).

**Principle:** a report exists to answer "what happened while I wasn't watching" for an
*unattended decision or a completed result* — not to mirror every state transition
`gameStore.logs` already narrates play-by-play. Something becomes a report only if a
player who never opens the inbox would otherwise have no way to notice it happened, or if
it is significant enough to warrant a persistent, categorized, acknowledgeable record
distinct from a scrolling log line. Concretely:

| Event | Reported? | Why |
| --- | --- | --- |
| A policy actually mutates state (enqueues a job, resolves an encounter) | Yes | Player wasn't there to click the equivalent manual button — this is the entire reason policies need a report layer. |
| A policy's diagnostic-only branch (e.g. "폐자재 부족", "연료 예비율 낮음") | No | Already a throttled `addLog` warning; repeating it as a report on every throttle window would spam the inbox for a state, not an event. |
| A jobStore job completes (any type, any origin) | Yes | A completed result, per the roadmap's own example list ("작업 완료"). Origin (manual vs. policy) doesn't gate it — only completion does. |
| Combat ends (won/lost/retreated) | Yes | A completed result with lasting consequences (loot, casualties). |
| Individual combat rounds/directives | No | Play-by-play; the player is actively driving Combat.jsx in real time when this happens, unlike an unattended policy action. |
| Mission completion | Yes | A completed result the player may not be watching for (could complete while docked elsewhere). |
| Manual node arrival / manually-resolved encounter | No | A direct player action in the same moment — the player already knows, by definition, since they just clicked it. |
| Crisis spawn (any source) | Yes, `critical` | A new unattended emergency demanding a response — the roadmap's own "crew conflict"-style example. |
| Crisis resolution | Yes, `info` | A completed result closing the loop on a `critical` report already in the inbox. |
| Crisis escalation (severity bump, overheat→fire, spread) | No | The spawn report already exists for that crisis, and `ShipInterior`'s live crisis cards show escalation state in real time — reporting every escalation step would multiply crisis-report volume by however many escalation steps a crisis goes through before resolution, without adding information the spawn report + live UI don't already carry. |
| Contract/market/reward events (`economy` category) | Not yet | See "Known limitations" — the category exists in the catalog for a future sub-PR, no generator exists. |

Measured volume (from 20-B's own verification): a 60-tick heavy-pressure scenario (every
policy enabled, hull/credits/scrap starved) produced 8 reports (4 policy / 4 work) —
informative, not spammy. 20-D's own 100-tick combined-pressure-plus-forced-crisis scenario
(`gameClock.integration.test.js`'s Phase 20-D block) stays within a generously-computed
upper bound derived from each generation point's own gating logic — see that test's
file-header comment for the full calculation.

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

## Domain builder contracts

`src/systems/reportSystem.js` exports five thin wrappers over `buildReport`, each fixing
one category's shape and threading a machine-readable field into `meta` (for 20-C's
filters, not for display — the title/body already carry the human-readable text):

- `buildPolicyReport({ policyId, summary, currentMinute, priority? })` → `meta.policyId`.
  Called from `gameClock.js`'s `reportPolicyAction`, itself called from
  `applyPolicyActions`'s three mutating-action branches.
- `buildCombatReport({ title, summary, outcome, currentMinute, priority? })` →
  `meta.outcome`. Called directly from `Combat.jsx` (a UI component, not `gameClock.js` —
  see "gameClock/UI-only `addReport`" below).
- `buildCrisisReport({ title, summary, crisisKind, currentMinute, priority? })` →
  `meta.crisisKind` (`"spawned" | "resolved"`, never `"escalated"`). Called from
  `gameClock.js`'s `reportCrisisEvent`, itself called from both `processCrises` (ambient/
  escalation spawns via `tickCrises`) and `applyNavEffect`'s `spawnCrisis` handler
  (encounter/drift-triggered spawns, wired in 20-D).
- `buildWorkReport({ title, summary, jobType, currentMinute, priority? })` →
  `meta.jobType`. Called from `gameClock.js`'s `reportJobCompletion`, itself called from
  every completing branch of `applyUnifiedJob`.
- `buildNavigationReport({ title, summary, navKind, currentMinute, priority? })` →
  `meta.navKind`. Called directly from `Exploration.jsx`'s `handleCompleteMission` (a UI
  component) with `navKind: "missionComplete"` — the only navigation event this system
  reports (see the volume-selection table above).

This module intentionally shipped 20-A with only `buildPolicyReport`/`buildCombatReport`
defined-but-uncalled, the same way Phase 19-A shipped one working diagnostic rule in
`policyEngine.js` instead of a fully empty skeleton (see `PHASE_19_POLICY_SYSTEM.md`'s
"Engine design decision") — 20-B then added the other three builders and wired all five to
real call sites.

### `addReport` is confined to `gameClock.js` and UI components — never another store/system

Every `useReportStore.getState().addReport(...)` call site in this codebase lives in
either `src/systems/gameClock.js` (the designated multi-store orchestration point — see
the "Data flow" section above) or a UI component that already owns the player-facing
moment a report describes (`Combat.jsx`'s directive resolution, `Exploration.jsx`'s
mission-completion handler). No `stores/*.js` file other than `reportStore.js` itself ever
imports `reportStore` or calls `addReport` — `shipInteriorStore.js`'s `tickCrises`, for
example, only returns a structured `crisisEvents` array for `gameClock.js` to turn into a
report; it does not call `addReport` itself. This mirrors the same "stores stay
report/log-authoring-free, orchestration owns it" rule `gameClock.js`'s `addLog` calls
already followed pre-Phase-20, now extended to `addReport`.

## reportStore actions and retention policy

- `addReport(report)` — normalizes the given report-shaped object (typically
  `buildReport`'s output) into the store's canonical shape, auto-generates `id` if the
  caller didn't supply one, unconditionally sets `read: false` and `acknowledged: false`
  (a newly-added report always starts unseen, even if the input object happened to carry
  those fields set to `true`), and unshifts it to the front of `reports` (newest first,
  matching `gameStore.logs`'s own ordering).
- **Retention: a 120-entry cap, oldest dropped first, with one narrow priority-aware
  carve-out added in 20-D** — see "Retention policy decision (20-D)" below for the full
  before/after and the reasoning for adding the carve-out instead of leaving the plain
  120-cap as a documented limitation.
- `markRead(id)` / `markAllRead()` — mark one or all reports read; both are no-ops
  (return the same state reference) when there is nothing to change, matching
  `policyStore.js`'s "no-op for unknown id" convention.
- `acknowledge(id)` — marks a report both `acknowledged: true` **and** `read: true` in one
  call (acknowledging implies having read it — a caller never needs to `markRead` first).
- `clearAcknowledged()` — removes every acknowledged report from `reports` in one call
  (e.g. for a future "clear reviewed reports" UI button in 20-C).

## Retention policy decision (20-D)

Phase 20-A shipped `reportStore`'s retention as a plain `.slice(0, 120)` after unshifting
— oldest dropped first, no priority awareness — and explicitly called that out as
appropriate scope for a foundation PR that did not yet generate a single report. 20-D
revisited the decision now that 20-B/20-C made the cap reachable by real gameplay, and
chose a **minimal, targeted fix** over leaving it as a documented limitation. The reasoning:

**Why not "just document it as an accepted limitation":**
- Measured volume (20-B's own verification): a 60-tick heavy-pressure scenario (every
  policy enabled, hull/credits/scrap starved) produced 8 reports. Extrapolating linearly,
  reaching the 120-entry cap under sustained *multi-category* pressure like that would take
  roughly 900 ticks (`60 * 120 / 8`) — real hours of continuous, unattended play with every
  policy firing repeatedly. This is a legitimate, if rare, long-session scenario, not a
  contrived edge case.
- Unlike an evicted `gameStore.logs` line (free-text, meant to be read once in a scrolling
  feed — see this doc's "Reports run parallel to logs" section), a dropped **unacknowledged
  `critical`-priority report is a real information-loss bug**: `crisis` reports default to
  `critical` specifically to flag a live, unresolved emergency the player has not yet
  acknowledged. A player who leaves the report inbox unread for a long session should not
  be able to have a still-relevant emergency notice silently vanish underneath 120 newer,
  lower-stakes reports (e.g. a string of routine `work`/`policy` info-level reports).

**Why not full priority-aware retention (e.g. reordering by priority, protecting `high`
too, LRU-per-category, etc.):** that would be over-engineering for what is still a rare
edge case reachable only after very long, heavily-automated play sessions. Only the one
scenario with real information-loss consequences — an **unacknowledged `critical`
report** — gets special handling; everything else (including unacknowledged `high`/
`medium`/`low`/`info` reports, and any `acknowledged` report regardless of priority) is
still dropped oldest-first exactly as 20-A shipped it.

**The fix — `capReports()` in `src/stores/reportStore.js`:**
1. Still drops oldest-first once the array exceeds `MAX_REPORTS` (120), same as before.
2. Among what *would* be dropped, any report that is both `priority === "critical"` and
   `acknowledged === false` is preserved past the cap instead of dropped — appended after
   the kept 120 (they are, by construction, older than everything in the kept slice, so the
   array's newest-first invariant holds even with the carve-out).
3. The carve-out itself is bounded: total array length can never exceed
   `MAX_REPORTS_WITH_PRESERVED_CRITICAL` (140) — a hard ceiling on top of the carve-out so a
   long session that generates dozens of unacknowledged critical reports still can't grow
   `reports` unboundedly (an unbounded carve-out would just move the "silent unbounded
   growth" problem from "any report" to "critical reports," not eliminate it).
4. Once a preserved critical report is acknowledged, it loses its protection and ages out
   on the very next cap-triggering `addReport()` like any other report — the carve-out only
   ever protects the specific "still needs the player's attention" state.

Applied identically at both mutation points — `addReport()` and the persist `merge`'s
`mergeReports()` — via one shared `capReports()` helper, so a persisted save that somehow
exceeds the cap (a hand-edited save, or a future lower `MAX_REPORTS`) gets exactly the same
treatment a live overflow would. See `src/stores/__tests__/reportStore.test.js`'s
"retention preserves an unacknowledged critical report past the plain cap (Phase 20-D)"
block for the tests pinning this down (including the acknowledged-critical and
non-critical-priority negative cases, and the 140-entry hard-ceiling case).

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

## gameClock wiring decision — not touched in 20-A (historical; superseded by 20-B/20-D)

This section documents 20-A's own decision to leave `gameClock.js` untouched, preserved
here for the reasoning it captures. It is **no longer current** — 20-B did wire
`gameClock.js` directly, exactly as this section predicted, and 20-D added one more
`gameClock.js` call site (`applyNavEffect`'s `spawnCrisis` branch) on top of it. See
"Implemented (by sub-PR)" below for what actually landed.

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

- **A — foundation.** `data/reports.js` catalog (`REPORT_CATEGORIES`,
  `FALLBACK_REPORT_CATEGORY`, `getReportCategory`), `systems/reportSystem.js`
  (`buildReport` plus the `buildPolicyReport`/`buildCombatReport` domain-builder
  contracts, both defined but not yet called from anywhere), `stores/reportStore.js`
  (`reports` array, `addReport`/`markRead`/`markAllRead`/`acknowledge`/
  `clearAcknowledged`, the original plain 120-entry cap, persisted with a defensive
  merge, plus the `getUnreadCount`/`getUnacknowledgedCount`/`getReportsByCategory`
  selectors). `space-manager-reports` added to `SaveLoadModal.jsx` and `Menu.jsx`'s known
  persisted-storage-key lists. `gameClock.js` intentionally left untouched (see
  "gameClock wiring decision" above). No gameplay or UI change — pinned down by a
  30-tick multi-policy-pressure characterization test asserting zero reports.
- **B — generators.** Wired `gameClock.js`'s existing `process*` functions (plus two UI
  components) to call `reportSystem.js` builders and `reportStore.addReport` from
  structured event data, following the volume-selection principle above:
  - `applyPolicyActions`'s three mutating branches (auto-hull-repair enqueue,
    auto-treatment enqueue, encounter-default-choice resolve) → `policy` reports via a
    new `reportPolicyAction` helper. Diagnostic-only branches excluded.
  - `Combat.jsx`'s engaged→won/lost/retreated transition → one `combat` report per fight,
    built from the same structured `combat`/`dustGain`/`result.loot`/`casualty` fields
    already used to compose that moment's log lines.
  - `shipInteriorStore.js`'s `tickCrises` extended non-destructively to return a
    structured `crisisEvents` array (`{ kind: "spawned"|"resolved"|"escalated", crisis,
    roomId }`) alongside its pre-existing `effects`/`logs`; `gameClock.js`'s
    `processCrises` turns `spawned`/`resolved` events (only) into `crisis` reports via a
    new `reportCrisisEvent` helper — `escalated` deliberately excluded.
  - `applyUnifiedJob`'s every completing branch (training/treatment/recovery/
    module_upgrade/decode/hull_repair/salvage) → `work` reports via a new
    `reportJobCompletion` helper, regardless of whether the job was enqueued manually or
    by a policy.
  - `Exploration.jsx`'s `handleCompleteMission` → one `navigation` report
    (`navKind: "missionComplete"`) built from `applyMissionRewards`'s structured payout.
  - **Known gap this sub-PR left open (closed in 20-D):** crises spawned via
    `applyNavEffect`'s `spawnCrisis` effect (the encounter/drift-triggered path —
    `navEncounters.js` option outcomes, `navStore.js`'s drift `power_loss` roll) did not
    file a report; only `tickCrises`'s own internal ambient/escalation spawns were wired.
  - Test coverage added directly to `gameClock.integration.test.js`'s Phase 20-B block
    (policy+work report pairing, diagnostic-only-never-reports, crisis spawn/resolve,
    manual-job-also-reports, all-policies-off regression) — 21 new tests.
- **C — UI.** `ReportsModal.jsx` (registered as `modals.reports`, following
  `PolicyModal.jsx`'s catalog-driven pattern): header with total/unread counts, "모두
  읽음"/conditional "확인한 보고서 정리" actions, category filter chips
  (전체 + `REPORT_CATEGORIES`), newest-first cards (category icon, priority chip via
  `commandCenter.js`'s `PRIORITY_LABEL`/`PRIORITY_TONE`, body, `formatGameDate`
  timestamp) with unread/unacknowledged-critical visual emphasis, click-to-`markRead`,
  per-card `확인`-button-to-`acknowledge`. Unread-count entry points: `Menu.jsx`'s
  utility card badge, `Sidebar.jsx`'s quick-action corner dot, and `BottomDock.jsx`'s
  existing 메뉴-tab alert dot (reused rather than stacked, since both mean "attention
  needed in the menu"). `Overview.jsx`'s home digest: an "미확인 보고서" section (up to 3
  unread, "전체 보기" opens the modal), rendering nothing when unread is 0.
  `PRIORITY_LABEL`/`PRIORITY_TONE` promoted from private consts to exports in
  `commandCenter.js` (the path 20-A's doc prescribed) so the report UI reuses the
  card-priority tables verbatim. No changes to report generation logic — reportStore's
  existing actions only. Verified with Playwright E2E covering the full loop (seeded
  reports → home digest → dock dot → menu badge → inbox → unread emphasis → read on
  click → acknowledge → category filter → 모두 읽음 clears badges → digest
  disappears/reappears).
- **D — stabilization (this PR).** Cross-category, longer-running integration testing
  once 20-B/20-C landed, plus this documentation final pass:
  - Closed 20-B's known gap: `applyNavEffect`'s `spawnCrisis` branch now captures
    `shipInteriorStore.spawnCrisis`'s return value and, on a successful spawn, calls the
    same `reportCrisisEvent` helper `processCrises` already uses — so encounter/
    drift-triggered crisis spawns file a `crisis` report exactly like ambient/escalation
    spawns do. Verified non-duplicating with the two spawn paths via
    `addCrisisToDraft`'s `room.activeCrisisId` guard (a room can only host one active
    crisis at a time, so the two paths can never both successfully spawn — and thus never
    both report — for the same room in the same moment). Three new targeted tests in
    `gameClock.integration.test.js`'s Phase 20-D block.
  - Revisited the retention cap (`reportStore.js`'s `capReports`) to preserve an
    unacknowledged `critical` report past the 120-entry cap, bounded by a 140-entry hard
    ceiling — see "Retention policy decision (20-D)" above for the full reasoning. Four
    new tests in `reportStore.test.js`.
  - A 100-tick combined-pressure-plus-forced-crisis long-run integration test (mirroring
    19-F's role for the policy system): no crash, report volume within a
    generation-point-derived upper bound, no duplicate report ids, and — the store-
    ownership guard this sub-PR specifically set out to pin down — two reports
    pre-marked read/acknowledged before the run stay byte-identical across 100 ticks of
    unrelated gameClock activity.
  - This documentation pass: finalized the "Implemented" section (this one) with what
    each sub-PR actually shipped (20-B/20-C never updated this doc while landing — see
    "Known limitations" below), added the volume-selection table several code comments
    already referenced but that never existed until now, and added "Known limitations".
  - Cleanup scan across 20-A–C's output (`reports.js`/`reportStore.js`/
    `reportSystem.js`/`ReportsModal.jsx`/the `gameClock.js` connection points): no
    TODOs, no dead code, no stray `console.*` calls found — nothing to remove.

## Known limitations

- **`economy` category is unwired.** The catalog entry exists (`data/reports.js`) and
  `ReportsModal.jsx`'s filter chips already include it, but no contract/market/reward
  event generator has been written — completing a contract or a market trade files no
  report today, only a `gameStore.logs` line. This was in scope per the roadmap's
  original phase description but was not part of any of 20-A through 20-D's task briefs.
  A future sub-PR can add it following the exact same pattern as `buildWorkReport`/
  `reportJobCompletion` (structured payout data a contract/market completion handler
  already has on hand, never parsed from a log string).
- **Crisis escalation is never reported**, by design (see the volume-selection table) —
  a live crisis's severity increasing, an overheat promoting to fire, or a fire/intruder
  spreading to an adjacent room are all `tickCrises` `crisisEvents` with
  `kind: "escalated"`, structurally available in the same array `spawned`/`resolved`
  events come from, but `gameClock.js`'s `reportCrisisEvent` deliberately ignores them.
  The structured data already exists (`shipInteriorStore.js`'s `crisisEvents`), so a
  future sub-PR could resume reporting escalation without a data-layer change — but it
  should come with a **throttle** (e.g. one escalation report per crisis lifecycle, or a
  per-crisis cooldown), not a raw 1:1 mapping, since a single unattended crisis can
  escalate multiple times before resolving and an unthrottled version would reintroduce
  exactly the report-spam problem the volume-selection principle exists to avoid.
- **Retention is priority-aware only for the one case with real information-loss
  consequences** (unacknowledged `critical`) — see "Retention policy decision (20-D)"
  above. `Combat.jsx`'s outcome-priority mapping means a *lost* battle's report is
  `critical` (covered by the carve-out) but a *won* or *retreated* battle's report is
  `high`/`medium` (not specially preserved) — those, and every `medium`/`low`/`info`
  report regardless of category, still age out under the plain 120-cap with no special
  treatment once 120 newer reports of any category pile up behind them.
- **Documentation gap during 20-B/20-C:** both sub-PRs' code comments reference "this
  PR's volume-selection table" and "docs/PHASE_20_REPORT_SYSTEM.md" for rationale that,
  until this 20-D pass, did not actually exist in this file — 20-B and 20-C both shipped
  without updating this document (only 20-A and now 20-D have touched it, per
  `git log -- docs/PHASE_20_REPORT_SYSTEM.md`). This is a process gap worth naming for
  future phases: a sub-PR whose code comments point at "this doc" should update the doc
  in the same PR, the way 19-A through 19-F consistently did for `PHASE_19_POLICY_SYSTEM.md`.

## Verification

- `npm test` — 403 tests passing (395 pre-20-D baseline + 8 new: 4 in
  `reportStore.test.js`'s retention carve-out block, 4 in
  `gameClock.integration.test.js`'s new Phase 20-D block). Coverage by file:
  - `systems/__tests__/reportSystem.test.js` (20-A) — `buildReport`'s normalization plus
    the five domain-builder contracts.
  - `stores/__tests__/reportStore.test.js` — `addReport`/`markRead`/`markAllRead`/
    `acknowledge`/`clearAcknowledged`, the derived selectors, persist-merge, the original
    120-cap test (20-A), and 20-D's four new retention-carve-out tests (repro of the
    critical-report-evicted bug, the fix holding, the acknowledged/non-critical negative
    cases, and the 140-entry hard-ceiling).
  - `systems/__tests__/gameClock.integration.test.js` — the Phase 20-A inert-system
    block, the Phase 20-B per-category wiring blocks, and 20-D's two new blocks: three
    tests for the `spawnCrisis`-via-`applyNavEffect` report path (successful spawn files
    a report and really spawns the crisis; a blocked spawn into an already-occupied room
    files nothing; a same-tick race between the encounter-triggered and ambient spawn
    paths for the same room still produces exactly one report) plus the 100-tick
    long-run stabilization test described above.
- `npm run build` — passes; `dist/` removed after verifying.
- Playwright smoke (recommended, optional): trigger an encounter whose outcome includes
  a `spawnCrisis` effect, confirm the resulting `crisis` report actually appears in
  `ReportsModal` — the one 20-D code path with a real (if narrow) UI-reachable surface
  that no unit test can fully substitute for (confirming the report is genuinely visible
  to a player, not just present in `reportStore`'s state).
