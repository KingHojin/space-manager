# Phase 16 — Reward Economy Simplification

## Goal

Keep the reward economy readable before adding more mission content.

Space Manager should not become a game with many parallel currencies. The campaign loop should be easy to understand:

```text
mission risk -> campaign damage -> scrap repair / reputation access -> harder mission
```

Phase 16 is not a large economy rebuild. It closes the first two practical loops:

- scrap repairs persistent hull damage
- reputation gates access to higher-risk contracts

## Completed scope

### PR A — scrap hull repair sink

Files:

- `src/components/panels/Ship.jsx`
- `docs/PHASE_16_REWARD_ECONOMY.md`

Implemented:

- Ship panel campaign repair card
- displays current hull
- displays owned salvage scrap
- spends salvage scrap to repair hull
- writes a game log entry

Current rule:

```text
salvage-scrap x6 -> hull +8%
```

This uses existing systems:

- `salvage-scrap` item from inventory
- `inventoryStore.removeItem`
- `gameStore.repairHull`
- `gameStore.addLog`

### PR B — reputation access gate

Files:

- `src/systems/missionSystem.js`
- `src/stores/missionStore.js`
- `src/components/modals/MissionBoardModal.jsx`
- `docs/PHASE_16_REWARD_ECONOMY.md`

Implemented:

- runtime missions now include `reputationRequired`
- high-risk missions require reputation 2
- extreme-risk missions require reputation 5
- mission acceptance checks available reputation
- mission board displays reputation requirement chips
- locked missions explain that reputation is an access requirement
- reputation is not consumed when accepting a mission

Current rule:

```text
low / medium: reputation 0
high: reputation 2
extreme: reputation 5
```

## Why this matters

Phase 15 mission cards create persistent campaign losses such as hull damage, oxygen loss, fuel loss, and crew risk.

Phase 16 closes the first economy loop:

```text
mission card choice damages hull
-> mission reward grants scrap
-> player spends scrap to repair hull
-> next operation is safer
```

And the first access loop:

```text
safe/medium contracts build reputation
-> reputation opens high/extreme contracts
-> high/extreme contracts offer larger rewards and sharper losses
```

This keeps the game pointed toward a persistent campaign/fleet operation structure, not a lightweight full-reset run structure.

## Economy direction

Do not add new currencies unless absolutely necessary.

Preferred long-term compression:

- scrap: repair, upgrade, crafting, basic market economy
- reputation: access to better contracts, faction trust, discounts
- artifact/special find: rare long-term objective layer
- signal/data: event keys or unlock flags, not broad parallel currency families

Existing reward keys can remain for compatibility, but future design should not treat every reward key as an equal standalone currency.

## What Phase 16 intentionally avoided

- no new currency
- no broad crafting tree
- no large market redesign
- no meta-run reset economy
- no mass content expansion
- no combat redesign
- no big balance pass before local build/play checks

## Recommended next phase

Phase 17 should not start with visual combat juice. It should start with decision structure:

- target enemy subsystem
- assign crew to tactical roles
- choose stance or doctrine
- create clear retreat/hold/press choices
- make combat results feed back into campaign damage and repair loops

## Local check

Connector cannot run local commands. Verify locally or in Codex:

```bash
npm install
npm run build
npm run dev
```

Manual checks:

1. Obtain or add `salvage-scrap` through a mission card or dev state.
2. Reduce hull below 100.
3. Open Ship.
4. Confirm the Campaign Repair card shows hull, scrap, cost, and repair amount.
5. Click repair.
6. Confirm salvage scrap decreases by 6.
7. Confirm hull increases by 8 unless dev resource lock keeps hull at 100.
8. Confirm log entry appears.
9. Confirm button disables when hull is full or scrap is insufficient.
10. Open Mission Board.
11. Confirm high missions show reputation 2 requirement.
12. Confirm extreme missions show reputation 5 requirement.
13. Confirm locked missions cannot be accepted when reputation is insufficient.
14. Confirm reputation is not consumed when accepting an unlocked mission.
