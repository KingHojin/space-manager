# Phase 10 — Crew Gacha & Recruitment

Implemented crew recruitment on top of Phase 7/8/9.

## Added

- `src/data/recruitment.js`
  - Crew template catalog.
  - Visible recruit rate table.
  - Pity threshold config.
  - Pull costs and duplicate refunds.

- `src/stores/recruitStore.js`
  - `pity`
  - `pullHistory`
  - `candidatePool`
  - `lastResults`
  - `pull(count)`
  - `addCandidate(templateId, source)`
  - `recruitFromCandidate(candidateId)`

- `src/components/panels/Recruit.jsx`
  - 1-pull / 10-pull UI.
  - Visible rates.
  - Pity progress.
  - Candidate review and acceptance.
  - Recent results and history.

## Changed

- `crewStore.js`
  - Added `recruitCrew(crewMember)`.
  - Recruited crew initialize with healthy injury state, fatigue 0, morale normal.

- `gameClock.js`
  - Phase 8 `recruitOffer` effects now feed `recruitStore.candidatePool`.
  - Legacy `navStore.recruitCandidates` is still updated as compatibility/logging state.

- `App.jsx`, `constants.js`, `Sidebar.jsx`, `Menu.jsx`
  - Added Recruit panel route and menu entry.
  - Mobile access is through command menu.

## Important hotfix included

Manual combat is now locked during Phase 8 `navStore.travel`.

Before this change, combat UI only checked legacy `explorationStore.activeTravel`, so a player could enter Combat during new node navigation and manually generate a fresh fight. That was unrealistic.

Now:

- Desktop sidebar checks `navStore.travel`.
- Mobile bottom dock checks `navStore.travel`.
- Combat panel checks `navStore.travel`.
- Manual `새 교전 생성` is disabled during travel.
- Emergency combat is still allowed only when `pendingCombatEncounter` exists.

## Local check

```bash
npm run build
npm run dev
```

Manual checks:

1. Start node travel and confirm Combat is locked.
2. Trigger a combat outcome from a navigation encounter and confirm only that urgent combat can be handled.
3. Open 영입 from desktop sidebar or mobile command menu.
4. Confirm 1-pull and 10-pull spend credits.
5. Confirm rates and pity counter are visible.
6. Confirm duplicate/capacity overflow gives refund instead of data loss.
7. Trigger a Phase 8 `recruitOffer` encounter and confirm candidate appears in 영입.
8. Accept a candidate and confirm crewStore receives a healthy crew member.
