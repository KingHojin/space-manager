# Phase 9 — Ship Customization

Implemented room-level ship customization on top of Phase 5/6/7/8.

## Added

- `src/data/roomModules.js`
  - Room tier config.
  - Room module catalog.
  - `calculateRoomModifiers(room)` single source for:
    - `jobSpeedMul`
    - `conditionDecayMul`
    - `loadCapacityMul`
    - `crisisResist`
    - `slots`

- `src/components/ship/RoomCustomization.jsx`
  - Room upgrade UI.
  - Module install/remove UI.
  - Cost gating and effect preview.

## Changed

- `roomJobs.js`
  - Initial room state now includes `tier`, `modules`, and `assignedMemberIds`.
  - Room tick reads modifiers instead of fixed coefficients only.
  - Multi-slot rooms can receive multiple room-job workers.
  - Job speed scales with worker count and room modifiers.

- `shipInteriorStore.js`
  - Adds `getRoomModifiers(roomId)`.
  - Adds `upgradeRoomTier(roomId)`.
  - Adds `installModule(roomId, moduleId)`.
  - Adds `uninstallModule(roomId, moduleId)`.
  - Migrates old `assignedMemberId` into `assignedMemberIds`.
  - Applies `crisisResist` to crisis spawn, damage, spread, injury chance, and response speed.

- `gameClock.js`
  - Passes room-job activities as per-room arrays so multi-slot rooms can process multiple workers.

- `ShipInterior.jsx`
  - Shows room tier.
  - Shows room slot count.
  - Uses multi-slot assignment markers.

- `Ship.jsx`
  - Mounts the room customization panel below existing external module UI.

## Notes

- Existing external ship module system remains unchanged.
- Room upgrades are immediate approval actions using credits.
- Room modules are immediate install/remove actions.
- This keeps the no-cycle rule: room modifiers live in data/pure helpers; cross-store resource spending happens in UI actions.

## Local check

```bash
npm run build
npm run dev
```

Focus checks:

1. Open 함선.
2. Upgrade a room tier and confirm credits decrease.
3. Install a room module and confirm modifier chips change.
4. Install `보조 베이` and confirm slot count increases.
5. Let time run and confirm multiple crew can work one room.
6. Trigger crisis and confirm higher crisisResist reduces damage/risks.
7. Remove a slot module and confirm excess assignment clears safely.
