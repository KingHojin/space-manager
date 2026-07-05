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

## Scope

This PR is data and system only.

- No UI is connected yet.
- No navigation behavior changed.
- No mission completion behavior changed.
- No payout is applied yet.
- No existing formulas changed.

## Next PRs

Recommended sequence:

1. PR B: reusable mission encounter card UI.
2. PR C: pending mission encounter state keyed by vessel or mission.
3. PR D: connect mission arrival in Exploration to mission encounter resolution.

## Local check

Connector cannot run local commands. Verify locally or in Codex:

```bash
npm install
npm run build
npm run dev
```

Manual checks:

1. Import `generateMissionEncounter` in a dev harness.
2. Pass an active mission with tags and encounterTags.
3. Confirm an encounter record is generated.
4. Confirm `getMissionEncounterCandidates` sorts relevant templates higher.
5. Resolve an option with `resolveMissionEncounterOption`.
6. Confirm reward/resource/log-like outputs are normalized.
7. Confirm no UI behavior changes from PR A alone.
