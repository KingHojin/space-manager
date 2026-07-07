# Phase 19 — Policy System

This phase implements `docs/ROADMAP_PHASES.md`'s Phase 5 ("Policy System"), which was
planned from the start of the roadmap but never started. As with Room Job Slots
(`docs/PHASE_5_ROOM_JOB_SLOTS.md`), the sub-PR letters here (A, B, C, ...) are a
separate, informal numbering from the roadmap's phase numbers — this document's "19-A"
etc. matches the task-tracker naming used when this work was requested, not
`ROADMAP_PHASES.md`'s "Phase 5".

## Goal

Let the player command by policy, not by clicking every small action. A policy is a
toggleable automation rule — "if ship state matches X, do Y without asking me first" —
with player-tunable parameters (thresholds, stances). Examples from the roadmap:

- Auto repair below a hull threshold
- Auto treatment for injuries
- Fuel reserve policy
- SOS / pirate response policy (folded into a general "encounter default choice" policy
  here, since Phase 15's mission encounters and Phase 17's combat decisions already
  cover the specific SOS/pirate cases individually)

**This sub-PR (19-A) is foundation only.** It introduces the catalog, the persisted
toggle/param store, the pure evaluation engine, and the gameClock wiring — but no
policy actually *does* anything yet (every policy defaults to disabled, and even the
one working diagnostic rule only logs, it never enqueues a job or mutates a store). The
real per-policy logic (enqueuing repair/treatment jobs, auto-resupply, encounter
auto-resolution) and the settings UI are sub-PRs 19-B through 19-E.

## Architecture

- `src/data/policies.js` — pure data, no store/system imports. `POLICY_CATALOG` is the
  single source of policy ids, labels, descriptions, categories, `defaultEnabled`, and
  default `params`. `createDefaultPolicyState()` builds the `{ [id]: { enabled, params
  } }` shape policyStore initializes from. Same "catalog + pure evaluator + store thin
  wrapper" pattern as `ROOM_JOB_CATALOG` (`src/systems/roomJobs.js`) and
  `CRISIS_CATALOG` (`src/systems/crisisSystem.js`), except the catalog itself lives in
  `src/data/` here (matching `src/data/shipRooms.js`) rather than inline in the system
  file, since policy definitions are pure player-facing data with no formulas attached.
- `src/stores/policyStore.js` — holds `policies: { [policyId]: { enabled, params } }`
  only. No store-to-store imports. Actions: `setPolicyEnabled`, `setPolicyParam`,
  `resetPolicy`. Persisted as `space-manager-policies` using the
  `src/stores/persistVersion.js` version/migrate pattern (Phase 18-E). `merge` walks
  `POLICY_CATALOG`, not `Object.keys(savedPolicies)`, so: a policy added to the catalog
  after a save was written gets the catalog default; a policy removed from the catalog
  is silently dropped from the loaded state even if the old save still has it.
- `src/systems/policyEngine.js` — pure functions only, no store imports.
  `evaluatePolicies({ policies, resources, crew, rooms, currentMinute, deltaMinutes })`
  returns `{ actions: [], logs: [] }`. See "Engine design decision" below for why one
  policy (`auto-hull-repair`) has a real (diagnostic-only) rule while the other three
  are no-op skeletons in this PR.
- `src/systems/gameClock.js` — the only place that coordinates policyStore with other
  stores (as it already does for crew AI, room jobs, and crises). `processPolicies`
  reads `policyStore.policies` plus snapshots of `gameStore.resources`,
  `crewStore.crew`, and `shipInteriorStore.rooms`, calls
  `policyEngine.evaluatePolicies`, and applies only the returned `logs` to
  `gameStore.addLog`. The returned `actions` are **not** applied to anything in this
  PR — no job is enqueued, no resource is mutated. `processTimedJobs` calls
  `processPolicies` last, after `processCrewHealth`, in the same style as every other
  `process*` step.

## Data flow

```
gameClock.processPolicies (orchestrator step, reads policyStore + gameStore +
                            crewStore + shipInteriorStore)
  -> systems/policyEngine.evaluatePolicies (pure)
       <- { actions: [...], logs: [...] }
  -> gameClock applies logs to gameStore.addLog
     (actions are inert in 19-A; 19-B+ will apply them via jobStore/crewStore/etc.,
      the same way gameClock already applies systems/roomJobs.js's completedJobs
      and systems/crisisSystem.js-derived effects today)
```

`src/data/policies.js` and `src/systems/policyEngine.js` never import from
`src/stores/*.js`. `src/stores/policyStore.js` never imports another store. Only
`src/systems/gameClock.js` reaches into multiple stores.

## Policy catalog

Source of truth: `src/data/policies.js`'s `POLICY_CATALOG`. Every policy defaults to
disabled — the player must opt in from the settings panel (19-E, `PolicyModal`) before
any of this fires.

| id | label | category | default enabled | params (default) | real effect (landed in) |
| --- | --- | --- | --- | --- | --- |
| `auto-hull-repair` | 자동 선체 수리 | maintenance | off | `hullThreshold: 40` | enqueues a real `hullRepair` ship-work job (19-B) |
| `auto-treatment` | 부상자 자동 치료 | crew | off | `minSeverity: "minor"` (injurySystem.js state id — 경상) | enqueues a real treatment job (19-C) |
| `fuel-reserve` | 연료 예비율 경고 | logistics | off | `reserveThreshold: 30` | diagnostic warning log only (19-B) — see "Known limitations" |
| `encounter-default-choice` | 항해 조우 기본 대응 | navigation | off | `stance: "balanced"` (safe / balanced / aggressive) | auto-resolves `navStore.pendingEncounter` (19-D) |

## Engine design decision — diagnostic rule vs. empty skeleton

`evaluatePolicies` could have been a fully empty skeleton (loop over enabled policies,
push nothing, always return `{ actions: [], logs: [] }`). Instead, `auto-hull-repair`
has one real, working rule: when enabled and `resources.hull` is below
`params.hullThreshold`, it returns a diagnostic log line and a `{ policyId: "auto-hull-repair",
kind: "diagnostic", detail: { hull, threshold } }` action — but the action is never
applied to any store; `gameClock.processPolicies` only forwards `logs`.

Reasons for choosing the minimal-working-example over the fully-empty skeleton:

1. It pins down the final `{ actions, logs }` contract against a real candidate rule
   instead of a guess, so 19-B only has to add the `enqueueShipWork` call when a
   diagnostic fires, not redesign the return shape.
2. It gives `policyEngine.test.js` a real branch to assert on (ON + below-threshold
   produces a log/action; OFF, or ON + above-threshold, produces neither) instead of
   only a tautological "always returns `{ actions: [], logs: [] }`" case.
3. It still cannot change gameplay in this PR: the rule only returns data, never
   mutates a store or enqueues a job itself, and the caller (`gameClock.processPolicies`)
   only ever applies `logs` — so the "no gameplay change" guarantee in this PR holds
   regardless of how many policies get a working diagnostic rule.

The other three catalog policies (`auto-treatment`, `fuel-reserve`,
`encounter-default-choice`) are recognized by id (so a future typo is easy to spot) but
evaluate to no actions/logs — their real rules land in 19-C, 19-B, and 19-D
respectively.

## Implemented (by sub-PR)

- **A — foundation.** `data/policies.js` catalog, `stores/policyStore.js`
  (`setPolicyEnabled`/`setPolicyParam`/`resetPolicy`, persisted, catalog-driven merge),
  `systems/policyEngine.js` skeleton (with one working diagnostic rule for
  `auto-hull-repair`, to pin down the `{ actions, logs }` contract early), `gameClock.js`
  wiring (log-only — `actions` were computed but never applied to a store). All policies
  default OFF; no gameplay behavior changes.
- **B — auto-hull-repair + fuel-reserve.** `auto-hull-repair` goes fully real:
  `policyEngine.evaluateAutoHullRepair` checks `resources.hull` against
  `params.hullThreshold`, and — if there's no `hull_repair` job already
  backlog/assigned/in_progress and enough `salvage-scrap` on hand
  (`JOB_ECONOMY.hullRepair.salvageScrapCost`) — returns an `enqueue-ship-work` action;
  `gameClock.js`'s `applyPolicyActions` consumes the scrap via `inventoryStore.removeItem`
  and calls `jobStore.enqueueShipWork` with the exact same payload shape (and the exact
  same `JOB_ECONOMY.hullRepair.hullDelta`) `Ship.jsx`'s manual "선체 정비 지시" button
  uses, so an auto-triggered repair is indistinguishable from a manual one once queued.
  Not enough scrap → a throttled diagnostic warning instead (see the throttle note
  below). `fuel-reserve` gets a real *diagnostic* rule (checks `resources.fuel` against
  `params.reserveThreshold`) but intentionally stops at warning — see "Known
  limitations." Also introduced in this sub-PR: `gameClock.js`'s
  `policyWarningLastLoggedMinute` throttle (a module-level `Map`, not persisted state),
  which rate-limits repeated *diagnostic* warnings to once per
  `${policyId}:${reason}` key per 60 in-game minutes, so a policy stuck in a blocked
  state (e.g. perpetually low on scrap) doesn't spam the log feed every 15-minute tick.
  Real enqueue actions are never throttled — they're already self-limiting, since the
  next tick sees the freshly-enqueued job and goes silent on its own.
- **C — auto-treatment.** `policyEngine.evaluateAutoTreatment` filters living crew by
  `isInjured` + `injuryRank(member.injury) >= minSeverity`, excludes anyone already busy
  on another job (`isCrewMemberBusy`, keyed off `job.payload.targetCrewId`), and picks
  the single most severely injured qualifying candidate (ties keep crew array order) —
  at most one treatment job is proposed per tick, mirroring medbay's `slotCapacity: 1`.
  If `resources.credits` can't cover `treatmentRule(injury).cost`, it returns a throttled
  diagnostic instead of enqueuing. `gameClock.js`'s `applyPolicyActions` spends the cost
  via `gameStore.spendCredits` (re-checked against live credits, not the engine's
  snapshot, so a same-tick race with another credit-spending action fails safely instead
  of double-charging) and only calls `jobStore.enqueueTreatment` if that succeeds — same
  numbers (`systems/injurySystem.js`'s `treatmentRule`) `Crew.jsx`'s "치료" button uses.
- **D — encounter-default-choice.** `policyEngine.evaluateEncounterDefaultChoice` scores
  each non-combat option of `navStore.pendingEncounter` into `{ risk, reward }` (see the
  weighting scheme documented above `ENCOUNTER_RISK_RESOURCE_WEIGHTS` in
  `policyEngine.js`) and picks one by `params.stance` — lowest risk for `"safe"`, highest
  reward for `"aggressive"`, highest `reward - risk` for `"balanced"` (the default). Any
  option whose outcome contains a `{ kind: "combat" }` effect is removed from the
  candidate pool *before* scoring, unconditionally — if every option leads to combat, the
  policy leaves `pendingEncounter` untouched and only logs a diagnostic asking for manual
  resolution. `gameClock.js`'s `applyPolicyActions` re-validates the pending encounter is
  still the same one (by id) before calling the existing `applyNavigationEncounter`, the
  exact function a manual "조우 결재" click goes through. Originally scoped as
  "auto-resolve after the player doesn't respond in time" — see "Known limitations" for
  why that became "resolve immediately."
- **E — settings UI.** `components/modals/PolicyModal.jsx`: one card per
  `POLICY_CATALOG` entry with an ON/OFF toggle, an inline param editor (a threshold
  slider for `auto-hull-repair`/`fuel-reserve`, a severity picker for `auto-treatment`,
  a stance picker for `encounter-default-choice`), and a "기본값으로" reset button
  (`policyStore.resetPolicy`). A second section surfaces the 8 most recent
  `"정책:"`-prefixed entries from `gameStore.logs` via the new pure helper
  `utils/policyLogs.js`'s `filterPolicyLogs` (matches on the log-line prefix
  `policyEngine.js` guarantees every policy-authored log starts with, not on policy id).
- **F — stabilization (this PR).** See "19-F stabilization" below.

## Known limitations

These are deliberate scope cuts, not bugs — noted here so a future PR (or a player
filing "why didn't the policy do X") doesn't have to rediscover the reasoning.

- **`fuel-reserve` never auto-refuels.** It only ever produces a diagnostic warning log
  ("연료 예비율 경고 — ... 자동 보급은 아직 지원되지 않습니다 — 직접 보급하세요"). Auto-purchasing fuel
  needs a market/price model — station inventory, a fuel price per unit, a "can the ship
  afford N units" check — that doesn't exist anywhere in the codebase yet (there's no
  station shop/economy system at all as of Phase 19). Building that is out of scope for
  the policy system itself; `fuel-reserve` is written so that adding a real auto-refuel
  rule later only means adding a new branch to `evaluateFuelReserve`, not touching its
  call site or the action contract.
- **`encounter-default-choice` resolves immediately, not after a timeout.** The original
  brief (see `docs/ROADMAP_PHASES.md`) imagined something like "if the player hasn't
  responded to the SOS/pirate prompt within some window, the policy decides for them."
  `navStore.pendingEncounter` has no timeout or expiry concept — `arriveNode` sets it and
  it blocks `planRoute` indefinitely until `resolveEncounter` is called (see
  `navStore.js`); there is no timestamp on it to compare against "now," and no ticking
  countdown anywhere in the UI. Retrofitting a real countdown would mean adding an expiry
  field to `pendingEncounter`, a UI countdown so the player can see it coming, and a
  decision about what "timed out mid-manual-review" even means — a scope change well
  beyond a policy-evaluation rule. 19-D adjusted the design instead: with the policy
  enabled, an encounter auto-resolves the same tick it's seen pending, by `params.stance`.
  This is documented here explicitly because it's a real behavior change from what was
  originally planned, not an oversight.
- **No policy ever auto-selects a combat-outcome encounter option.** This is a
  deliberate, permanent design rule, not a limitation to lift later:
  `evaluateEncounterDefaultChoice` filters out any option whose outcome contains a
  `{ kind: "combat" }` effect *before* scoring runs, regardless of stance — even
  `"aggressive"`. If every option on a pending encounter leads to combat, the policy
  leaves it untouched and only logs a diagnostic asking the player to resolve it
  manually. The project's standing rule is that emergency combat is never triggered
  automatically; a future PR should not "improve" this by letting `"aggressive"` pick a
  combat option.
- **`auto-treatment`'s insufficient-credits diagnostic throttle key doesn't include the
  crew member id.** The throttle key is `"auto-treatment:insufficient-credits"`, not
  `"auto-treatment:insufficient-credits:<memberId>"`. In practice this is harmless: the
  engine only ever proposes *one* treatment candidate per tick (the most severely
  injured qualifying member), so at most one crew member's name can appear in that
  warning on any given tick regardless of how many are actually waiting — the message
  just won't necessarily always name the same person across consecutive throttled
  windows if the most-severe candidate changes. Investigated during 19-F and intentionally
  left alone (see "19-F stabilization").
- **`fuel-reserve`'s and `auto-hull-repair`'s threshold sliders in `PolicyModal` clamp to
  `[0, 100]`**, matching the resource percentages they compare against; there's no
  runtime validation elsewhere (`policyEngine.js` trusts whatever `params.hullThreshold`
  /`params.reserveThreshold` it's handed), so a hand-edited save file with an
  out-of-range value would still be accepted by the engine (e.g. a threshold of `150`
  would just mean "always trigger"). Not treated as a bug — same trust level every other
  numeric param in this codebase has (see e.g. `crewStore`'s persisted fields).

## 19-F stabilization

This sub-PR did not change any policy logic or default parameter values — no thresholds,
costs, weights, or stances moved. Its scope was: a combined-pressure integration test,
this document's final pass, and a test-hygiene fix uncovered while writing that test.

- **New test:** `src/systems/__tests__/gameClock.integration.test.js`'s
  `"gameClock.processTimedJobs — all four policies enabled simultaneously under combined
  pressure (Phase 19-F)"` block. All four policies enabled at once, with hull, an injured
  crew member, fuel, and a pending encounter all pressuring the ship simultaneously (hull
  below threshold with no scrap on hand, an injured crew member with insufficient
  credits, fuel below the reserve threshold, and a forced pending encounter) — driven
  across 90 ticks (25 blocked, then a mid-scenario credit/scrap top-up, then 65 more to
  let both freshly-unblocked jobs run to completion). 19-A through 19-E each only ever
  tested one policy at a time; this is the first test to exercise all four together.
  Verifies: no exception across all 90 ticks; credits and `salvage-scrap` never go
  negative; the diagnostic-log throttle (introduced in 19-B) still holds up with three
  simultaneous diagnostic sources instead of one; and both blocked policies (repair,
  treatment) resume and actually complete their jobs on the very tick after resources are
  replenished.
- **Test-hygiene bug found and fixed (not a policy-logic bug):** the 19-D test block's
  `resetNavAndPolicy()` helper reset `encounter-default-choice`'s `enabled` flag back to
  `false` after each test but never reset its `params.stance` — one of that block's own
  tests sets `stance` to `"safe"`, and because `policyStore` is a real module-level
  singleton with no automatic reset between tests in this project's Vitest setup (see
  `tests/setup.js`), that `"safe"` value silently leaked into every test appended after
  it in the same file. The new 19-F test observed this directly: with a two-option
  encounter designed so `"balanced"` (the catalog default) and `"safe"` pick different
  options, it saw `"safe"`'s choice instead. Fixed by having both `resetNavAndPolicy()`
  (19-D) and the new block's own `resetAllPolicyState()` call `policyStore.resetPolicy(...)`
  instead of just `setPolicyEnabled(id, false)` — `resetPolicy` restores both `enabled`
  and `params` to the catalog default in one call. No production code changed; this was
  purely a test-isolation gap in test code from 19-D. See the inline comment on
  `resetNavAndPolicy` in the test file for the full explanation.
- **Investigated, not changed:** the `auto-treatment` throttle-key granularity noted
  under "Known limitations" above, and a `focus-visible` styling report against the
  settings UI — both out of scope for this PR (the former is not an actual bug, per the
  analysis above; the latter is a general UI-polish item unrelated to the policy system
  specifically).
- A real cross-system interaction was discovered while designing the 19-F test (not a
  bug, but worth recording): `stores/crewStore.js`'s crew AI can informally assign an
  idle medic to an injured crew member (the `treatedBy` mechanic inside
  `tickMemberInjury`) completely independently of `jobStore`/credits/the
  `auto-treatment` policy. This means an injured crew member can improve by a stage (or
  even fully heal, for the `"minor"` state) purely from ambient crew AI behavior, with
  `auto-treatment` disabled or credit-starved the whole time. This predates Phase 19 and
  is out of scope to change here, but it means "policy is blocked" and "crew member's
  condition never improves" are *not* the same guarantee — only "no `jobStore` job gets
  enqueued, and no credits get spent" is what the policy itself controls.

## Verification (19-A)

- `npm test` — all pre-existing tests plus new coverage for `policyStore` (defaults,
  `setPolicyEnabled`/`setPolicyParam`, persist-merge catalog-drift compatibility),
  `policyEngine` (OFF → empty result; ON + threshold crossed → diagnostic log/action;
  ON + threshold not crossed → empty result), and `gameClock` (the pre-existing 30-tick
  integration test still passes unchanged, plus a new case that drives 30 ticks with
  every policy at its default OFF state and asserts zero policy-originated log lines
  and no policyStore state change).
- `npm run build` — passes; `dist/` removed after verifying.
- No UI changes in this PR (settings panel is 19-E), so no new user-facing surface to
  smoke-test beyond confirming the app still boots with `policyStore` in the store
  graph.

## Verification (19-F)

- `npm test` — 310/310 passing (309 pre-existing + the new combined-pressure
  integration test), including every 19-A through 19-D "policy disabled by default →
  gameplay unchanged" characterization test, unchanged.
- `npm run build` — passes; `dist/` removed after verifying.
- No production code changed (see "19-F stabilization" above) — only test code
  (`gameClock.integration.test.js`) and this document.

## Follow-up work (across all of 19-A–F)

Nothing here blocks this PR; recorded so a future PR doesn't have to rediscover it.

- **`fuel-reserve` auto-refuel** is unimplemented — needs a station market/price model
  that doesn't exist in the codebase yet (see "Known limitations").
- **`encounter-default-choice`'s "resolve after a timeout" idea** was dropped in favor of
  "resolve immediately" because `navStore.pendingEncounter` has no expiry concept. If a
  future PR wants the original timeout behavior, it needs an expiry field on
  `pendingEncounter` plus a visible countdown in the encounter UI first.
- **`auto-treatment`'s diagnostic throttle key doesn't include the crew member id** —
  harmless today (see "Known limitations"), but if a future PR changes the engine to
  propose more than one treatment candidate per tick, the throttle key should gain
  `:<memberId>` at that point.
- **`focus-visible` styling on `PolicyModal`'s controls** was flagged in an earlier
  sub-PR's notes as a possible accessibility polish item; still untouched, and still out
  of scope for the policy system itself (it's a general HUD/component-library styling
  question, not specific to policies).
- **No policy currently reasons about `rooms`** — `policyEngine.evaluatePolicies`
  accepts a `rooms` snapshot (`shipInteriorStore.rooms`) but every existing rule ignores
  it (`void rooms` in the function body). It was threaded through in 19-A in case a
  future policy needed room-level state (e.g. an "auto-assign crew to an idle
  understaffed room" policy) without having to change the `evaluatePolicies` call
  signature again.
- **No test exercises policy interaction with the legacy-queue migration path**
  (`migrateLegacyJobsOnce`) — every policy test in this file runs against a fresh unified
  `jobStore`. Not believed to be a real risk (the migration only ever runs once, early,
  and policies only read `jobStore.getActiveJobs()`), but it's an untested combination.
