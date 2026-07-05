# Crew AI Support Room Priority Fix

## Problem

Cargo and living rooms could show `점검 필요`, but crew often did not walk there.

The crew AI did have a real room-job algorithm, but the scoring was biased toward role-matched rooms.

Previous behavior:

```text
함교 role -> bridge +40
포탑 role -> ops +40
기관실 role -> engineering +40
의무실 role -> medbay +40
cargo/living -> no role match, base +10
```

Because cargo and living have no matching crew role, they had to become much worse than role rooms before being selected.

## Actual AI flow

Crew activity generation follows this priority order:

1. dead crew -> inactive
2. queued treatment
3. severe injury -> medical waiting
4. active crisis response
5. medical care for serious injury
6. fatigue >= 85 -> forced rest
7. queued training
8. travel/combat/resource role assignments
9. room job assignment
10. role default work
11. idle action

Room job assignment uses `pickRoomJobsForIdleCrew`, which scores every operational room and picks the best room per idle crew member.

## Fix

Updated `src/systems/roomJobs.js`.

Added:

- `SUPPORT_ROOMS = cargo, living`
- `roomNeedScore(room)` helper
- status bonus for `점검 필요`
- stronger bonus for `위험`
- support-room base score higher than generic non-role rooms
- extra support-room bonus when cargo/living needs inspection

New scoring intent:

```text
role room still matters
but neglected support rooms can now beat stable role rooms
```

## Scope guard

- No new rooms added.
- No new resources added.
- No crisis formula changed.
- No room decay formula changed.
- No job completion effects changed.
- Only room-job selection scoring changed.

## Expected behavior

Cargo/living should now receive crew when:

- condition < 70
- load > 40
- condition < 35
- load > 75

Crisis, treatment, severe injury, fatigue, travel/combat assignments still outrank normal room jobs.

## Local check

Connector cannot run local commands. Verify locally or in Codex:

```bash
npm install
npm run build
npm run dev
```

Manual checks:

1. Let time pass until cargo or living shows `점검 필요`.
2. Confirm at least one idle crew eventually receives `room-job` for cargo/living.
3. Confirm marker moves to 창고/생활구역 on ShipInterior.
4. Confirm room progress starts.
5. Confirm job completion improves condition/load as before.
6. Confirm active crisis/treatment still takes priority over normal room jobs.
