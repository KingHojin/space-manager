import { CREW_TEMPLATES } from "../data/recruitment";
import { useGameStore } from "../stores/gameStore";
import { useInventoryStore } from "../stores/inventoryStore";
import { useRecruitStore } from "../stores/recruitStore";

const ITEM_REWARD_KEYS = {
  scrap: { itemId: "salvage-scrap", label: "폐자재" },
  chartData: { itemId: "chart-data", label: "항로 데이터" },
  oreSample: { itemId: "ore-sample", label: "광석 샘플" },
  researchData: { itemId: "research-data", label: "연구 데이터" },
  tradeVoucher: { itemId: "trade-voucher", label: "거래권" },
  reputation: { itemId: "reputation-token", label: "평판 증표" },
};

const CHANCE_REWARD_KEYS = {
  blueprintChance: { itemId: "blueprint-fragment", label: "설계도 조각" },
  artifactChance: { itemId: "artifact-cache", label: "유물 캐시" },
  recruitChance: { itemId: "recruit-signal", label: "영입 신호" },
};

function addItemReward(itemId, qty) {
  if (!itemId || qty <= 0) return;
  useInventoryStore.getState().addItem(itemId, qty);
}

function pickRecruitTemplate() {
  if (!CREW_TEMPLATES.length) return null;
  return CREW_TEMPLATES[Math.floor(Math.random() * CREW_TEMPLATES.length) % CREW_TEMPLATES.length];
}

function applyChanceReward(key, chance, logs, itemsAwarded) {
  const config = CHANCE_REWARD_KEYS[key];
  if (!config || typeof chance !== "number" || chance <= 0) return;
  const succeeded = Math.random() < chance;
  if (!succeeded) {
    logs.push(`${config.label} 판정 실패 (${Math.round(chance * 100)}%).`);
    return;
  }
  addItemReward(config.itemId, 1);
  itemsAwarded.push({ itemId: config.itemId, qty: 1, label: config.label });
  logs.push(`${config.label} 획득.`);
  if (key === "recruitChance") {
    const template = pickRecruitTemplate();
    if (!template) return;
    const result = useRecruitStore.getState().addCandidate(template.templateId, "mission");
    logs.push(result.ok ? `영입 후보 발견: ${template.name}.` : `영입 후보 처리 실패: ${result.reason}.`);
  }
}

export function applyMissionRewards(reward = {}) {
  const logs = [];
  const itemsAwarded = [];
  const resourcesAwarded = {};

  if ((reward.credits ?? 0) > 0) {
    const credits = Math.round(reward.credits);
    useGameStore.getState().addResources({ credits });
    resourcesAwarded.credits = credits;
    logs.push(`크레딧 ₢${credits} 지급.`);
  }

  if ((reward.dust ?? 0) > 0) {
    const dust = Math.round(reward.dust);
    useInventoryStore.getState().addDust(dust);
    resourcesAwarded.dust = dust;
    logs.push(`Dust ${dust} 지급.`);
  }

  Object.entries(ITEM_REWARD_KEYS).forEach(([key, config]) => {
    const qty = Math.round(reward[key] ?? 0);
    if (qty <= 0) return;
    addItemReward(config.itemId, qty);
    itemsAwarded.push({ itemId: config.itemId, qty, label: config.label });
    logs.push(`${config.label} x${qty} 지급.`);
  });

  Object.entries(CHANCE_REWARD_KEYS).forEach(([key]) => {
    applyChanceReward(key, reward[key], logs, itemsAwarded);
  });

  return { resourcesAwarded, itemsAwarded, logs };
}
