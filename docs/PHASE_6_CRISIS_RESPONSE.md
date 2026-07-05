# Phase 6 — Crisis Response

This phase adds acute room-level crises on top of Phase 5 Room Job Slots.

## Implemented

- `src/systems/crisisSystem.js`
  - Crisis catalog: `overheat`, `fire`, `power_loss`, `hull_breach`, `intruder`.
  - Room adjacency derived from `ROUTES` in `shipRooms`.
  - Crew scoring helpers for crisis response.
  - Internal spawn rules for Phase 6-active crisis types.

- `src/stores/shipInteriorStore.js`
  - Adds `activeCrises` beside `rooms`.
  - Adds `spawnCrisis`, `tickCrises`, `assignCrisisResponder`, `progressCrisis`, `resolveCrisis`, `getActiveCrises`.
  - Keeps cross-store effects as returned `effects`, so this store still does not import `crewStore` or `gameStore`.

- `src/systems/gameClock.js`
  - Runs `tickRooms` first, then `tickCrises`.
  - Applies returned crisis effects in the orchestrator.

- `src/systems/crewAI.js`
  - Adds `crisis-response` activity.
  - Crisis response is above normal room jobs and queued work, while injured or over-fatigued crew are excluded.

- UI
  - `ShipInterior` highlights crisis rooms with badges, icons, and response progress.
  - `Overview` and `commandCenter` surface active crises as urgent command cards.

## Phase 6-active triggers

- `overheat`: primarily from high engineering load.
- `power_loss`: from very high room load.
- `fire`: from degraded/high-load room state or overheat escalation.

`hull_breach` and `intruder` are defined and can be spawned manually, but their external triggers are intentionally left for Phase 8/11.

## Data flow

```txt
gameClock
  -> crewStore.runCrewAI(snapshot with rooms + activeCrises)
  -> shipInteriorStore.tickRooms(roomActivities)
  -> shipInteriorStore.tickCrises(crisisActivities, crew snapshot)
  <- effects/logs
  -> gameClock applies effects to crewStore/gameStore
```

This preserves the existing no-circular-import rule.

## Notes

- One active crisis per room is enforced through `room.activeCrisisId`.
- A crisis clears normal room jobs until resolved.
- Unanswered crises escalate and can spread through room adjacency where supported.
- Combat visualization remains deferred to Phase 11.
