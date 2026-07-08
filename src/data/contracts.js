// NOTE (survey-contracts-mapmodal fix): survey-type contracts used to target
// a fixed legacy zone id (data/sectors.js vocabulary, e.g. "blue-drift"),
// checked against explorationStore.scannedZoneIds. That store field has had
// zero write callers since Phase 18-C (scanZone/exploreZone/moveToZone are
// dead actions), so scannedZoneIds never grows past its initial value and
// survey contracts could never be completed. Navigation now runs on navStore's
// procedurally generated sector (systems/navigationSystem.js#generateSector),
// which has no relationship to the old fixed zone ids. Survey contracts are
// rewired to target a node *type* (the live vocabulary in data/navEncounters.js
// NODE_TYPE_LABELS: station/nebula/debris/distress/unknown/exit) and are
// completed by visiting a matching node in the current sector — see
// systems/navigationSystem.js#hasVisitedNodeType and its use in Market.jsx.
//
// The other contract types (delivery/salvage/hunt/artifact) are completed by
// item-quantity checks only (see Market.jsx#canCompleteContract) and never
// read targetZoneId for logic. A repo-wide grep turned up no other reader of
// targetZoneId either, so the field has been dropped from those contracts
// rather than kept as unused/misleading metadata pointing at zones that no
// longer exist on the live map.
export const contracts = [
  {
    id: "blue-drift-survey",
    title: "성운 정밀 조사",
    type: "survey",
    factionId: "frontier-guild",
    targetNodeType: "nebula",
    rewardCredits: 260,
    rewardDust: 28,
    rep: 2,
    requirement: "성운(nebula) 노드 1곳 방문 조사 완료",
    desc: "개척자 조합이 성운 입자 밀도 데이터를 요구합니다. 현재 섹터에서 성운 노드를 방문하면 완료됩니다.",
  },
  {
    id: "copper-moon-mining",
    title: "구리 달 광물 운송",
    type: "delivery",
    factionId: "orion-cartel",
    rewardCredits: 420,
    rewardDust: 10,
    rep: 2,
    itemId: "tritanium",
    itemQty: 2,
    requirement: "트리타늄 2개 납품",
    desc: "오리온 카르텔이 고순도 광물 샘플을 매입합니다.",
  },
  {
    id: "silent-orbit-blackbox",
    title: "무음 궤도 블랙박스 회수",
    type: "salvage",
    factionId: "federation",
    rewardCredits: 520,
    rewardDust: 18,
    rep: 3,
    itemId: "blackbox",
    itemQty: 1,
    requirement: "함선 블랙박스 1개 회수",
    desc: "연방 조사국이 오래된 난파선 기록장치를 찾고 있습니다.",
  },
  {
    id: "void-manta-sample",
    title: "공허 만타 생체 샘플",
    type: "hunt",
    factionId: "frontier-guild",
    rewardCredits: 360,
    rewardDust: 24,
    rep: 2,
    itemId: "alien-spore",
    itemQty: 1,
    requirement: "외계 포자 1개 납품",
    desc: "생물학 연구팀이 생체 흔적을 요구합니다.",
  },
  {
    id: "veil-gate-signal",
    title: "장막 관문 신호 해독",
    type: "artifact",
    factionId: "ancient-signal",
    rewardCredits: 680,
    rewardDust: 55,
    rep: 4,
    itemId: "ancient-relay",
    itemQty: 1,
    requirement: "고대 중계기 1개 분석",
    desc: "고대 신호체와 접속 가능한 중계 데이터를 확보해야 합니다.",
  },
];

export const getContractById = (id) => contracts.find((contract) => contract.id === id);
