# Clock Speed

Current base speed:

```text
1 real second = 3 game minutes at 1x speed
```

The UI speed multiplier still applies on top:

- 1x = 3 game minutes / real second
- 2x = 6 game minutes / real second
- 4x = 12 game minutes / real second

Configured in:

```js
GAME_TIME.REAL_SECOND_TO_GAME_MINUTES = 3
GAME_TIME.TICK_MS = 1000
```

Manual check:

1. Start the clock at 1x.
2. Wait 10 real seconds.
3. Confirm the game time advances by about 30 game minutes.
