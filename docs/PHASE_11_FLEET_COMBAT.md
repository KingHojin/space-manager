# Phase 11 — Fleet Combat

Deferred until after Phase 8~10.

Implementation direction:

- Add `combatStore` for enemy ship state only.
- Reuse player ship rooms from `shipInteriorStore`.
- Combat loop: deploy → exchange → resolved.
- Return hit effects for `spawnCrisis` and Phase 7 injuries from combat tick; apply them from the clock/orchestrator layer.
- Activate Phase 6 `hull_breach` and `intruder` triggers here.
- Add lightweight mobile combat visualization only in Phase 11.
- Add victory, flee, surrender, and game-over handling.
