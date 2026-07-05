# Phase 15 — Mission Encounter Cards

## Goal

Give contract missions their own choice-card moments instead of using only generic arrival events.

## PR A implemented

Files:

- `src/data/missionEncounters.js`
- `src/systems/missionEncounterSystem.js`
- `docs/PHASE_15_MISSION_ENCOUNTERS.md`

## Data

Added mission encounter templates for these mission categories:

- salvage
- rescue
- courier
- survey
- bounty
- mining
- research

Each template has:

- title
- category
- icon
- scene
- tags
- timing
- risk
- options

Each option has:

- label
- role
- risk
- rewardPreview
- outcomes

## System

Added pure helpers:

- `instantiateMissionEncounter`
- `generateMissionEncounter`
- `normalizeMissionEncounterRecord`
- `resolveMissionEncounterOption`
- `getMissionEncounterCandidates`

The matching score uses:

- mission tags
- mission encounterTags
- mission category
- requested timing
- mission risk

## PR B implemented

Added a reusable presentational component:

- `src/components/ui/MissionEncounterCard.jsx`

The card renders:

- encounter poster panel
- risk chip
- timing chip
- destination chip
- risk gauge
- scene text
- option cards
- option role chip
- option risk chip
- reward preview chips
- resource delta chips
- crew-risk indicator
- linked encounter indicator

PR B is UI-only. It accepts an `encounter` prop and optional `onSelectOption(optionId)` callback.

It does not read stores and does not connect to navigation, mission state, rewards, or existing gameplay flow.

## PR C implemented

Updated `src/stores/missionStore.js` with fleet-safe pending encounter state.

New state:

- `pendingMissionEncountersByVesselId`
- `resolvedMissionEncounters`

New actions:

- `generateMissionEncounterForVessel`
- `resolveMissionEncounter`
- `clearMissionEncounter`
- `getPendingMissionEncounter`

Behavior:

- pending encounters are keyed by `vesselId`
- generation uses the active mission for that vessel
- duplicate generation returns the existing pending encounter unless `force` is true
- resolved encounters move into capped history
- failing or abandoning a mission clears its pending encounter
- mission summary now includes pending encounter count

## PR D implemented

Updated `src/components/panels/Exploration.jsx` to connect the Phase 15 card flow.

Behavior:

- when an active mission reaches its destination and no ordinary navigation event is pending, Exploration generates one mission card
- resolved history prevents the same mission from continuously generating new required cards
- pending mission cards render with `MissionEncounterCard`
- selecting an option resolves the pending card into history
- active mission completion is blocked while a mission card is pending
- route planning panel is hidden while a mission card is pending

## PR E implemented

Updated `src/components/panels/Exploration.jsx` so mission card option outputs now apply through existing systems.

Applied outputs:

- `resourceDelta` uses `gameStore.addResources`
- `reward` uses existing `applyMissionRewards`
- `log` outputs are added to the game log
- `crewRisk` rolls its configured chance and uses existing `crewStore.applyCombatCasualty`

Not connected yet:

- linked tactical/combat outputs are still logged only

## Scope

Current Phase 15 work is foundation, UI, state, Exploration display flow, and non-combat option output application.

- Linked tactical outcomes are not connected yet.
- Existing formulas are not changed.
- Card option outputs reuse existing resource, reward, and crew injury systems.

## Next PRs

Recommended sequence:

1. PR F: connect linked tactical outcomes where appropriate.
2. PR G: optionally trigger enRoute mission cards during travel.
3. PR H: add more mission card templates for content density.

## Local check

Connector cannot run local commands. Verify locally or in Codex:

```bash
npm install
npm run build
npm run dev
```

Manual checks:

1. Accept a mission.
2. Travel to the mission destination.
3. Confirm a mission card appears on arrival.
4. Confirm mission completion is blocked while the card is pending.
5. Select a card option.
6. Confirm the card disappears and the mission can be completed.
7. Confirm resource changes are applied.
8. Confirm option rewards are paid through the existing mission reward system.
9. Confirm crew-risk options can injure a living crew member or log a risk dodge.
10. Confirm tactical/combat outputs are logged only for now.
