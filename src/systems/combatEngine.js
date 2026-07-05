const moraleScore = {
  나쁨: -4,
  보통: 0,
  좋음: 4,
  최상: 8,
};

export const ENEMY_FLEETS = [
  { id: "raider-wing", name: "약탈자 편대", hull: 62, shield: 34, power: 58, reward: 260, risk: 2 },
  { id: "corsair-pack", name: "코르세어 무리", hull: 78, shield: 46, power: 76, reward: 380, risk: 3 },
  { id: "drone-swarm", name: "무인기 군집", hull: 55, shield: 70, power: 82, reward: 420, risk: 4 },
  { id: "ancient-warden", name: "고대 감시자", hull: 96, shield: 88, power: 116, reward: 720, risk: 5 },
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
  };
}

function roll(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function resolveCombatRound({ directive, combat, power }) {
  if (!combat || combat.status !== "engaged") return { combat, logs: ["교전 대상이 없습니다."], resourceChanges: {} };

  const next = { ...combat, enemy: { ...combat.enemy } };
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

  const enemyPressure = Math.max(2, Math.round((next.enemy.power / 12 + roll(2, 10)) * directiveBonus.taken));
  const resourceChanges = {
    hull: -Math.max(0, Math.round(enemyPressure * 0.55)),
    oxygen: directive === "shield" ? -2 : 0,
    fuel: directive === "evade" || directive === "retreat" ? -3 : -1,
  };

  const logs = [
    `R${combat.round} ${directiveBonus.label}: 적 방어막 ${shieldDamage}, 선체 ${hullDamage} 피해.`,
    `적 반격으로 선체 ${Math.abs(resourceChanges.hull)}%, 연료 ${Math.abs(resourceChanges.fuel)} 소모.`,
  ];

  if (next.enemy.hullNow <= 0) {
    next.status = "won";
    logs.unshift(`${next.enemy.name} 제압 성공. 전리품 회수 가능.`);
    resourceChanges.credits = next.enemy.reward;
  } else if (directive === "retreat" && Math.random() > 0.35) {
    next.status = "retreated";
    logs.unshift("도주 항로 확보. 교전을 이탈했습니다.");
  } else {
    next.round += 1;
  }

  return { combat: next, logs, resourceChanges };
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
