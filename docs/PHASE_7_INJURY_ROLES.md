# Phase 7 — Injury & Roles

This phase turns crew injury from a flat string into a staged simulation object and makes role gaps matter to ship operation.

## Implemented

- `src/systems/injurySystem.js`
  - Injury object normalization and migration helpers.
  - States: `healthy`, `minor`, `serious`, `critical`, `incapacitated`.
  - Labels: 정상, 경상, 중상, 위독, 전투불능.
  - Work gates and speed multipliers.
  - Recovery/worsening helpers.
  - Permanent traits: `chronic_fatigue`, `trauma`, `scarred`.
  - `getRoleCoverage()` selector for role gaps.

- `src/stores/crewStore.js`
  - Migrates old string injury values into `{ state, recoveryProgress, treatedBy, permanentTraits, untreatedMinutes }`.
  - Adds `tickCrewHealth()` for recovery, worsening, and medical treatment progress.
  - Keeps old combat/casualty entry points but translates them into the new injury object.
  - Adds `getRoleCoverage()` and `getTreatmentTarget()` selectors.

- `src/systems/crewAI.js`
  - Injured crew are gated by state.
  - `minor` can still work with reduced efficiency.
  - `serious+` are pulled from all normal work slots.
  - Healthy medics can perform `medical-care` on the most severe injured target.

- `src/systems/gameClock.js`
  - Runs crew health ticks after room/crisis processing.
  - Passes role coverage into room/crisis ticks.

- `src/systems/roomJobs.js`
  - Applies injury work-speed multiplier.
  - Applies role gap penalties to room decay/load.

- `src/systems/crisisSystem.js`
  - Uses new injury gates for crisis response.
  - Minor injuries reduce response speed.
  - Trauma can occasionally block crisis response.

- UI
  - `Crew.jsx`: injury stage badges, recovery progress, untreated time, permanent trait badges, role gap summary.
  - `Overview`/`commandCenter`: injury and role gap command cards.
  - `TaskQueuePanel`: safe injury label rendering for object-based injury.

## Notes

- Phase 7 keeps the no circular import rule: `gameClock` remains the orchestrator for cross-store effects.
- `hull_breach`/`intruder` external triggers are still deferred to Phase 8/11, but resulting injuries now flow into the staged model.
- Combat animation remains deferred to Phase 11.
