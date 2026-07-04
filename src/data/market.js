export const marketSupplies = [
  {
    id: "fuel-cell",
    name: "압축 연료 셀",
    description: "장거리 항해를 위한 표준 추진제 카트리지입니다.",
    resource: "fuel",
    amount: 28,
    cap: 120,
    price: 240,
  },
  {
    id: "oxygen-pack",
    name: "순환 산소 팩",
    description: "생명 유지 장치에 바로 연결할 수 있는 고순도 산소 팩입니다.",
    resource: "oxygen",
    amount: 24,
    cap: 120,
    price: 210,
  },
  {
    id: "repair-drone",
    name: "선체 수리 드론",
    description: "외부 장갑 균열과 미세 운석 충돌 흔적을 자동으로 보수합니다.",
    resource: "hull",
    amount: 18,
    cap: 100,
    price: 320,
  },
];

export const recruitCandidates = [
  {
    id: "scout-lee",
    name: "이 라온",
    role: "정찰",
    morale: "좋음",
    injury: "정상",
    fee: 650,
    pitch: "미확인 구역 스캔과 은밀 항로 개척에 능한 외연 정찰병입니다.",
    stats: { piloting: 10, gunnery: 7, engineering: 8, medicine: 6, scouting: 17 },
  },
  {
    id: "broker-choi",
    name: "최 미르",
    role: "교섭",
    morale: "보통",
    injury: "정상",
    fee: 720,
    pitch: "정거장 네트워크와 암시장 정보를 활용하는 보급 협상가입니다.",
    stats: { piloting: 7, gunnery: 6, engineering: 11, medicine: 9, scouting: 13 },
  },
];
