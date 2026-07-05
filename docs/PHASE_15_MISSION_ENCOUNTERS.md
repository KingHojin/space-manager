# Phase 15 — Mission Encounter Cards

## Goal

Give contract missions their own choice-card moments instead of using only generic arrival events.

This is not a lightweight roguelite run structure. Space Manager should remain a long-term campaign/fleet operation game where ships, crew, damage, reputation, and scars persist.

Mission cards provide procedural risk inside a persistent campaign.

## Design principle

A good mission card choice must include both upside and downside.

Preferred structure:

- safe option: low loss, low reward
- standard option: moderate loss, moderate reward
- risky option: high loss, high reward, possible crew injury, possible linked tactical state

Losses are not run-reset penalties. They are campaign scars:

- hull damage
- oxygen/fuel loss
- crew injury
- morale/stress pressure through existing crew systems
- reduced safety margin for the next operation
- future repair and recovery burden

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

## PR F implemented

Updated `src/data/missionEncounters.js` to make option stakes clearer and more campaign-oriented.

Changes:

- safe options now usually consume time/fuel or provide smaller rewards
- standard options now more often consume hull, oxygen, or fuel
- risky options now more often include crew risk, larger hull/oxygen loss, or linked tactical flags
- several low-use reward types were reduced in mission cards in favor of simpler rewards such as scrap, reputation, dust, and chance-based special finds
- no new reward currency was introduced
- the goal is a 15-20 card vertical slice before any large content expansion

## Reward economy direction

Do not add more currencies during Phase 15.

Preferred long-term compression:

- scrap: default repair, upgrade, market, and crafting economy
- reputation: access to better contracts, factions, and discounts
- artifact/special find: long-term rare objective layer
- signal/data: event key or unlock flag, not a broad parallel currency family

Existing reward keys may remain for compatibility, but future gameplay should avoid making every key a separate economy loop.

## Scope

Current Phase 15 work is foundation, UI, state, Exploration display flow, non-combat option output application, and initial campaign-loss tuning.

- Linked tactical outcomes are not connected yet.
- Existing formulas are not changed.
- Card option outputs reuse existing resource, reward, and crew injury systems.
- No whole-game run reset structure is introduced.

## Next PRs

Recommended sequence:

1. PR G: connect linked tactical outcomes carefully, only after state flow is checked.
2. PR H: add a small 15-20 card vertical slice, not 100 cards yet.
3. Phase 16: simplify reward economy and add the first real scrap/reputation sinks.
4. Phase 17: design combat decisions before adding more combat visual effects.

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
10. Confirm the option choices feel like reward/loss tradeoffs, not just reward buttons.
11. Confirm tactical/combat outputs are logged only for now.
