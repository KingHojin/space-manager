export const calculateCombatPower = ({ modules, crew, activeCards }) => {
  const modulePower = modules.reduce((sum, module) => sum + (module.stats.attack || 0) + (module.stats.defense || 0), 0);
  const crewPower = crew.reduce((sum, member) => sum + member.stats.gunnery + Math.floor(member.stats.engineering / 2), 0);
  const cardBonus = activeCards.some((card) => card.id === "battle-focus") ? 1.05 : 1;
  return Math.round((modulePower + crewPower) * cardBonus);
};

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
