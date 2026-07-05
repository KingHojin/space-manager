# Phase 4 — Ship Interior

This phase turns crew AI text into a visible ship-space simulation.

## Goal

The player should see crew members moving around the ship like a small management sim.

## Implemented

### Ship interior component

`src/components/ship/ShipInterior.jsx` adds a top-down 2D ship interior.

Rooms:

- Bridge
- Operations room
- Medbay
- Living quarters
- Engine room
- Cargo room

### Crew markers

Living crew members are rendered as moving markers.

Marker behavior:

- The marker position is derived from the crew member's current AI activity.
- The marker moves with CSS transition when the assigned room changes.
- Marker color reflects current task priority.
- Active rooms are highlighted.
- Multiple crew members in the same room are offset so they do not fully overlap.

### Crew panel integration

`src/components/panels/Crew.jsx` now shows the animated ship interior next to crew cards and the squad table.

## Design intent

This is the first visible version of the RimWorld-like ship interior loop.

The player still does not micromanage every step. The player sets tasks and priorities; the crew AI chooses current work; the ship interior shows where each crew member is acting.

## Next refinements

- Add corridor path visualization instead of direct room-to-room interpolation.
- Add room health, fire, breach, and repair overlays.
- Add real room job slots so crew AI can claim room work.
- Add compact ship interior to the home command center.
- Add room-based events such as medbay overload or engine-room fault.
