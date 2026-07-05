# Visual Combat / Encounter Pass

## Goal

Continue reducing text-heavy screens by making Combat feel more like a tactical game console.

## Implemented

### Combat panel

Updated `src/components/panels/Combat.jsx`.

The combat screen now emphasizes:

- tactical console header
- enemy/threat poster panel
- large power badge
- ship hull / fuel / crew survival metric tiles
- enemy shield and hull gauges
- compact reward/power/loot chips
- directive cards instead of plain command buttons
- separated battle feed panel
- shorter travel/encounter warning block

### Visual command cards

Directives now show as visual cards:

- 공격 집중
- 회피 기동
- 방어막 강화
- 도주 시도
- 카드 발동

Each card includes a symbol and short tactical role.

### Battle feed

Combat logs are now rendered as compact feed cards instead of only long text lines.

## Scope guard

- No combat formulas changed.
- No enemy generation changed.
- No casualty risk math changed.
- No reward values changed.
- No resource, crew, navigation, mission, or inventory math changed.
- This pass only changes visual layout and presentation.

## Local check

Connector cannot run local commands. Verify locally/Codex first:

```bash
npm install
npm run build
npm run dev
```

Manual checks:

1. Open Combat.
2. Confirm tactical console renders with threat poster, metrics, and directive cards.
3. Start a non-travel encounter and confirm a combat appears.
4. Use each directive and confirm combat still resolves.
5. Confirm rewards, damage, loot, and casualty logs still behave as before.
6. Confirm battle feed updates visually.
7. Confirm travel-locked combat still blocks manual new encounters.
8. Confirm emergency combat encounter still allows response.
