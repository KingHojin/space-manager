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

PR C still does not apply reward/resource outputs. It only stores the resolved result so later PRs can apply it through existing systems.

## Scope

Current Phase 15 work is foundation, UI, and state only.

- Navigation behavior is not changed yet.
- Automatic mission arrival behavior is not changed yet.
- Payout is not applied yet.
- Existing formulas are not changed.

## Next PRs

Recommended sequence:

1. PR D: connect mission arrival in Exploration to mission encounter display and resolution.
2. PR E: apply option outputs through existing reward/resource/log systems.
3. PR F: optionally trigger enRoute mission encounters during travel.

## Local check

Connector cannot run local commands. Verify locally or in Codex:

```bash
npm install
npm run build
npm run dev
```

Manual checks:

1. Accept a mission in a dev run.
2. Call `generateMissionEncounterForVessel({ vesselId })`.
3. Confirm `pendingMissionEncountersByVesselId[vesselId]` is populated.
4. Call `resolveMissionEncounter({ vesselId, optionId })`.
5. Confirm pending is cleared and resolved history is updated.
6. Confirm fail/abandon clears pending state.
7. Confirm no automatic navigation behavior changes from PR C alone.
