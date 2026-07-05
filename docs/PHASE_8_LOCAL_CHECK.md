# Phase 8 Local Check

After merge:

```bash
git checkout master
git pull origin master
npm run build
npm run dev
```

Manual play checks:

1. Open 지도/Exploration.
2. Select a discovered adjacent node.
3. Press `이 경로로 항해`.
4. Unpause time and confirm travel progress increases.
5. Confirm arrival creates an encounter card.
6. Resolve each encounter type at least once:
   - resource/fuel
   - spawnCrisis
   - recruitOffer candidate
   - combat fallback
7. Confirm rooms/crew/crises continue ticking while travelling.
8. Confirm nav fuel depletion enters drift state instead of crashing.
