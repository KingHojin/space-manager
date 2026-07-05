# Space Manager — Next Chat Handoff

Copy this document into a new ChatGPT conversation to continue cleanly.

## Repository

- GitHub repository: `KingHojin/space-manager`
- Default branch: `master`
- Current stable baseline after this handoff: PRs through Phase 4 stabilization
- Project type: Vite + React + Zustand + Tailwind-style utility classes + React Three Fiber for space map

## Product direction

Build a mobile-first space exploration / ship management game with the feeling of:

- Football Manager situation center
- RimWorld-style living crew and ship interior
- FTL-style ship crisis management
- XCOM-style injury / role tension

The player should not press isolated buttons forever. The player should feel like a captain managing a living ship.

## Completed phases

### Phase 1 — FM Command Center

Implemented:

- Home screen redesigned as captain situation center
- Priority situation cards
- Captain approval queue
- Resource, travel, crew, task, mission, and report summary
- Frontier signal hooks

Important files:

- `src/components/panels/Overview.jsx`
- `src/systems/commandCenter.js`
- `docs/PHASE_1_COMMAND_CENTER.md`

### Phase 2 — Priority System

Implemented:

- Shared priority helper
- Priority levels: emergency / high / normal / low
- Crew training and treatment priorities
- Ship work queue priority field
- Task queue sorting by priority then completion time
- Priority cycling from task queue

Important files:

- `src/systems/priorities.js`
- `src/components/common/TaskQueuePanel.jsx`
- `src/stores/crewStore.js`
- `src/stores/shipStore.js`
- `docs/PHASE_2_PRIORITY_SYSTEM.md`

### Phase 3 — Crew AI

Implemented:

- Timed crew AI tick from `gameClock`
- Role-based work assignment
- Queue-aware training/treatment status
- Fatigue-aware rest behavior
- Resource-warning assignments
- Crew activity state stored in crewStore
- Crew activity shown in Overview and Crew panel

Important files:

- `src/systems/crewAI.js`
- `src/stores/crewStore.js`
- `src/systems/gameClock.js`
- `src/components/panels/Crew.jsx`
- `docs/PHASE_3_CREW_AI.md`

### Phase 4 — Ship Interior / RimWorld-like crew movement

Implemented:

- 2D top-down ship interior
- Rooms: bridge, operations room, medbay, living quarters, engine room, cargo room
- Crew markers move according to live crew AI activity
- Priority-colored crew markers
- Active room highlighting
- Corridor / route rail visualization
- Room state badges
- Full ship interior in Crew panel
- Compact ship interior mini-map in Overview

Important files:

- `src/components/ship/ShipInterior.jsx`
- `src/components/panels/Crew.jsx`
- `src/components/panels/Overview.jsx`
- `docs/PHASE_4_SHIP_INTERIOR.md`

## Current stable implementation details

### `ShipInterior.jsx`

The component maps crew activity text to room IDs.

Examples:

- bridge / navigation text -> bridge
- turret / sensor / watch text -> operations room
- medical / treatment / oxygen / fatigue text -> medbay
- engine / fuel / repair / hull text -> engine room
- cargo / supply / equipment text -> cargo room
- rest / meal / conversation / training text -> living quarters

It renders:

- ship hull background
- room blocks
- route rails
- active room ring
- room status badge
- moving crew marker
- optional detailed crew list when not compact

### `Overview.jsx`

Home command center now includes compact `ShipInterior` before the crew AI list.

### `Crew.jsx`

Crew panel includes full-size `ShipInterior` above the squad table.

## Known limitations

No confirmed local build was run inside ChatGPT. The repo was edited through the GitHub connector only.

Likely okay but should be verified locally with:

```bash
npm install
npm run dev
npm run build
```

Known next refinements:

1. Add actual room job slots, not only visual room mapping.
2. Add corridor path animation instead of direct CSS interpolation.
3. Add room condition model in a store, e.g. engine room condition, medbay load, cargo load.
4. Let Crew AI claim room jobs directly.
5. Add policy system so the player sets rules instead of manual decisions.

## Next recommended work

### Immediate stabilization check

Run locally:

```bash
npm run build
```

If it fails, inspect:

- `src/components/ship/ShipInterior.jsx`
- `src/components/panels/Overview.jsx`
- `src/components/panels/Crew.jsx`

### Next feature: Room Job Slots

Goal:

Turn the visual ship interior into a functional simulation layer.

Suggested implementation:

1. Create `src/stores/shipInteriorStore.js`
2. Store room states:
   - room id
   - condition 0–100
   - load 0–100
   - assigned job id
   - status label
3. Add room jobs:
   - engine tuning
   - medbay treatment support
   - cargo sorting
   - bridge route analysis
   - living quarters rest cycle
4. Crew AI should select available room jobs based on:
   - priority
   - role fit
   - fatigue
   - injury
   - current travel/combat/event state
5. `ShipInterior.jsx` should display:
   - room progress ring/bar
   - room status badge
   - job owner marker

## Coding rules

- Keep mobile-first layout.
- Avoid giant tables on mobile.
- Keep bottom navigation minimal.
- Use overlays for secondary systems.
- Do not implement real combat animation yet unless explicitly requested.
- Preserve current systems: travel events, priority queue, crew AI, ship interior.
- Make small safe PRs and merge after each stable step.

## Suggested next prompt

Continue from `KingHojin/space-manager` master. First verify the latest code around `ShipInterior.jsx`, `Overview.jsx`, `Crew.jsx`, `crewAI.js`, `crewStore.js`, and `gameClock.js`. Then implement Phase 4 next refinement: room job slots and room condition state. Keep the game mobile-first and RimWorld-like. Create a branch, make a PR, and merge only after checking the diff.
