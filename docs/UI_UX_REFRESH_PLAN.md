# UI/UX Refresh Plan — Quiet Space Operations

## Goal

Modernize Space Manager into a clean, calm, premium operations interface while preserving the information density required by an FM/RimWorld-style management game. The visual direction borrows principles rather than copying any product: restrained hierarchy, generous spacing, consistent materials, one primary accent, progressive disclosure, predictable motion, and accessible interaction targets.

The ship interior is redesigned as an FTL-like top-down deck plan with a readable hull silhouette, orthogonal rooms and corridors, visible crew movement, and clear crisis states.

## Hard constraints

1. No gameplay rules, store contracts, save schema, room IDs, job logic, or AI priorities change in this project.
2. Existing panel IDs and modal IDs remain stable.
3. Mobile remains a first-class target.
4. `prefers-reduced-motion`, keyboard focus, safe-area insets, and minimum touch targets are required.
5. Cosmetic work must not delay Phase 22 gameification. Every slice must be independently mergeable.

## Current problems confirmed in master

- Global presentation is dominated by cyan borders, star grids, uppercase HUD labels, and glow effects; nearly every surface competes for attention.
- Cards lack a consistent elevation and spacing system because global `section` styling and local Tailwind classes overlap.
- Desktop navigation is visually heavy and mobile navigation feels attached to the page rather than acting as a focused system bar.
- Header mixes ship identity, clock controls, four resources, warnings, and notifications in one dense strip.
- Ship interior uses floating absolute-positioned cards inside an oval shell. It communicates status but not a believable deck or corridor topology.
- Decorative auxiliary rooms look operational even though they are not interactive.

## Design language

### Color and material

- Base: neutral graphite, not blue-black.
- Primary accent: system blue, used only for selected navigation, primary actions, and active progress.
- Semantic colors: green, amber, red remain reserved for state.
- Surfaces: opaque dark base with restrained translucent overlays; remove grid textures from normal content.
- Borders: low-contrast hairlines; selected state uses fill/elevation before glow.

### Shape and spacing

- Surface radius: 16–20px.
- Controls: 10–14px radius, minimum 44px touch height.
- Spacing scale: 4 / 8 / 12 / 16 / 24 / 32.
- Typography hierarchy: page title, section title, body, metadata; uppercase only for tiny machine labels where useful.

### Motion

- 140–220ms ease-out for navigation and sheets.
- No decorative perpetual motion outside gameplay signals.
- Crisis animation remains visible but reduced-motion safe.

## Work packages

### UI-1 — Foundation and application shell

Files: `main.jsx`, new `appleUI.css`, `App.jsx`, `Header.jsx`, `Sidebar.jsx`, `BottomDock.jsx`, `OverlayModal.jsx`.

- Introduce isolated design tokens and compatibility overrides after existing CSS.
- Replace sci-fi grid chrome with neutral layered background.
- Convert desktop sidebar to a quiet navigation rail with grouped primary/utility actions.
- Convert mobile dock to a floating safe-area tab bar.
- Recompose header into ship identity, compact resource capsules, and one control cluster.
- Standardize focus rings, disabled states, hover/press feedback, and modal sheet behavior.

Acceptance:
- No layout overflow at 390px, 768px, 1280px.
- Existing navigation/modals remain functional.
- All controls have visible keyboard focus.
- No gameplay/store changes.

### UI-2 — Component hierarchy and panel cleanup

Files: shared visual primitives and high-traffic panels.

- Define reusable surface, inset, metric, toolbar, and status-row styles.
- Remove duplicated nested borders and gradients.
- Establish one card title/action pattern.
- Apply progressive disclosure: primary decision first, diagnostics second.

Acceptance:
- Overview, Exploration, Ship, Crew, Market, and Combat share one hierarchy.
- Semantic states remain unmistakable without relying only on color.

### SHIP-1 — FTL-like deck visualization

Files: `shipRooms.js`, `shipInteriorLayout.js`, `ShipInterior.jsx`, new `shipDeck.css`.

- Preserve operational room IDs and routing graph.
- Replace the oval shell with a directional hull silhouette.
- Arrange operational rooms on a coherent deck grid with straight corridor adjacency.
- Render decorative auxiliary zones as muted hull bays, not equivalent operational rooms.
- Add bulkhead/corridor nodes and engine/nozzle silhouette.
- Keep crew target anchors and pathfinding compatible with percentage coordinates.

Proposed deck:
- Bow: bridge.
- Forward port/starboard: ops and medbay.
- Midship: living and galley around a central corridor.
- Aft: engineering centered, cargo toward stern/side.
- Aux rooms occupy outer muted bays.

Acceptance:
- Every route line remains inside the hull.
- Crew visibly crosses connected rooms.
- Room click, crisis, condition, job progress, modules, and crew animations still work.
- Compact mobile mode remains readable.

### SHIP-2 — Interaction and visual feedback

- Selected room inspector state.
- Clear room occupancy and work state without debug-like C/L/T/S labels dominating.
- Crisis breach/fire/power states integrated into room material.
- Optional deck legend and zoom/fullscreen only if usability testing proves necessary.

### UI-3 — Accessibility, responsive and regression pass

- Reduced motion.
- Contrast audit.
- Keyboard navigation and Escape-to-close.
- Mobile touch-target audit.
- Visual regression screenshots at target breakpoints.
- Build and complete Vitest suite.

## Delivery order

1. UI-1 foundation.
2. SHIP-1 deck visualization.
3. UI-2 panel hierarchy.
4. SHIP-2 interaction polish.
5. UI-3 regression and accessibility.

## Review rules

- Each PR changes one visual layer only.
- Reviewer verifies diff for accidental logic/store/schema changes.
- Build and full test suite are required before merge.
- A before/after screenshot set is required once screenshot automation is available.
- Any visual change that hides an important gameplay state is rejected even if it looks cleaner.
