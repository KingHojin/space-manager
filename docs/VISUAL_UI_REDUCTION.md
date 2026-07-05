# Visual UI Reduction Pass

## Goal

The previous UI polish improved chrome, gradients, panels, and ship interior atmosphere, but mission/UI surfaces still felt text-heavy.

This pass reduces text density by making key mission screens card/visual-first.

## Implemented

### Mission visual components

Added `src/components/ui/MissionVisuals.jsx`:

- `MissionPoster`
- `MissionStatStrip`
- `RewardIconRow`
- `MissionProgressSteps`

These provide reusable visual blocks for mission category art, risk meter, short reward icons, and mission progress state.

### Mission Board

Updated `src/components/modals/MissionBoardModal.jsx`:

- Mission cards now start with a large visual poster panel.
- Long reward labels are replaced by compact icon chips.
- Risk, route, destination, and ETA are shown as visual/stat tiles.
- Summary text is reduced to two lines.
- Active mission card uses a poster layout instead of a text-first block.

### Exploration

Updated `src/components/panels/Exploration.jsx`:

- Active mission panel now includes a poster image area.
- Mission state is shown through a three-step visual tracker:
  - 항해
  - 조우
  - 보상
- Encounter card gets a large icon tile.
- Travel panel gets a stronger visual card treatment.
- Some explanatory copy is shortened.

### CSS

Updated `src/uiPolish.css`:

- Added CSS-only mission poster art.
- Added category-specific visual themes:
  - salvage
  - survey
  - courier
  - escort
  - rescue
  - bounty
  - mining
  - research
- Added visual reward chips, mission stat tiles, progress steps, and hover treatment.

## Scope guard

- No gameplay formulas changed.
- No mission reward values changed.
- No navigation, combat, crew, crisis, room job, or resource math changed.
- No external image files added yet.

## Local check

Connector cannot run local commands. Verify locally/Codex first:

```bash
npm install
npm run build
npm run dev
```

Manual checks:

1. Open `임무`.
2. Confirm mission cards show large visual poster areas.
3. Confirm cards no longer feel like text-only blocks.
4. Confirm route/ETA/risk/reward are visible as compact UI elements.
5. Accept a mission.
6. Confirm Exploration active mission panel has poster art and progress steps.
7. Confirm encounter card shows an icon tile and shorter text.
8. Confirm mission completion/reward flow from Phase 14 PR D still works.
