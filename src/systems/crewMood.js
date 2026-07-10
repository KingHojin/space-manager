// Phase 21-B: pure mood derivation helpers.
// Mood affects work only as a small multiplier; it must not decide crew AI
// priorities or reorder the treatment/crisis/queue stack.

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function deriveCrewMood(member = {}) {
  if (member.alive === false) return { score: 0, band: "unavailable", label: "작전 제외" };
  const needs = member.needs ?? {};
  const baseMood = number(needs.mood, 60);
  const hunger = number(needs.hunger, 0);
  const stress = number(needs.stress, 20);
  const sleepDebt = number(needs.sleepDebt, 0);
  const hygiene = number(needs.hygiene, 80);
  const fatigue = number(member.fatigue, 0);
  const score = clamp(baseMood - hunger * 0.18 - stress * 0.24 - sleepDebt * 0.12 - Math.max(0, 65 - hygiene) * 0.1 - fatigue * 0.1, 0, 100);
  if (score >= 75) return { score, band: "inspired", label: "고양" };
  if (score >= 55) return { score, band: "steady", label: "안정" };
  if (score >= 35) return { score, band: "strained", label: "긴장" };
  return { score, band: "low", label: "저하" };
}

export function getMoodWorkMultiplier(member = {}) {
  const { band } = deriveCrewMood(member);
  if (band === "inspired") return 1.12;
  if (band === "steady") return 1;
  if (band === "strained") return 0.94;
  if (band === "low") return 0.88;
  return 1;
}
