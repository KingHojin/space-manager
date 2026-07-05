# Phase 2 — Priority System

This phase introduces shared task priorities so the ship can later make AI-driven work decisions.

## Priority levels

Tasks now use the shared priority model in `src/systems/priorities.js`:

1. emergency — 긴급
2. high — 높음
3. normal — 보통
4. low — 낮음

## Implemented

### Shared helper

`src/systems/priorities.js` provides:

- priority config
- normalization
- priority cycling
- task sorting
- inferred priority for treatment
- inferred priority for crew training
- inferred priority for module jobs

### Crew queues

`src/stores/crewStore.js` now stores priority on:

- trainingQueue
- treatmentQueue

It also supports:

- setTrainingPriority
- setTreatmentPriority

Persisted old queue items are normalized with default priority.

### Ship queue

`src/stores/shipStore.js` now stores priority on:

- installationQueue

It also supports:

- setInstallationPriority

Existing persisted queue items are normalized with default priority.

### Task Queue UI

`src/components/common/TaskQueuePanel.jsx` now:

- sorts jobs by priority first, then completion time
- displays each job's priority
- lets the player cycle priority from the task queue
- logs priority changes

### Crew UI

`src/components/panels/Crew.jsx` now:

- assigns inferred priority when training starts
- assigns injury-based priority when treatment starts
- shows priority inside active training/treatment progress cards

## Design intent

The player should not micromanage every task. They should set priorities. Later, Phase 3 crew AI will read these priorities to decide what crew members should do automatically.

## Deferred refinement

The ship module detail screen should display job priorities directly inside each module card. The underlying store and shared queue already support this; the visible module-card badge can be added as a small follow-up patch.
