# Phase 9 Hotfix Notes

Applied before Phase 10.

## Fixed

- Room customization payment safety
  - UI now checks affordability before spending.
  - If a room store action unexpectedly fails after spending, credits are refunded.

- Room normalization
  - `withRoomStatus` now derives status from the normalized room object.
  - `normalizeRoom` validates module ids and clamps assigned worker ids to effective slot count.
  - Removing a slot-granting module safely trims overflow assignments.

## Still requires local build

Connector cannot run `npm run build`, so verify locally:

```bash
npm run build
npm run dev
```

Manual checks:

1. Upgrade room tier with enough credits.
2. Try upgrade/install without enough credits.
3. Install and remove `보조 베이`.
4. Confirm slot count and assigned workers remain safe.
