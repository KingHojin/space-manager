import { cards as cardCatalog } from "../data/cards";

const MULT_KEYS = ["fuelConsumptionMult", "oxygenConsumptionMult", "dustCollectionMult", "scanTimeMult", "combatPowerMult", "jobSpeedMult"];
const catalogById = new Map(cardCatalog.map((card) => [card.id, card]));

// 저장된 카드 인스턴스는 뽑기 당시의 카탈로그 복사본이라 이후 추가된
// modifiers 필드가 없을 수 있으므로 id로 카탈로그를 참조해 보완한다.
function cardModifiers(card) {
  return card?.modifiers ?? catalogById.get(card?.id)?.modifiers ?? {};
}

export function getActiveModifiers(activeCards = []) {
  const merged = {};
  MULT_KEYS.forEach((key) => {
    merged[key] = 1;
  });
  activeCards.forEach((card) => {
    Object.entries(cardModifiers(card)).forEach(([key, value]) => {
      if (typeof value !== "number") return;
      merged[key] = (merged[key] ?? 1) * value;
    });
  });
  return merged;
}
