# Visual Crew / Ship / Inventory Pass

## Goal

Continue the visual UI reduction work by reducing text-heavy list/table surfaces in Crew, Ship, and Inventory screens.

## Implemented

### Inventory modal

Updated `src/components/modals/InventoryModal.jsx`.

- Items are now shown as visual cards.
- Each card has a large item icon panel.
- Rarity drives border/background tone.
- Quantity, sell value, type, and effect are shown as compact chips.
- Use/sell actions remain unchanged.

### Crew panel

Updated `src/components/panels/Crew.jsx`.

- Crew members are now shown as portrait/status cards.
- Removed the large squad table from the main view.
- Each crew card emphasizes:
  - role portrait icon
  - condition percentage
  - injury state
  - AI order
  - morale/fatigue/experience
  - needs tiles
  - training/treatment progress
  - stat chips
- Role coverage is now a compact card grid.
- Recent AI assignments are shortened.

### Ship panel

Updated `src/components/panels/Ship.jsx`.

- Slot overview now uses module slot cards instead of dense blueprint text.
- Module replacement lists now use visual module cards.
- Module stats are shown as small tiles.
- Install/upgrade metadata is shown as chips.
- Equip/upgrade behavior remains unchanged.

## Scope guard

- No gameplay formulas changed.
- No reward values changed.
- No navigation math changed.
- No combat, crew, crisis, room job, training, treatment, module, inventory, or resource math changed.
- This pass only changes visual presentation and card layout.

## Local check

Connector cannot run local commands. Verify locally/Codex first:

```bash
npm install
npm run build
npm run dev
```

Manual checks:

1. Open Inventory and confirm item cards render with icons, quantity, rarity, type, effect, use/sell buttons.
2. Use a usable item and confirm the same resource effect/log happens.
3. Sell an item and confirm credits/log update.
4. Open Crew and confirm crew cards render with portrait, needs, stats, training/rest/treatment buttons.
5. Start training/treatment and confirm progress card appears.
6. Open Ship and confirm slot cards and module cards render.
7. Equip and upgrade actions should still create work tasks with the same costs/durations.
8. Confirm no gameplay values changed from this visual pass alone.
