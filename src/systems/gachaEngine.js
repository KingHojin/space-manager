import { cards } from "../data/cards";
import { GACHA_RATES } from "../data/constants";

const pickRarity = (guaranteeRare = false) => {
  if (guaranteeRare) {
    const premium = GACHA_RATES.filter((entry) => ["rare", "epic", "legendary"].includes(entry.rarity));
    const total = premium.reduce((sum, entry) => sum + entry.rate, 0);
    let roll = Math.random() * total;
    for (const entry of premium) {
      roll -= entry.rate;
      if (roll <= 0) return entry.rarity;
    }
    return "rare";
  }

  let roll = Math.random();
  for (const entry of GACHA_RATES) {
    roll -= entry.rate;
    if (roll <= 0) return entry.rarity;
  }
  return "common";
};

export const drawCard = (guaranteeRare = false) => {
  const rarity = pickRarity(guaranteeRare);
  const pool = cards.filter((card) => card.rarity === rarity);
  return pool[Math.floor(Math.random() * pool.length)];
};

export const drawCards = (count) =>
  Array.from({ length: count }, (_, index) => drawCard(count >= 10 && index === count - 1));
