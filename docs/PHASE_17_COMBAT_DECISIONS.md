# Phase 17 — Combat Decision MVP

## Goal

Improve combat by adding meaningful tactical decisions before adding more visual effects.

Combat should not only be a visual feed. The player should decide:

```text
what to target + what doctrine to use
```

## PR A implemented — subsystem targeting

Files:

- `src/systems/combatEngine.js`
- `src/components/panels/Combat.jsx`
- `docs/PHASE_17_COMBAT_DECISIONS.md`

## New decision layer

Added enemy subsystem targets:

- hull
- shield
- weapons
- engine

Each target changes combat resolution slightly:

### Hull

Purpose:

- fastest path to ending the fight

Effect:

- higher direct damage bias
- slightly higher incoming pressure

### Shield

Purpose:

- remove enemy shield first

Effect:

- more damage assigned to shield
- less direct hull damage

### Weapons

Purpose:

- reduce enemy counter-pressure

Effect:

- lower outgoing damage
- lower incoming pressure

### Engine

Purpose:

- improve retreat/chase control

Effect:

- lower incoming pressure
- retreat success is easier when engine is targeted

## UI changes

Combat panel now includes a Target Subsystem section.

Player flow:

```text
start combat
-> select target subsystem
-> select directive
-> combat resolves using both choices
```

Directive cards now display the selected target in their description.

Combat logs include the target label.

## Scope guard

- This is the first combat decision MVP.
- No fleet system added.
- No combat animation overhaul.
- No new economy resource.
- No mission/encounter reward changes.
- No campaign reset or roguelite run structure.

## Why this matters

Previous combat had mostly one decision axis:

```text
directive only
```

This PR adds a second tactical axis:

```text
directive + target
```

This makes later combat design possible:

- crew tactical role assignments
- enemy subsystem damage states
- retreat vs press decisions
- campaign damage loops
- fleet-scale combat roles

## Next steps

Recommended sequence:

1. PR B: crew tactical role assignments.
2. PR C: persistent enemy subsystem states.
3. PR D: combat outcome connection from mission cards.
4. PR E: only then add stronger beam/missile/impact visual juice.

## Local check

Connector cannot run local commands. Verify locally or in Codex:

```bash
npm install
npm run build
npm run dev
```

Manual checks:

1. Open Combat.
2. Start a combat.
3. Confirm target subsystem cards are enabled only during engaged combat.
4. Select Hull and issue Attack.
5. Confirm logs mention hull targeting.
6. Select Shield and issue Attack.
7. Confirm more damage goes toward shield.
8. Select Weapons and issue a directive.
9. Confirm incoming damage is lower than equivalent hull targeting in rough feel.
10. Select Engine and use Retreat.
11. Confirm retreat is easier than non-engine target.
12. Confirm combat still grants rewards and loot as before.
