export const factions = [
  {
    id: "federation",
    name: "지구연방",
    style: "질서·검문·안전항로",
    desc: "정거장 보급과 공식 의뢰를 장악한 안정 세력입니다.",
    color: "cyan",
    startReputation: 8,
  },
  {
    id: "frontier-guild",
    name: "개척자 조합",
    style: "탐험·채굴·구조",
    desc: "변경지대 항해사와 채굴선들이 만든 실전형 네트워크입니다.",
    color: "emerald",
    startReputation: 6,
  },
  {
    id: "orion-cartel",
    name: "오리온 카르텔",
    style: "기업·시장·고가 모듈",
    desc: "수익을 최우선으로 움직이는 기업 연합입니다.",
    color: "amber",
    startReputation: 0,
  },
  {
    id: "void-corsairs",
    name: "공허 해적단",
    style: "위험거래·전투·밀수",
    desc: "외곽 항로에서 활동하는 무장 세력입니다.",
    color: "red",
    startReputation: -6,
  },
  {
    id: "ancient-signal",
    name: "고대 신호체",
    style: "유물·AI·심층권",
    desc: "폐허와 관문에 남아 있는 미지성 네트워크입니다.",
    color: "violet",
    startReputation: 0,
  },
];

export const getFactionById = (id) => factions.find((faction) => faction.id === id);

export const initialReputation = Object.fromEntries(factions.map((faction) => [faction.id, faction.startReputation]));
