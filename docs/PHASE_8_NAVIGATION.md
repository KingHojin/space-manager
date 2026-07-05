# Phase 8 — Navigation & Exploration

Implemented node-based navigation on top of Phase 5/6/7.

## Added

- `src/stores/navStore.js`
  - Deterministic sector generation state.
  - Current node, discovered/visited nodes, selected node, planned route.
  - Travel state with progress, ETA, fuel consumption, drift state.
  - Pending encounter state.
  - Recruit candidate holding queue for Phase 10.

- `src/systems/navigationSystem.js`
  - Deterministic `generateSector(seed)`.
  - Connectivity validation.
  - Dijkstra-style route calculation.
  - Route distance calculation.
  - Encounter rolling by node type.
  - Legacy zone conversion helper for R3F `StarMap` reuse.

- `src/data/navEncounters.js`
  - Node type labels/icons.
  - Encounter table separated from logic.
  - Outcomes return effect descriptors instead of mutating other stores directly.

## Integrated

- `gameClock`
  - Runs `navStore.tickTravel()` during timed ticks.
  - Applies returned navigation effects from the clock layer:
    - `resource`
    - `fuel`
    - `spawnCrisis`
    - `injure`
    - `recruitOffer`
    - `combat` fallback
    - `log`
  - Keeps room/crew/crisis ticks running during travel.

- `Exploration.jsx`
  - Replaced legacy scan-first exploration screen with node navigation loop.
  - Reuses existing R3F `StarMap`.
  - Supports node selection, route approval, travel progress, arrival encounters, drift recovery.

- `Overview.jsx`
  - Shows navigation status in command center.
  - Adds direct navigation decision card and encounter choices.
  - Uses navStore travel/pendingEncounter as command-priority inputs.

## Deferred

- `recruitOffer` is stored as candidate IDs until Phase 10.
- `combat` outcome creates a text/placeholder combat encounter until Phase 11.
- No combat visualization is implemented in Phase 8.

## Local check

```bash
npm run build
npm run dev
```

Focus checks:

- Select an adjacent node and start travel.
- Confirm time advances and travel progresses.
- Confirm rooms/crew/crises still tick during travel.
- Confirm arrival creates a pending encounter.
- Resolve encounter and verify resource/crisis/injury/recruit/combat fallback effects.
- Deplete nav fuel and confirm drift state does not crash.
