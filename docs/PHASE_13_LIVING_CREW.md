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
- low-frequency idle actions
- rAF pause/culling refinements
- bark bubbles and trigger data

### Layer B — Inner Life

Gameplay-affecting state. Not implemented in PR A, PR B, PR C, or PR D.

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

## PR C implemented

### Files

- `src/stores/crewMotionStore.js`
- `src/components/ship/ShipInterior.jsx`
- `src/crewMotion.css`

### Behavior

- Idle crew now roll low-frequency visible-only idle actions:
  - `stand`
  - `look`
  - `stretch`
  - `coffee`
  - `chat`
- Idle rolls happen on a multi-second timer, not every frame.
- `chat` only appears when another idle crew member is in the same room.
- Room-specific idle pools keep coffee mostly in living spaces.
- ShipInterior rAF loop now pauses when:
  - game is paused
  - browser tab is hidden
  - ShipInterior is outside the viewport via `IntersectionObserver`
- Idle labels/glyphs are reflected in marker badges and crew list chips.
- CSS-only idle micro animations were added.
- No gameplay values or crew AI decisions are changed.

## PR D implemented

### Files

- `src/data/barks.js`
- `src/stores/crewMotionStore.js`
- `src/components/ship/ShipInterior.jsx`
- `src/crewMotion.css`
- `docs/PHASE_13_LIVING_CREW.md`

### Behavior

- Added trigger-based bark data:
  - `onIdle`
  - `onChat`
  - `onWork`
  - `onRest`
  - `onTreat`
  - `onCrisis`
  - `onDown`
  - `onLowFuel`
  - `onDrift`
- Bark data is presentation-only and can carry optional future fields such as `archetype`, but no personality/archetype logic is implemented.
- `crewMotionStore` now tracks:
  - `bark: { text, until, trigger } | null`
  - per-crew bark cooldown
  - low-frequency bark roll timing
  - a small global visible-bark cap through active motion state inspection
- Bark timers use `performance.now()`.
- Idle actions can trigger `onIdle` or `onChat` barks at low frequency.
- State entry can lightly trigger `onWork`, `onRest`, `onTreat`, `onCrisis`, `onDown`, `onLowFuel`, or `onDrift` barks.
- Existing rAF pause/culling still controls bark roll/expiry work because bark updates live inside `crewMotionStore.tick`.
- `ShipInterior` renders small non-interactive speech bubbles above crew markers.
- Compact mode omits bark bubbles to reduce clutter.
- Bark bubbles use absolute positioning and do not intercept crew marker clicks.
- CSS includes a small pop animation and `prefers-reduced-motion` fallback.
- No job speed, crisis resolution, injury, resource, save, or crew AI decision values are changed.

## Layer A completed state

Layer A now covers the visible-life package:

- smooth movement
- facing
- visible work/rest/treat/panic/down states
- idle micro-actions
- viewport/tab/pause culling
- trigger-based bark bubbles

## What PR A/B/C/D intentionally do not do

- No personality, mood, or social relations.
- No job speed modifiers.
- No panic/problem behavior.
- No save migration.
- No persisted crew motion/bark state.

## Local check

Connector cannot run local commands. Verify locally:

```bash
npm install
npm run build
npm run dev
```

Manual checks:

1. Open Crew or Ship panel that renders `ShipInterior`.
2. Start time.
3. Wait for crew AI to assign different room activities.
4. Confirm crew markers move smoothly instead of teleporting.
5. Confirm walk/work/rest/treat/panic/down have distinct visual expressions.
6. Confirm idle crew occasionally show look/stretch/coffee/chat without log spam.
7. Confirm idle or chat barks appear occasionally, not constantly.
8. Trigger or wait for crisis response and confirm short crisis barks can appear.
9. Confirm treatment/rest/down barks are rare and not visually noisy.
10. Confirm no more than a small number of bark bubbles appear at once.
11. Confirm compact mode does not clutter the map with bark bubbles.
12. Scroll ShipInterior out of view and confirm rAF work stops via visible culling.
13. Switch browser tab away and confirm rAF work stops.
14. Pause the game and confirm motion and bark roll/expiry work stops.
15. Resume and confirm motion and bark display continue.
16. Confirm no gameplay values change from motion/visuals alone.

## Next PRs

- PR E onward: Layer B personality/mood/social, only after explicitly opening gameplay-affecting design work.
