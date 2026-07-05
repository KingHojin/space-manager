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
- Use priority as the first input for crew AI in Phase 3

## Phase 3 — Crew AI
Goal: crew members should act even when the player does not manually command them.

Target systems:
- Idle behavior
- Work search
- Role-based task selection
- Fatigue and morale-aware behavior
- Activity report cards

## Phase 4 — Ship Interior
Goal: represent the ship as a small operating space with rooms and crew locations.

Target systems:
- Bridge
- Engine room
- Medbay
- Living quarters
- Lab
- Cargo bay

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
