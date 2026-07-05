# Phase 10 — Crew Gacha & Recruitment

Deferred until after Phase 8 and Phase 9.

Implementation direction:

- Add `recruitStore` with currency, pity, pull history, and candidate pool.
- Keep rates and pity table in data.
- Convert Phase 8 `recruitOffer` effects into candidatePool entries.
- Instantiate crew into `crewStore` with Phase 7 injury object initialized as healthy.
- Handle duplicates and capacity overflow without data loss.
- Add recruitment UI with visible rates and pity counter.
