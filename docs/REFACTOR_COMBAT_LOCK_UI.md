# Refactor Combat Lock UI

## Goal

Fix the highest-priority combat issue and begin extracting repeated visual UI primitives into reusable components.

## Priority bug fixed

### Problem

After an emergency combat encounter starts during navigation, `pendingCombatEncounter` is cleared while `activeTravel` remains present.

Previous lock condition:

```js
const travelLocked = Boolean(activeTravel && !pendingCombatEncounter);
```

That could make the UI treat the battle as travel-locked immediately after starting the emergency combat, blocking tactical directive buttons even though combat was already engaged.

### Fix

Combat now tracks whether a combat round is actively engaged:

```js
const combatEngaged = combat?.status === "engaged";
const travelLocked = Boolean(activeTravel && !pendingCombatEncounter && !combatEngaged);
```

Directive buttons now use:

```js
const canIssueDirective = activeCrew.length > 0 && combatEngaged;
```

Start encounter button now uses:

```js
const canStart = activeCrew.length > 0 && !travelLocked && !combatEngaged;
```

Result:

- Navigation travel still blocks manual new combat.
- Pending emergency combat can still be started.
- Once emergency combat is engaged, directive cards stay enabled.
- Manual new combat cannot be started while another combat is already engaged.

## Refactor implemented

Added `src/components/ui/VisualPrimitives.jsx` with shared primitives:

- `StatTile`
- `GaugeBar`
- `ActionCard`
- `FeedList`

Updated `src/components/panels/Combat.jsx` to use those primitives for:

- hull/fuel/crew metrics
- enemy shield/hull gauges
- directive cards
- battle feed list

## Scope guard

- No combat formula changes.
- No enemy generation changes.
- No casualty risk math changes.
- No reward value changes.
- No resource, crew, navigation, mission, or inventory math changes.
- This PR changes UI structure and lock-state logic only.

## Local check

Connector cannot run local commands. Verify locally/Codex first:

```bash
npm install
npm run build
npm run dev
```

Manual checks:

1. Start ordinary combat while not traveling.
2. Confirm directive cards activate only after combat starts.
3. Start navigation travel.
4. Confirm manual new combat remains blocked during normal travel.
5. Trigger/prepare an emergency combat encounter during travel.
6. Click emergency combat response.
7. Confirm directive cards stay enabled after the emergency encounter is accepted and pending encounter is cleared.
8. Resolve combat and confirm rewards, damage, loot, casualty, and logs behave as before.
