# UI Polish + Expanded Ship Zones

## Goal

Make the game feel more premium and make the ship interior feel larger without changing gameplay formulas.

## Implemented

### UI polish layer

- Added `src/uiPolish.css`.
- Loaded it after base styles and crew motion styles in `src/main.jsx`.
- Added `app-shell` chrome treatment in `src/App.jsx`.
- Improved visual feel for:
  - app background glow
  - panels
  - buttons
  - nav buttons
  - chips
  - modals
  - module blueprint
  - ship interior map

### Expanded ship interior display

Operational rooms remain unchanged:

- bridge
- ops
- medbay
- living
- engineering
- cargo

Added visual-only auxiliary zones:

- armory
- lab
- observatory
- hydroponics
- comms
- survey-bay

These zones are rendered on the ship map and connected by display-only route lines.

## Gameplay guard

The auxiliary zones are decorative/presentation-only for this PR.

- `ROOM_IDS` still maps only operational `ROOMS`.
- `shipInteriorStore` crisis ticking still iterates over `ROOM_IDS`.
- room jobs still assign crew to operational rooms only.
- room customization still maps operational `ROOMS` only.
- no resource, combat, crisis, room job, crew, mission, or navigation values are changed.

## Local check

Connector cannot run local commands. Verify locally/Codex first:

```bash
npm install
npm run build
npm run dev
```

Manual checks:

1. Open the app and confirm the global UI still renders correctly.
2. Confirm panels, buttons, modal, chips, and bottom dock still behave normally.
3. Open the ship/interior view.
4. Confirm ship interior shows 12 zones total: 6 operational rooms + 6 auxiliary zones.
5. Confirm auxiliary zones show as dashed/secondary rooms.
6. Confirm crew still moves only between operational rooms.
7. Confirm room customization still only shows operational rooms.
8. Confirm no new crisis/job/upgrade targets appear for auxiliary zones.
