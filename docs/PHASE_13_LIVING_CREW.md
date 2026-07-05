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
- animation-state placeholders and visual states
- future idle and bark hooks

### Layer B — Inner Life

Gameplay-affecting state. Not implemented in PR A or PR B.

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

## PR B implemented

### Files

- `src/stores/crewMotionStore.js`
- `src/components/ship/ShipInterior.jsx`
- `src/crewMotion.css`
- `src/main.jsx`

### Behavior

- `animState` now selects clearer visible states:
  - `walk`
  - `work`
  - `rest`
  - `treat`
  - `panic`
  - `down`
  - `idle`
- Serious-or-worse injuries render as `down` unless the target activity is medical/treatment.
- Emergency/crisis-response activity renders as `panic` visually.
- Marker body has state-specific CSS animation only.
- Facing is applied to the marker avatar, not the whole marker body, so state badges remain readable.
- Status badges show a concise state glyph.
- Crew list chips show the visible anim-state label.
- `prefers-reduced-motion` disables crew marker animations.

## What PR A/B intentionally do not do

- No idle action rolling yet.
- No bark speech bubbles yet.
- No personality, mood, or social relations yet.
- No job speed modifiers.
- No panic/problem behavior.
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
5. Confirm walk/work/rest/treat/panic/down have distinct visual expressions.
6. Pause the game and confirm motion stops.
7. Resume and confirm motion continues.
8. Trigger a crisis and confirm responders show emergency/panic style.
9. Injure a crew member and confirm serious-or-worse visual down/treat state appears.
10. Confirm no gameplay values change from motion/visuals alone.

## Next PRs

- PR C: idle action rolling and performance/culling refinements.
- PR D: bark bubbles and trigger data.
- PR E onward: Layer B personality/mood/social.
