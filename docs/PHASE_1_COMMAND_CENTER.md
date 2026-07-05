# Phase 1 — FM Command Center

This phase makes the home screen act as a live captain's situation room.

## Core loop

The command center should answer three questions immediately:

1. What is happening right now?
2. What needs the captain's decision first?
3. What is the next exploration hook?

## Implemented in this phase

### Prioritized situation cards

`src/systems/commandCenter.js` now builds situation cards from current game state:

- pending combat
- pending travel event
- low hull
- low oxygen
- low fuel
- injured crew
- tired crew
- active travel
- empty work queue
- active work queue
- available skill points
- active or available contracts

Cards are sorted by:

1. critical
2. high
3. medium
4. low
5. info

### Home screen integration

`src/components/panels/Overview.jsx` now shows:

- top priority captain approval card
- command situation summary
- captain approval queue
- frontier signals
- crew autonomous activity preview
- task queue
- resource / cargo overview
- mission and report block

## Design intent

The player should feel that the ship is running continuously and the captain is deciding priorities rather than pressing isolated buttons.

This prepares Phase 2, where priority will become a shared system for actual crew/job scheduling.
