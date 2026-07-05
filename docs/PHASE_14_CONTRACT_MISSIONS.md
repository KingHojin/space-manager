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

- Added 12 mission templates across multiple categories:
  - salvage
  - survey
  - courier
  - escort
  - rescue
  - bounty
  - mining
  - research
- Added mission metadata:
  - title
  - client
  - summary
  - category
  - risk
  - distance
  - preferred node types
  - reward preview
  - tags
  - encounter tags
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
- No UI was wired in PR A.
- No navigation is started by accepting a mission yet.
- No rewards are actually paid out yet.
- No combat, encounter, resource, ship, crew, job, or crisis numbers are changed.

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
- PR B still does not start navigation automatically.
- PR B still does not pay rewards.
- PR B still does not modify combat, encounter, resource, crew, crisis, room job, or navigation formulas.

## PR C implemented — Mission -> Navigation bridge

### Files

- `src/stores/navStore.js`
- `src/components/modals/MissionBoardModal.jsx`
- `src/components/panels/Exploration.jsx`
- `src/data/constants.js`
- `docs/PHASE_14_CONTRACT_MISSIONS.md`

### Behavior

- Added `navStore.previewRoute(targetNodeId, currentMinute)` so mission UI can validate a route before accepting the mission.
- Extended `navStore.planRoute(targetNodeId, currentMinute, metadata)` with optional mission metadata:
  - `missionId`
  - `missionTitle`
  - `missionDestinationName`
- Mission acceptance now:
  1. validates the destination route,
  2. accepts the mission,
  3. creates a navigation travel plan with mission metadata,
  4. unpauses the clock,
  5. opens the Exploration panel.
- If route planning fails after accept, the mission is abandoned immediately to avoid a stuck active mission.
- Exploration now shows an active mission panel with destination and risk.
- Navigation status shows `임무 항해` when current travel belongs to a mission.
- Travel cards show the mission title when mission metadata is present.
- Arrival logs distinguish mission destination arrival from ordinary node arrival.
- PR C still does not complete missions.
- PR C still does not pay rewards.

### Clock speed adjustment

- `GAME_TIME.REAL_SECOND_TO_GAME_MINUTES` changed from `20` to `3`.
- At speed 1x, 1 real second now advances 3 game minutes.
- Existing speed multipliers still apply on top:
  - 1x = 3 game minutes / real second
  - 2x = 6 game minutes / real second
  - 4x = 12 game minutes / real second

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

Completion currently returns the reward preview object but does not apply it to inventory/resources. Actual payout should be implemented in a later PR where UI and mission travel rules are connected.

## PR D target — Mission completion and payout

Recommended after navigation bridge:

- Complete mission when destination objective is resolved.
- Apply Dust/item/blueprint/recruit/reputation rewards through existing stores.
- Add failure cases for abandoned route, critical ship state, or unresolved objective.
- Decide whether mission completion should require resolving the destination encounter first.

## Local check

Connector cannot run local commands. Verify locally/Codex first:

```bash
npm install
npm run build
npm run dev
```

Manual checks for PR A:

1. Import `useMissionStore` from `src/stores/missionStore.js` in a dev console/test harness.
2. Call `refreshBoard` with a `scopeId`, current sector, and current node id.
3. Confirm exactly 3 mission records are generated by default.
4. Confirm missions include destination/risk/distance/reward metadata.
5. Call `acceptMission` with `scopeId`, `missionId`, and a test `vesselId`.
6. Confirm accepted mission moves into `activeByVesselId[vesselId]`.
7. Confirm accepting another mission for the same vessel returns `vesselBusy`.
8. Call `completeMission` and confirm it returns the reward preview without applying rewards.
9. Confirm no navigation, resource, crew, crisis, or room job values change from PR A alone.

Manual checks for PR B:

1. Open the command menu and click `임무`.
2. Confirm the mission board modal opens.
3. Confirm 3 offered missions appear for the current node.
4. Confirm each mission shows risk, distance, destination, client, tags, and reward preview.
5. Click refresh and confirm the board updates without changing resources.
6. Accept one mission and confirm it moves into the active mission card.
7. Confirm accepting another mission for the same active vessel is blocked/disabled.
8. Abandon the mission and confirm the board can accept a mission again.
9. Confirm no rewards are paid after accepting/abandoning.
10. Confirm no combat, encounter, resource, crew, crisis, or room job values change from PR B alone.

Manual checks for PR C:

1. Open `임무` and confirm each mission shows an `항로` and `예상 시간` preview.
2. Accept a mission.
3. Confirm the modal switches to the Exploration panel.
4. Confirm the clock unpauses.
5. Confirm the navigation travel card says `임무 항해 상황판`.
6. Confirm the active mission panel appears in Exploration.
7. Confirm the travel record contains mission metadata in dev tools if inspected.
8. Confirm ordinary manual route planning still works with no mission selected.
9. Confirm at 1x speed, game time advances about 3 minutes per real second.
10. Confirm no mission reward is paid yet.
11. Confirm no mission is marked completed yet.
