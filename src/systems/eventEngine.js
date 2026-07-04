const events = [
  "장거리 센서가 희미한 구조 신호를 포착했습니다.",
  "화물칸에서 미세 운석 충돌 흔적이 발견되었습니다.",
  "집진기가 평소보다 짙은 우주 먼지 층을 통과하고 있습니다.",
  "정거장 통신망에 희귀 모듈 매물이 올라왔습니다.",
];

export const rollEvent = (chance = 0.18) => {
  if (Math.random() > chance) return null;
  return events[Math.floor(Math.random() * events.length)];
};
