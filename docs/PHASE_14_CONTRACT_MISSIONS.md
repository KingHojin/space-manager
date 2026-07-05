# Phase 14 — Contract Missions

Goal: give the player a clear reason to launch voyages: choose a contract, risk the ship, earn rewards, upgrade, and repeat.

## Design intent

Contract Missions are the first layer of the core playable loop:

```text
mission board -> accept contract -> travel -> encounter/crisis/combat -> complete/fail -> reward -> upgrade
```

Phase 14 must stay compatible with later Fleet expansion. Mission state must not assume there is only one hardcoded ship.

## PR A implemented — Mission Framework

### Files

- `src/data/missions.js`
- `src/systems/missionSystem.js`
- `src/stores/missionStore.js`
- `docs/PHASE_14_CONTRACT_MISSIONS.md`

### Behavior

- Added 12 mission templates across salvage, survey, courier, escort, rescue, bounty, mining, and research.
- Added mission metadata: title, client, summary, category, risk, distance, preferred node types, reward preview, tags, encounter tags.
- Added pure mission generation helpers:
  - deterministic seeded board generation
  - destination-aware template weighting
  - reward scaling by risk, distance, node danger, and node richness
  - mission record normalization
  - accept/complete/fail record helpers
- Added `missionStore` with persisted mission state:
  - `boardsByScopeId`
  - `activeByVesselId`
  - `completedMissions`
  - `missionLog`
- `acceptMission` requires a `vesselId` and stores active missions by vessel id.
- The store can support multiple boards via `scopeId`, such as station/node/sector boards later.

## PR B implemented — Mission Board UI

### Files

- `src/components/modals/MissionBoardModal.jsx`
- `src/App.jsx`
- `src/components/panels/Menu.jsx`
- `src/components/layout/Sidebar.jsx`
- `src/stores/shipStore.js`
- `docs/PHASE_14_CONTRACT_MISSIONS.md`

### Behavior

- Added an `임무 게시판` modal.
- Registered the modal in `App.jsx` as `missions`.
- Added a main command-menu card for `임무`.
- Added a desktop sidebar quick action for `임무`.
- The mission board auto-generates a node-scoped board for the current navigation node:
  - `scopeId = node:<currentNodeId>`
  - default board size remains 3 missions
  - board refresh still uses `missionStore.refreshBoard`
- Mission cards show title, client, category, summary, risk, distance, destination, destination danger, reward preview, and tags.
- Accepting a mission calls `missionStore.acceptMission` and logs the result.
- If the active vessel already has an active mission, the board shows the active mission card and disables accepting another mission.
- Added an abandon button for the active mission.

## PR C implemented — Mission -> Navigation bridge

### Files

- `src/stores/navStore.js`
- `src/components/modals/MissionBoardModal.jsx`
- `src/components/panels/Exploration.jsx`
- `src/data/constants.js`
- `docs/PHASE_14_CONTRACT_MISSIONS.md`
- `docs/CLOCK_SPEED.md`

### Behavior

- Added `navStore.previewRoute(targetNodeId, currentMinute)` so mission UI can validate a route before accepting the mission.
- Extended `navStore.planRoute(targetNodeId, currentMinute, metadata)` with optional mission metadata:
  - `missionId`
  - `missionTitle`
  - `missionDestinationName`
- Mission acceptance now validates route, accepts the mission, creates a mission-tagged travel plan, unpauses the clock, and opens Exploration.
- If route planning fails after accept, the mission is abandoned immediately to avoid a stuck active mission.
- Exploration shows an active mission panel with destination and risk.
- Navigation status shows `임무 항해` when current travel belongs to a mission.
- Travel cards show the mission title when mission metadata is present.
- Arrival logs distinguish mission destination arrival from ordinary node arrival.

### Clock speed adjustment

- `GAME_TIME.REAL_SECOND_TO_GAME_MINUTES` changed from `20` to `3`.
- At speed 1x, 1 real second now advances 3 game minutes.
- Existing speed multipliers still apply on top:
  - 1x = 3 game minutes / real second
  - 2x = 6 game minutes / real second
  - 4x = 12 game minutes / real second

## PR D implemented — Mission completion and payout

### Files

- `src/systems/missionRewards.js`
- `src/data/items.js`
- `src/components/panels/Exploration.jsx`
- `docs/PHASE_14_CONTRACT_MISSIONS.md`

### Behavior

- Added `applyMissionRewards(reward)`.
- Mission completion now requires:
  - active mission exists for the active vessel,
  - current node matches `mission.destinationNodeId`,
  - no travel is currently running,
  - no destination encounter is pending.
- Exploration active mission panel now shows `임무 완료하고 보상 수령` when completion is valid.
- Completing a mission calls `missionStore.completeMission` and then applies reward payout.
- Reward payout supports:
  - `credits` -> game resources
  - `dust` -> inventory dust
  - `scrap` -> `salvage-scrap`
  - `chartData` -> `chart-data`
  - `oreSample` -> `ore-sample`
  - `researchData` -> `research-data`
  - `tradeVoucher` -> `trade-voucher`
  - `reputation` -> `reputation-token`
  - `blueprintChance` -> chance to add `blueprint-fragment`
  - `artifactChance` -> chance to add `artifact-cache`
  - `recruitChance` -> chance to add `recruit-signal` and a recruit candidate
- Added mission reward inventory items to `src/data/items.js`.
- Reward logs are written through the game log so the player can see exactly what was paid out.

## Fleet-safety rule

PR A intentionally does not use a global singleton ship id.

PR B adds a small fleet-friendly identity layer to `shipStore`:

- `activeVesselId`
- `vesselsById`
- `selectVessel`
- `getActiveVessel`

The current run has one starter vessel record, but mission state is still keyed by `vesselId`, not by a hardcoded unique ship assumption. Later Fleet work can add more vessel records without changing mission ownership shape.

## Current mission lifecycle

```text
offered -> active -> completed
                  -> failed
                  -> abandoned
```

## Next targets

Recommended follow-up work:

- Add richer mission objective variants before completion.
- Add failure conditions for severe drift, destroyed ship, or abandoned objective.
- Add mission-specific encounter pools using `encounterTags`.
- Add blueprint crafting use for `blueprint-fragment`.
- Add market use for `trade-voucher` and reputation effects.

## Local check

Connector cannot run local commands. Verify locally/Codex first:

```bash
npm install
npm run build
npm run dev
```

Manual checks for PR D:

1. Accept a mission from the mission board.
2. Confirm travel starts and Exploration opens.
3. Let the ship arrive at the mission destination.
4. Confirm a destination encounter appears if generated.
5. Resolve the encounter.
6. Confirm the active mission panel shows `임무 완료하고 보상 수령`.
7. Click completion.
8. Confirm the active mission disappears.
9. Confirm the mission is added to completed mission history.
10. Confirm Dust/items/recruit candidate rewards appear according to the reward preview and chance rolls.
11. Confirm completing is blocked while travel is active or an encounter is pending.
12. Confirm ordinary non-mission travel still works.
