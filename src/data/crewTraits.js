// Phase 21-A: personality trait catalog.
// These traits are display-only for now. Do not read them from gameplay
// formulas until the later Inner Life mood/effect PRs explicitly wire that in.

export const CREW_TRAITS = {
  steady_hand: {
    id: "steady_hand",
    label: "침착함",
    tone: "hud-chip-success",
    description: "위기 상황에서도 말수가 줄고 손이 먼저 움직입니다.",
  },
  curious_mind: {
    id: "curious_mind",
    label: "호기심",
    tone: "hud-chip-accent",
    description: "새 노드와 낯선 장비를 보면 먼저 살펴보려 합니다.",
  },
  by_the_book: {
    id: "by_the_book",
    label: "원칙주의",
    tone: "hud-chip",
    description: "절차와 체크리스트를 신뢰합니다.",
  },
  hotshot: {
    id: "hotshot",
    label: "승부욕",
    tone: "hud-chip-warn",
    description: "전투와 경쟁 상황에서 존재감을 드러내려 합니다.",
  },
  caretaker: {
    id: "caretaker",
    label: "보살핌",
    tone: "hud-chip-success",
    description: "동료의 컨디션 변화를 먼저 알아차리는 편입니다.",
  },
  grease_soul: {
    id: "grease_soul",
    label: "기계친화",
    tone: "hud-chip-accent",
    description: "엔진 소리와 배관 진동에서 함선의 상태를 읽습니다.",
  },
};

export const DEFAULT_CREW_TRAIT_IDS = {
  "captain-yun": ["steady_hand", "by_the_book"],
  "gunner-kang": ["hotshot", "steady_hand"],
  "engineer-min": ["grease_soul", "curious_mind"],
  "medic-rho": ["caretaker", "by_the_book"],
};

export function normalizeCrewTraitIds(traitIds = [], fallbackIds = []) {
  const ids = Array.isArray(traitIds) ? traitIds : [];
  const fallback = Array.isArray(fallbackIds) ? fallbackIds : [];
  const source = ids.length > 0 ? ids : fallback;
  const unique = [];
  source.forEach((id) => {
    if (CREW_TRAITS[id] && !unique.includes(id)) unique.push(id);
  });
  return unique.slice(0, 3);
}

export function getCrewTrait(id) {
  return CREW_TRAITS[id] ?? null;
}
