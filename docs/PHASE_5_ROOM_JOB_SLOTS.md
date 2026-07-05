# Phase 5 — Room Job Slots

This phase turns the visual ship interior into a functional simulation layer, per the
"Next feature: Room Job Slots" section of `docs/NEXT_CHAT_HANDOFF.md`.

Note on numbering: `docs/ROADMAP_PHASES.md` reserves "Phase 5" for the policy system.
This document uses "Phase 5" to mean "the 5th major feature phase" (Room Job Slots),
matching the informal numbering used when this work was requested. The room-jobs work
is really the deferred "next refinement" of Phase 4 (Ship Interior).

## Goal

Rooms are no longer just a visual guess derived from crew activity text. Each room has
real state — condition, workload, an assigned job, and progress — and idle crew AI
claims room jobs based on priority, role fit, fatigue, and current ship state.

## Architecture

- `src/data/shipRooms.js` — single source of room constants (id/label/icon/layout/tone
  and the corridor route list). Previously these lived inline in `ShipInterior.jsx`;
  they are unchanged in value, only relocated so both the UI and the new store can
  import the same list without a circular dependency.
- `src/systems/roomJobs.js` — pure functions only, no store imports:
  - `ROOM_JOB_CATALOG` — one job per room (route analysis, threat scan, preventive
    care, engine tuning, cargo sorting, living-quarters upkeep).
  - `createInitialRoomState()` / `deriveRoomStatus(room)`.
  - `scoreJobForMember(member, room, job, context)` — role fit, room urgency
    (condition/load), member fatigue, sticky-assignment bonus, travel-state bonus.
  - `pickRoomJobsForIdleCrew({ idleMembers, rooms, currentMinute, context })` — greedy
    per-tick assignment that keeps one active job slot per room.
  - `applyRoomTick({ rooms, roomActivities, deltaMinutes, currentMinute })` — advances
    progress for rooms with a claimed job, decays condition / grows load for rooms
    with no one assigned, and returns `{ nextRooms, completedJobs, logs }`.
- `src/stores/shipInteriorStore.js` — holds `rooms` state only. `tickRooms(...)` calls
  `applyRoomTick` and applies the result to its own state, then **returns**
  `{ completedJobs, logs }` instead of mutating any other store. This store never
  imports `crewStore` or `gameStore`.
- `src/systems/gameClock.js` — the only place that coordinates stores together (as it
  already did for crew AI and travel). `processRoomJobs` reads room-job claims out of
  `crewStore`'s `crewActivities`, calls `shipInteriorStore.tickRooms`, and applies the
  returned job-completion effects (crew fatigue, hull) to `crewStore` / `gameStore`.
- `src/systems/crewAI.js` — `generateCrewActivities` now takes `snapshot.rooms` and,
  for crew members who would otherwise fall through to the generic idle action, tries
  `pickRoomJobsForIdleCrew` first. All existing precedence is preserved: queue tasks
  (training/treatment), injury, forced rest at high fatigue, and crisis assignments
  during combat/travel events still take priority over room-job claiming.

## Data flow (why there is no circular import)

```
gameClock (orchestrator, imports every store + every system)
  -> crewStore.runCrewAI(snapshot with rooms)
       -> systems/crewAI.generateCrewActivities (pure, may return roomId/jobId)
  -> shipInteriorStore.tickRooms(roomActivities from crewActivities)
       -> systems/roomJobs.applyRoomTick (pure)
       <- { completedJobs, logs }
  -> gameClock applies completedJobs effects to crewStore/gameStore directly
```

`systems/*.js` never imports from `stores/*.js`. `stores/*.js` never imports another
store. Only `gameClock.js` reaches into multiple stores, exactly as it already did
before this phase.

## Room jobs

| Room | Job | Duration | On completion |
| --- | --- | --- | --- |
| bridge | 항로 정밀 분석 | 90 min | condition +20, load -20 |
| ops | 위협 스캔 | 60 min | condition +20, load -20 |
| medbay | 예방 진료 보조 | 75 min | condition +20, load -25, all alive crew fatigue -3 |
| engineering | 엔진 튜닝 | 100 min | condition +25, load -15, hull +2 |
| cargo | 화물 정리 | 70 min | condition +10, load -25 |
| living | 생활구역 정비 | 80 min | condition +10, load -20, all alive crew fatigue -2 |

Rooms left unattended passively decay: condition -0.5/hour, load +0.8/hour.

## Implemented (by sub-PR)

- **A** — constants relocation, `roomJobs.js`, `shipInteriorStore.js`, this document.
- **B** — `gameClock.js` ticks rooms every timed-job pass; `crewAI.js` lets idle crew
  claim room jobs.
- **C** — `ShipInterior.jsx` shows room progress, a status badge, and marks the crew
  member currently holding a room's job.
- **D** — the Overview command center's approval-queue cards (`commandCenter.js`)
  surface rooms in poor condition or overloaded as situation cards.
- **E** — stabilization pass and this document's final review.

Phase 5 is complete: all sub-PRs (A–E) are merged to `master`.

## Stabilization notes (PR E)

A Playwright soak test drove the game clock through 30 consecutive 15-minute ticks
(via `useGameStore.advanceMinutes` + `processTimedJobs`, with the built-in interval
paused for determinism) and confirmed, end to end:

- Idle crew whose role matches a room (함교→bridge, 포탑→ops, 의무실→medbay,
  기관실→engineering) reliably claim that room's job when free.
- `progress` advances every tick while a job is claimed, and each job reaches
  completion at its configured `durationMinutes` (confirmed via
  `함선: <job label> 완료 (<roomId>)` log lines for all four role-matched rooms).
- On completion, `condition`/`load` move by the job's configured amounts (rooms
  reached `condition: 100, load: 0` after repeated completions) and the room
  becomes claimable again — the same crew member re-claims it next tick via the
  sticky-assignment bonus in `scoreJobForMember`, so a room does not sit idle
  between jobs as long as its role-matched crew member stays free.
- `living` and `cargo` (no dedicated `ROLE_ROOM` owner) were not claimed during the
  soak run because every crew member in the default roster already had a
  higher-scoring, role-matched room to work in; this matches the scoring design
  (role-match bonus dominates) rather than being a bug — a larger or more varied
  crew roster will fill those rooms too.
- `npm run build` passes with no new warnings beyond the pre-existing large-chunk
  notice.
- No console errors or crashes were observed across the 30-tick run or in the
  Overview/ShipInterior UI before and after.

## Next refinements

- Let the player set per-room job priority instead of always taking the AI's pick.
- Room-based events (medbay overload, engine fault) feeding into Phase 6 reports.
- Multiple job slots per room for larger crews.
- Give unattended rooms without a role owner (living, cargo) a way to compete for
  idle crew even when role-matched rooms are also open, e.g. a small bonus for
  rooms that have gone longest without a job.
