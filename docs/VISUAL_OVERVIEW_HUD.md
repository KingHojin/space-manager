# Visual Overview HUD Pass

## Goal

Continue the visual UI reduction work beyond mission cards by making the first/home screen feel less like a text dashboard and more like a game HUD.

## Implemented

### Overview screen

Updated `src/components/panels/Overview.jsx`.

The home screen now emphasizes:

- large star map first
- circular resource/status orbs
- compact quick-command icon cards
- active mission poster panel
- mission progress steps
- compact crew avatar tiles
- visual frontier signal cards
- shorter logs and shorter descriptions

### Text reduction

Reduced long explanatory blocks in the Overview screen by converting them into:

- icon tiles
- orb gauges
- poster panels
- chips
- progress bars
- compact cards

### Mission visibility on home

If an active mission exists, the home screen now shows it as a visual mission poster panel instead of burying it in text/logs.

If no active mission exists, the home screen shows a clear visual prompt to open the mission board.

## Scope guard

- No gameplay formulas changed.
- No reward values changed.
- No navigation math changed.
- No combat, crew, crisis, room job, or resource math changed.
- No external image files added.

## Local check

Connector cannot run local commands. Verify locally/Codex first:

```bash
npm install
npm run build
npm run dev
```

Manual checks:

1. Open the home/overview screen.
2. Confirm the screen feels less text-heavy.
3. Confirm circular resource/status orbs render correctly.
4. Confirm quick command cards navigate correctly.
5. Confirm active mission poster appears if a mission is active.
6. Confirm mission board prompt appears if no mission is active.
7. Confirm StarMap, ShipInterior compact view, TaskQueuePanel, and logs still render.
8. Confirm no gameplay values changed from this visual pass alone.
