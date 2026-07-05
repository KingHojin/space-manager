# Phase 13 — Living Crew

Goal: upgrade crew from room-jumping markers into visible, living ship inhabitants.

## Architecture rule

Phase 13 is split into two separate layers.

### Layer A — Visible Life

Pure presentation. No gameplay numbers are changed.

Implemented first:

- motion state
- smooth room-to-room movement
- facing
- animation-state placeholders
- future idle and bark hooks

### Layer B — Inner Life

Gameplay-affecting state. Not implemented in PR A.

Planned later:

- personality
- mood modifiers
- social relations
- mood-based work effects
- panic/problem behavior with cooldowns

## PR A implemented

### Files

- `src/data/shipInteriorLayout.js`
- `src/stores/crewMotionStore.js`
- `src/components/ship/ShipInterior.jsx`

### Behavior

- Existing room assignment logic is reused.
- Crew target room is derived from current crew AI activity.
- Room seat anchors are calculated separately from the visual component.
- `crewMotionStore` is non-persisted and presentation-only.
- A single `requestAnimationFrame` loop ticks all crew motion.
- The rAF loop stops when `gameStore.isPaused` is true.
- Motion uses room graph routes from `ROUTES` as waypoint paths.
- Fallback path is direct if route data is missing.
- Markers are positioned with CSS transform against measured ship-map dimensions.
- No Phase 5/6/7 gameplay formulas are changed.

## What PR A intentionally does not do

- No idle action rolling yet.
- No bark speech bubbles yet.
- No personality, mood, or social relations yet.
- No job speed modifiers.
- No panic or problem behavior.
- No save migration.

## Local check

Connector cannot run local commands. Verify locally:

```bash
npm run build
npm run dev
```

Manual checks:

1. Open Crew or Ship panel that renders `ShipInterior`.
2. Start time.
3. Wait for crew AI to assign different room activities.
4. Confirm crew markers move smoothly instead of teleporting.
5. Pause the game and confirm motion stops.
6. Resume and confirm motion continues.
7. Trigger a crisis and confirm responders move along room routes.
8. Confirm no gameplay values change from motion alone.

## Next PRs

- PR B: animState visual expression for walk/work/rest/treat/panic/down.
- PR C: idle action rolling and performance/culling refinements.
- PR D: bark bubbles and trigger data.
- PR E onward: Layer B personality/mood/social.
