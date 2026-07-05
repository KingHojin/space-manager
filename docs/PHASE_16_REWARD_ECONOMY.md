# Phase 16 — Reward Economy Simplification

## Goal

Keep the reward economy readable before adding more mission content.

Space Manager should not become a game with many parallel currencies. The campaign loop should be easy to understand:

```text
mission risk -> campaign damage -> scrap repair / upgrade -> harder mission
```

## PR A implemented — scrap hull repair sink

Files:

- `src/components/panels/Ship.jsx`
- `docs/PHASE_16_REWARD_ECONOMY.md`

## Implemented

Added a small campaign repair card to the Ship panel:

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

## Why this matters

Phase 15 mission cards now create persistent campaign losses such as hull damage, oxygen loss, fuel loss, and crew risk.

PR A closes the first reward loop:

```text
mission card choice damages hull
-> mission reward grants scrap
-> player spends scrap to repair hull
-> next operation is safer
```

This makes scrap a practical campaign resource instead of just another reward item.

## Economy direction

Do not add new currencies unless absolutely necessary.

Preferred long-term compression:

- scrap: repair, upgrade, crafting, basic market economy
- reputation: access to better contracts, faction trust, discounts
- artifact/special find: rare long-term objective layer
- signal/data: event keys or unlock flags, not broad parallel currency families

Existing reward keys can remain for compatibility, but future design should not treat every reward key as an equal standalone currency.

## Scope guard

- No new currency added.
- No mission reward generation changed.
- No combat formulas changed.
- No navigation formulas changed.
- No module upgrade costs changed.
- This is only the first repair sink for an existing reward item.

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
