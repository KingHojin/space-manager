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

### 21-B — Mood model and small work effects ✅

Gameplay-affecting, but intentionally small.

Implemented after 21-A:

- `src/systems/crewMood.js` derives a mood band from existing needs/fatigue data without adding a new persist store.
- Mood work multipliers stay inside the planned small band: inspired x1.12, steady x1.00, strained x0.94, low x0.88.
- Queued jobs receive an `effectiveDuration` when they start, based on the assigned crew member's mood multiplier.
- Room-work scoring and room-work progress use the same mood multiplier through crew AI activity `speedMultiplier`.
- Crew AI priority order is unchanged; mood only affects work math after an activity/job is already selected.

### 21-C — Relationship state foundation ✅

Persisted relationship state, no reports yet.

Implemented after 21-B:

- `src/systems/crewRelations.js` keeps relationship logic pure and pair-keyed.
- `crewStore.relationships` is normalized during save merge and updated from structured crew activities when crew share rooms.
- Dining/living-space co-location grows affinity slightly faster than ordinary room co-location.
- No log parsing and no new persist store key are introduced.
- Friction pairs apply a small x0.90 shared-room work penalty; close pairs apply a small x1.04 shared-room work bonus.

## Next slices

- **21-D**: UI polish plus reports for mood drops or relationship conflicts.
