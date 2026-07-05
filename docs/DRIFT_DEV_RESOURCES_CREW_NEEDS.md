# Drift, Dev Resources, and Crew Needs

## Added

### Real drift loop

`navStore.fuel` is the navigation fuel source.

When it reaches 0 during travel:

- current travel is cancelled
- `driftState` is created
- movement stops
- route planning is blocked
- drift pressure increases over time
- drift severity escalates by duration
- drift can spawn engineering `power_loss` crises
- emergency refuel clears drift state

### Development resource lock

`DEV_FLAGS.LOCK_PERCENT_RESOURCES` is currently `true`.

This keeps these global game resources fixed at 100 during development:

- `fuel`
- `oxygen`
- `hull`

Credits still change normally.

Important distinction:

- `gameStore.resources.fuel` is locked to 100 for development convenience.
- `navStore.fuel` still decreases and can reach 0, so drift can be tested.

### Crew needs

Each crew member now has detailed needs:

- `hunger`
- `mood`
- `stress`
- `sleepDebt`
- `hygiene`

These change over time and are affected by:

- normal time passage
- training
- treatment
- rest
- combat casualty
- drift pressure

The crew panel displays these values per member and in the squad table.

## Local check

```bash
npm run build
npm run dev
```

Manual checks:

1. Confirm global fuel/oxygen/hull show as 100 during development.
2. Start navigation and confirm nav fuel decreases separately.
3. Force or wait for nav fuel to reach 0.
4. Confirm travel stops and drift state appears.
5. Confirm route planning is blocked during drift.
6. Let time pass and confirm crew needs worsen during drift.
7. Use emergency refuel and confirm drift state clears.
8. Open Crew and confirm hunger/mood/stress/sleepDebt/hygiene are visible.
