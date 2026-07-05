# Phase 3 — Crew AI

This phase gives crew members persistent AI activity state.

## Goal

Crew members should not feel like static cards. They should appear to be working, resting, preparing, and responding to threats while time passes.

## Implemented

### Crew AI system

`src/systems/crewAI.js` adds:

- `CREW_AI_INTERVAL`
- role default assignments
- idle behavior selection
- assigned queue detection
- crisis response behavior
- resource warning behavior
- fatigue-aware forced rest
- crew AI summary helper

### Crew store integration

`src/stores/crewStore.js` now stores:

- `crewActivities`
- `crewActivityLog`
- `lastCrewAiAt`

It also exposes:

- `runCrewAI(snapshot)`

### Game clock integration

`src/systems/gameClock.js` now runs crew AI as part of timed jobs.

Crew AI receives the current snapshot:

- current minute
- resources
- active travel
- pending travel event
- pending combat encounter
- ship installation queue

### UI integration

`src/components/panels/Overview.jsx` now shows live crew AI activity in the command center.

`src/components/panels/Crew.jsx` now shows:

- current AI order per crew member
- station
- action
- detail
- priority
- recent AI assignment logs

## Current behavior examples

- Combat pending: gunners track targets, bridge assists command, engineers redistribute power, medbay prepares triage.
- Travel event pending: bridge analyzes choices, engineers prepare emergency repair, gunners monitor threats.
- Low hull: engineers inspect structural damage.
- Low oxygen: medical crew checks oxygen symptoms.
- Active travel: bridge handles navigation, engineers stabilize propulsion, gunners monitor route.
- Assigned training/treatment queue: crew AI reflects that job.
- High fatigue: crew is assigned forced rest.

## Design intent

The player should feel like they are commanding an organization, not moving each unit manually.

The player sets priorities and queues; crew AI interprets the current ship state and displays what each crew member is doing.

## Next phase dependency

Phase 4 should add ship interior rooms so these AI assignments can become visible room/location movement rather than text-only activity.
