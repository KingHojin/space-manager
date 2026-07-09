# Phase 21 — Inner Life

Goal: make crew members feel like people, without breaking the existing crew AI priority stack.

## Architecture rule

Phase 21 must stay incremental. Personality display, mood effects, relations, and reports are separate slices so each PR can be tested and merged independently.

### 21-A — Personality traits ✅

Display-only foundation. No gameplay numbers are changed.

Implemented first:

- `src/data/crewTraits.js` catalog of personality trait ids, labels, tones, and descriptions.
- Initial crew now carries `personalityTraitIds` alongside the legacy single-line `trait` flavor text.
- `crewStore` normalizes trait ids during initial load, save merge, and recruitment:
  - unknown ids are dropped
  - duplicates are removed
  - initial crew falls back to the catalog defaults
- Crew cards render personality chips before the AI order card.

### What 21-A intentionally does not do

- No mood formula changes.
- No job speed modifiers.
- No room work score modifiers.
- No social relation state.
- No reports generated from traits.
- No crew AI priority changes.

## Next slices

- **21-B**: mood model and small work-speed/room-work multipliers.
- **21-C**: relationship state and small relation-based efficiency penalties.
- **21-D**: UI polish plus reports for mood drops or relationship conflicts.
