const EVENT_POOLS = {
  station: [
    { title: "정비 슬롯 확보", message: "정거장 관제소가 짧은 정비 시간을 내줬습니다.", resources: { hull: 6 }, credits: -40 },
    { title: "상인 정보 입수", message: "항로 상인이 근처 미확인 신호 좌표를 넘겼습니다.", revealCount: 1, dust: 8 },
  ],
  nebula: [
    { title: "성운 입자 채집", message: "센서에 반응하는 고밀도 입자를 회수했습니다.", dust: 22, itemId: "phase-crystal", itemQty: 1 },
    { title: "센서 교란", message: "전리층 간섭으로 항법 컴퓨터가 흔들렸습니다.", resources: { oxygen: -4, fuel: -3 }, dust: 12 },
  ],
  ruin: [
    { title: "고대 좌표판 해독", message: "낡은 구조물 내부에서 다음 항로의 단서를 찾았습니다.", revealCount: 2, itemId: "ancient-relay", itemQty: 1 },
    { title: "봉인된 보관실", message: "부분적으로 열린 보관실에서 유물 파편을 회수했습니다.", credits: 160, dust: 18, itemId: "void-map", itemQty: 1 },
  ],
  anomaly: [
    { title: "중력 왜곡 분석", message: "위험한 왜곡을 통과했지만 귀중한 분석 데이터를 얻었습니다.", resources: { hull: -5, fuel: -4 }, dust: 28 },
    { title: "안정 항로 계산", message: "항법팀이 새로운 우회 항로를 계산했습니다.", revealCount: 1, resources: { fuel: 5 } },
  ],
  creature: [
    { title: "생체 신호 포착", message: "미확인 생명체의 흔적을 기록했습니다.", dust: 20, itemId: "alien-spore", itemQty: 1 },
    { title: "군체 접근 경고", message: "근처 생체 군집이 함선 열원을 따라붙었습니다.", resources: { hull: -4, oxygen: -3 }, alert: 1 },
  ],
  mining: [
    { title: "광맥 노출", message: "표면 스캔으로 고순도 광물층을 찾아냈습니다.", credits: 220, itemId: "tritanium", itemQty: 6 },
    { title: "채굴 드론 회수", message: "버려진 자동 드론에서 쓸 만한 부품을 챙겼습니다.", itemId: "ion-core", itemQty: 1, dust: 12 },
  ],
  gate: [
    { title: "관문 잔향 분석", message: "관문 잔향이 먼 구역의 좌표를 비췄습니다.", revealCount: 2, resources: { fuel: -3 } },
    { title: "불안정 워프 흔적", message: "항로는 열렸지만 함선 시스템에 부담이 걸렸습니다.", resources: { hull: -6 }, dust: 26 },
  ],
  wreck: [
    { title: "블랙박스 회수", message: "난파선 기록장치를 확보했습니다. 시장에서 높은 가격을 받을 수 있습니다.", itemId: "blackbox", itemQty: 1, credits: 120 },
    { title: "밀폐 격실 개방", message: "격실 내부에서 보급품과 나노머신 겔을 회수했습니다.", itemId: "nanite-gel", itemQty: 1, resources: { oxygen: 4 } },
  ],
  colony: [
    { title: "개척지 의뢰", message: "현지 행정관이 보급 운송 의뢰를 제안했습니다.", credits: 180, dust: 8 },
    { title: "민간 항로 갱신", message: "개척민들이 공유한 항로 데이터가 성계도에 반영됐습니다.", revealCount: 1 },
  ],
  market: [
    { title: "희귀상 접촉", message: "떠돌이 상인이 유물 감정 정보를 남겼습니다.", credits: 90, itemId: "survey-probe", itemQty: 1 },
    { title: "보급가 안정", message: "시장 가격이 잠시 안정되어 자원 운용에 여유가 생겼습니다.", resources: { fuel: 6, oxygen: 5 } },
  ],
  research: [
    { title: "연구 데이터 회수", message: "미완성 실험 데이터를 복구했습니다.", dust: 24, itemId: "cryo-sample", itemQty: 1 },
    { title: "실험실 안전장치", message: "낡은 자동장치가 작동하며 함선 시스템을 검사했습니다.", resources: { hull: 3, oxygen: -2 }, revealCount: 1 },
  ],
  pirate: [
    { title: "수상한 비컨 감지", message: "수상한 비컨을 분석해 근처 불안정 구역의 위치를 추정했습니다.", revealCount: 1, itemId: "pirate-beacon", itemQty: 1, alert: 1 },
    { title: "회피 항로 확보", message: "함교가 불안정권을 비껴가는 임시 항로를 잡았습니다.", resources: { fuel: -6, hull: 2 }, dust: 16 },
  ],
  ice: [
    { title: "빙결 수원 확보", message: "얼음층에서 산소 전환에 쓸 수 있는 자원을 얻었습니다.", resources: { oxygen: 8 }, itemId: "cryo-sample", itemQty: 1 },
    { title: "저온 균열", message: "급격한 온도 변화로 외부 장갑 일부가 손상됐습니다.", resources: { hull: -4 }, dust: 18 },
  ],
  defense: [
    { title: "고대 패턴 기록", message: "고대 자동 구조물의 순환 패턴을 기록했습니다.", dust: 35, alert: 1 },
    { title: "차폐막 과부하", message: "접근 과정에서 차폐막이 과부하됐습니다.", resources: { hull: -7, oxygen: -2 }, itemId: "seraphim-core", itemQty: 1 },
  ],
  blackhole: [
    { title: "사건지평선 관측", message: "위험한 관측이었지만 귀중한 항법 데이터를 얻었습니다.", resources: { fuel: -8, hull: -5 }, dust: 45, revealCount: 1 },
    { title: "시간 지연 보정", message: "항법 컴퓨터가 시간 지연 오차를 보정했습니다.", dust: 30, itemId: "void-map", itemQty: 1 },
  ],
};

const FALLBACK_EVENTS = [
  { title: "표준 스캔", message: "스캐너가 주변 항로와 자원 밀도를 갱신했습니다.", dust: 10 },
  { title: "잡음 제거", message: "불필요한 신호를 제거하고 작은 자원 흔적을 찾았습니다.", credits: 60, dust: 6 },
];

function pickEvent(pool) {
  return pool[Math.floor(Math.random() * pool.length)];
}

function scaleByRichness(value, richness) {
  if (!value) return value;
  return Math.round(value * (1 + Math.max(0, richness - 1) * 0.08));
}

export function resolveScanEvent({ zone, scannedBefore = false }) {
  const pool = [...FALLBACK_EVENTS, ...(EVENT_POOLS[zone?.type] ?? [])];
  const picked = pickEvent(pool);
  const repeatPenalty = scannedBefore ? 0.45 : 1;
  const dust = picked.dust ? Math.max(1, Math.round(scaleByRichness(picked.dust, zone?.richness ?? 1) * repeatPenalty)) : 0;
  const credits = picked.credits ? Math.round(scaleByRichness(picked.credits, zone?.richness ?? 1) * repeatPenalty) : 0;

  return {
    ...picked,
    dust,
    credits,
    repeat: scannedBefore,
    revealCount: scannedBefore ? Math.min(1, picked.revealCount ?? 0) : picked.revealCount ?? 0,
    resources: picked.resources ?? {},
  };
}
