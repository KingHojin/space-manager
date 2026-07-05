export const rarityBuildRules = {
  common: { purchaseCredits: 180, craftMinutes: 120, installCredits: 60, installMinutes: 45, upgradeCredits: 140, upgradeMinutes: 90 },
  uncommon: { purchaseCredits: 360, craftMinutes: 180, installCredits: 110, installMinutes: 75, upgradeCredits: 260, upgradeMinutes: 150 },
  rare: { purchaseCredits: 760, craftMinutes: 300, installCredits: 190, installMinutes: 120, upgradeCredits: 520, upgradeMinutes: 240 },
  epic: { purchaseCredits: 1400, craftMinutes: 480, installCredits: 320, installMinutes: 210, upgradeCredits: 900, upgradeMinutes: 360 },
  legendary: { purchaseCredits: 2600, craftMinutes: 720, installCredits: 520, installMinutes: 360, upgradeCredits: 1600, upgradeMinutes: 540 },
};

export const moduleRecipes = {
  "gravity-sling": { items: [{ id: "tritanium", qty: 4 }, { id: "ion-core", qty: 1 }] },
  "comet-chaser": { items: [{ id: "ancient-coordinate", qty: 1 }, { id: "ion-core", qty: 1 }] },
  "solar-sail-array": { items: [{ id: "thermal-carapace", qty: 2 }, { id: "tritanium", qty: 3 }] },
  "rift-jump-core": { items: [{ id: "rift-claw", qty: 2 }, { id: "phase-crystal", qty: 1 }] },
  "zero-point-thruster": { items: [{ id: "singularity-tooth", qty: 1 }, { id: "time-scale", qty: 1 }, { id: "seraphim-core", qty: 1 }] },

  "coil-spear": { items: [{ id: "tritanium", qty: 3 }] },
  "thermal-lance": { items: [{ id: "thermal-carapace", qty: 2 }, { id: "machine-fang", qty: 1 }] },
  "nebula-piercer": { items: [{ id: "resonance-sac", qty: 1 }, { id: "charged-eye", qty: 1 }] },
  "phase-cutter": { items: [{ id: "phase-crystal", qty: 1 }, { id: "rift-claw", qty: 1 }] },
  "gravity-collapse-cannon": { items: [{ id: "singularity-tooth", qty: 2 }, { id: "living-alloy-bone", qty: 1 }] },

  "missile-rack": { items: [{ id: "machine-fang", qty: 1 }, { id: "tritanium", qty: 2 }] },
  "ew-pod": { items: [{ id: "tactical-ai-chip", qty: 1 }, { id: "quantum-circuit", qty: 1 }] },
  "bio-tracker-turret": { items: [{ id: "charged-eye", qty: 1 }, { id: "bio-fiber", qty: 2 }] },
  "interceptor-drone-hangar": { items: [{ id: "quantum-circuit", qty: 2 }, { id: "tactical-ai-chip", qty: 1 }] },
  "orbital-mine-layer": { items: [{ id: "blackbox", qty: 1 }, { id: "tritanium", qty: 6 }] },

  "ceramic-plating": { items: [{ id: "alloy-plate", qty: 3 }] },
  "ion-absorption-film": { items: [{ id: "ion-core", qty: 1 }, { id: "mirror-scale", qty: 1 }] },
  "gravity-deflector": { items: [{ id: "rift-claw", qty: 1 }, { id: "alloy-plate", qty: 5 }] },
  "phase-shroud": { items: [{ id: "phase-crystal", qty: 1 }, { id: "void-feather", qty: 1 }] },
  "seraphim-barrier": { items: [{ id: "seraphim-heart", qty: 1 }, { id: "seraphim-core", qty: 1 }, { id: "living-alloy-bone", qty: 1 }] },

  "mineral-compressor": { items: [{ id: "alloy-plate", qty: 2 }, { id: "tritanium", qty: 5 }] },
  "cryo-bio-vault": { items: [{ id: "frozen-spine", qty: 1 }, { id: "bio-fiber", qty: 2 }] },
  "smuggler-cache": { items: [{ id: "black-market-token", qty: 1 }, { id: "pirate-beacon", qty: 1 }] },
  "auto-sorter-grid": { items: [{ id: "quantum-circuit", qty: 1 }, { id: "blackbox", qty: 1 }] },
  "pocket-dimension-hold": { items: [{ id: "time-scale", qty: 1 }, { id: "singularity-tooth", qty: 1 }, { id: "void-map", qty: 1 }] },

  "tactical-oracle-ai": { items: [{ id: "tactical-ai-chip", qty: 1 }, { id: "blackbox", qty: 1 }] },
  "xenobiology-lab": { items: [{ id: "spore-core", qty: 1 }, { id: "cryo-sample", qty: 1 }] },
  "black-market-relay": { items: [{ id: "black-market-token", qty: 2 }, { id: "pirate-beacon", qty: 1 }] },
  "quantum-nav-computer": { items: [{ id: "quantum-circuit", qty: 2 }, { id: "ancient-coordinate", qty: 1 }] },
  "omega-relic-core": { items: [{ id: "crown-neural-core", qty: 1 }, { id: "seraphim-core", qty: 1 }, { id: "void-map", qty: 1 }] },
};

export function getModuleRule(module) {
  const base = rarityBuildRules[module?.rarity] ?? rarityBuildRules.common;
  const recipe = moduleRecipes[module?.id] ?? { items: [] };
  return { ...base, items: recipe.items ?? [] };
}

export function hasRequiredItems(items, requirements = []) {
  return requirements.every((requirement) => {
    const owned = items.find((item) => item.id === requirement.id)?.qty ?? 0;
    return owned >= requirement.qty;
  });
}

export function formatMinutes(minutes) {
  if (minutes < 60) return `${minutes}분`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem ? `${hours}시간 ${rem}분` : `${hours}시간`;
}
