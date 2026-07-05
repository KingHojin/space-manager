const moraleScore = {
  나쁨: -4,
  보통: 0,
  좋음: 4,
  최상: 8,
};

export const ENEMY_FLEETS = [
  { id: "scrap-raider", name: "폐품 약탈선", hull: 44, shield: 22, power: 40, reward: 140, risk: 1, lootItemId: "machine-fang", lootItemQty: 1 },
  { id: "raider-wing", name: "약탈자 편대", hull: 62, shield: 34, power: 58, reward: 260, risk: 2, lootItemId: "pirate-beacon", lootItemQty: 1 },
  { id: "smuggler-escort", name: "밀수업자 호위대", hull: 50, shield: 38, power: 54, reward: 310, risk: 2, lootItemId: "black-market-token", lootItemQty: 1 },
  { id: "corsair-pack", name: "코르세어 무리", hull: 78, shield: 46, power: 76, reward: 380, risk: 3, lootItemId: "blackbox", lootItemQty: 1 },
  { id: "pirate-missile-craft", name: "해적 미사일정", hull: 68, shield: 32, power: 88, reward: 420, risk: 3, lootItemId: "tactical-ai-chip", lootItemQty: 1 },
  { id: "corporate-security-drone", name: "기업 경비 드론", hull: 58, shield: 82, power: 86, reward: 430, risk: 3, lootItemId: "quantum-circuit", lootItemQty: 1 },
  { id: "checkpoint-patrol", name: "검문 순찰함", hull: 84, shield: 58, power: 82, reward: 390, risk: 3, lootItemId: "federation-permit", lootItemQty: 1 },
  { id: "drone-swarm", name: "무인기 군집", hull: 55, shield: 70, power: 82, reward: 420, risk: 4, lootItemId: "quantum-circuit", lootItemQty: 1 },
  { id: "nanite-drone-cloud", name: "나노 무인기 떼", hull: 60, shield: 92, power: 98, reward: 520, risk: 4, lootItemId: "nanite-gel", lootItemQty: 1 },
  { id: "heretic-nav-cult", name: "이단 항법단", hull: 86, shield: 62, power: 104, reward: 560, risk: 4, lootItemId: "ancient-coordinate", lootItemQty: 1 },
  { id: "ancient-warden", name: "고대 감시자", hull: 96, shield: 88, power: 116, reward: 720, risk: 5, lootItemId: "ancient-relay", lootItemQty: 1 },
  { id: "ancient-defense-array", name: "고대 방어 포대", hull: 122, shield: 112, power: 130, reward: 840, risk: 5, lootItemId: "phase-crystal", lootItemQty: 1 },
  { id: "blackbox-guardian", name: "블랙박스 수호함", hull: 108, shield: 94, power: 124, reward: 900, risk: 5, lootItemId: "blackbox", lootItemQty: 2 },
  { id: "umbra-battlecruiser", name: "엄브라 전투순양함", hull: 148, shield: 126, power: 158, reward: 1180, risk: 6, lootItemId: "void-map", lootItemQty: 1 },
  { id: "zero-throne-guard", name: "제로 왕좌 근위대", hull: 178, shield: 150, power: 190, reward: 1600, risk: 7, lootItemId: "crown-neural-core", lootItemQty: 1 },
  { id: "seraphim-auto-fleet", name: "세라핌 자동함대", hull: 164, shield: 182, power: 202, reward: 1800, risk: 7, lootItemId: "seraphim-core", lootItemQty: 1 },
];

export const calculateCombatPower = ({ modules, crew, activeCards }) => {
  const modulePower = modules.reduce(
    (sum, module) => sum + (module.stats.attack || 0) + (module.stats.defense || 0) + Math.floor((module.stats.control || 0) / 2),
    0,
  );
  const crewPower = crew.reduce(
    (sum, member) =>
      sum +
      member.stats.gunnery +
      Math.floor(member.stats.engineering / 2) +
      Math.floor(member.stats.piloting / 3) +
      Math.floor(member.stats.scouting / 4) +
      (moraleScore[member.morale] ?? 0) -
      Math.floor((member.fatigue ?? 0) / 20) -
      (member.injury === "정상" ? 0 : 8),
    0,
  );
  const cardBonus = activeCards.some((card) => card.id === "battle-focus") ? 1.05 : 1;
  return Math.max(1, Math.round((modulePower + crewPower) * cardBonus));
};

export function pickEnemyFleet(danger = 2) {
  const pool = ENEMY_FLEETS.filter((fleet) => fleet.risk <= Math.max(2, danger + 1));
  return pool[Math.floor(Math.random() * pool.length)] ?? ENEMY_FLEETS[0];
}

export function createCombatState(enemyTemplate) {
  return {
    round: 1,
    enemy: { ...enemyTemplate, hullNow: enemyTemplate.hull, shieldNow: enemyTemplate.shield },
    status: "engaged",
    lastDirective: "standby",
    lastDamage: 0,
    lastTaken: 0,
  };
}

function roll(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function resolveCombatRound({ directive, combat, power }) {
  if (!combat || combat.status !== "engaged") return { combat, logs: ["교전 대상이 없습니다."], resourceChanges: {}, loot: null };

  const next = { ...combat, enemy: { ...combat.enemy }, lastDirective: directive };
  const directiveBonus = {
    attack: { damage: 1.35, taken: 1.12, label: "공격 집중" },
    evade: { damage: 0.78, taken: 0.58, label: "회피 기동" },
    shield: { damage: 0.9, taken: 0.42, label: "방어막 강화" },
    retreat: { damage: 0.35, taken: 0.5, label: "도주 시도" },
    skill: { damage: 1.12, taken: 0.8, label: "카드 발동" },
  }[directive] ?? { damage: 1, taken: 1, label: "표준 교전" };

  const baseDamage = Math.max(6, Math.round((power / 8 + roll(4, 14)) * directiveBonus.damage));
  const shieldDamage = Math.min(next.enemy.shieldNow, Math.round(baseDamage * 0.65));
  const hullDamage = Math.max(0, baseDamage - shieldDamage);
  next.enemy.shieldNow = Math.max(0, next.enemy.shieldNow - shieldDamage);
  next.enemy.hullNow = Math.max(0, next.enemy.hullNow - hullDamage);
  next.lastDamage = shieldDamage + hullDamage;

  const enemyPressure = Math.max(2, Math.round((next.enemy.power / 12 + roll(2, 10)) * directiveBonus.taken));
  const resourceChanges = {
    hull: -Math.max(0, Math.round(enemyPressure * 0.55)),
    oxygen: directive === "shield" ? -2 : 0,
    fuel: directive === "evade" || directive === "retreat" ? -3 : -1,
  };
  next.lastTaken = Math.abs(resourceChanges.hull);

  const logs = [
    `R${combat.round} ${directiveBonus.label}: 적 방어막 ${shieldDamage}, 선체 ${hullDamage} 피해.`,
    `적 반격으로 선체 ${Math.abs(resourceChanges.hull)}%, 연료 ${Math.abs(resourceChanges.fuel)} 소모.`,
  ];

  let loot = null;
  if (next.enemy.hullNow <= 0) {
    next.status = "won";
    logs.unshift(`${next.enemy.name} 제압 성공. 전리품 회수 가능.`);
    resourceChanges.credits = next.enemy.reward;
    if (next.enemy.lootItemId) {
      loot = { itemId: next.enemy.lootItemId, qty: next.enemy.lootItemQty ?? 1 };
      logs.push(`전리품 확보: ${next.enemy.lootItemId} x${next.enemy.lootItemQty ?? 1}.`);
    }
  } else if (directive === "retreat" && Math.random() > 0.35) {
    next.status = "retreated";
    logs.unshift("도주 항로 확보. 교전을 이탈했습니다.");
  } else {
    next.round += 1;
  }

  return { combat: next, logs, resourceChanges, loot };
}

export const getCombatDirectiveResult = (directive) => {
  const table = {
    attack: "포탑이 목표의 장갑 이음새를 집중 조준합니다.",
    evade: "조타수가 잔해 구름 뒤로 함선을 미끄러뜨립니다.",
    shield: "기관실이 방어막 전력을 끌어올립니다.",
    retreat: "항법 컴퓨터가 가장 가까운 정거장 항로를 계산합니다.",
    skill: "활성 카드의 전술 효과가 함교에 전개됩니다.",
  };
  return table[directive] || "함교가 다음 지시를 기다립니다.";
};
