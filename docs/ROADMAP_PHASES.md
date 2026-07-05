# Space Manager phased roadmap

## Phase 1 — FM Command Center
Status: base implementation complete

Goal: make the home screen feel like a captain's live situation room, not a static dashboard.

Implemented:
- Ship status summary
- Travel progress block
- Priority situation queue
- Captain approval cards
- Crew autonomous activity preview
- Frontier signal hooks
- Resource, mission, report, and task queue summaries
- Prioritized captain approval deck

Next refinements:
- Convert frontier signals into real generated objectives
- Add filters for critical / high / normal cards
- Add report history by category

## Phase 2 — Priority System
Status: base implementation complete

Goal: every ship task receives a priority and can be sorted by emergency, high, normal, or low.

Implemented:
- Shared task priority helper
- Crew training priority
- Crew treatment priority
- Ship job priority in the store
- Priority-based task queue sorting
- Priority cycling from the task queue
- Priority change logs

Next refinements:
- Show priority badges inside every ship module card
- Let the player set priority before job creation

## Phase 3 — Crew AI
Status: base implementation complete

Goal: crew members should act even when the player does not manually command them.

Implemented:
- Timed crew AI tick from the game clock
- Role-based task selection
- Crisis response assignments for combat and travel events
- Queue-aware treatment/training activity state
- Fatigue-aware rest behavior
- Ship resource warning assignments
- Crew activity state stored in crewStore
- Home command center reads live AI activity
- Crew panel shows live AI orders and recent AI assignment logs

Next refinements:
- Let AI consume unassigned ship jobs directly
- Add policy overrides in Phase 5

## Phase 4 — Ship Interior
Status: base implementation complete

Goal: represent the ship as a small operating space with rooms and crew locations.

Implemented:
- 2D top-down ship interior view
- Bridge, operations room, medbay, living quarters, engine room, and cargo room
- Animated crew markers that move between rooms when AI activity changes
- Room highlighting when crew members are active inside
- Priority-colored crew markers
- Crew panel integration

Next refinements:
- Add actual room-based job slots
- Add travel paths and corridor routing
- Add room damage / fire / maintenance overlays
- Add compact command-center version

## Phase 5 — Policy System
Goal: the player commands by policy, not by clicking every small action.

Examples:
- Auto repair below hull threshold
- Auto treatment for injuries
- Fuel reserve policy
- SOS response policy
- Pirate response policy

## Phase 6 — Report System
Goal: events are delivered as captain reports with actions, not plain logs.

Examples:
- Research complete
- New signal found
- Engine efficiency drop
- Crew conflict
- Expedition result

## Phase 7 — Menu Rework
Status: initial overlay flow implemented

Goal: keep bottom navigation minimal and move secondary systems into overlays.

Implemented:
- Command menu opens as modal overlay
- Utility menus open as modals
- Major systems still open as focused panels
