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

| id | label | category | default enabled | params (default) |
| --- | --- | --- | --- | --- |
| `auto-hull-repair` | 자동 선체 수리 | maintenance | off | `hullThreshold: 40` |
| `auto-treatment` | 부상자 자동 치료 | crew | off | `minSeverity: "minor"` (injurySystem.js state id — 경상) |
| `fuel-reserve` | 연료 예비율 경고 | logistics | off | `reserveThreshold: 30` |
| `encounter-default-choice` | 항해 조우 기본 대응 | navigation | off | `stance: "balanced"` (safe / balanced / aggressive) |

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

- **A** — `data/policies.js` catalog, `stores/policyStore.js`, `systems/policyEngine.js`
  skeleton (with one working diagnostic rule for `auto-hull-repair`), `gameClock.js`
  wiring (log-only), this document. All policies default OFF; no gameplay behavior
  changes.
- **B** — *planned.* `auto-hull-repair` and `fuel-reserve` become real: gameClock
  applies the engine's `actions` by calling `jobStore.enqueueShipWork` /
  resupply logic instead of only logging.
- **C** — *planned.* `auto-treatment` becomes real: gameClock enqueues
  `jobStore.enqueueTreatment` for crew at or above `params.minSeverity`.
- **D** — *planned.* `encounter-default-choice` becomes real: navigation encounters
  auto-resolve using `params.stance` when the policy is enabled and the player hasn't
  responded.
- **E** — *planned.* Settings UI panel for toggling policies and editing params.
- **F** — *planned.* Stabilization pass and this document's final review.

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
