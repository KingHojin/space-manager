export const sectors = [
  {
    id: "helios-rim",
    name: "헬리오스 외연",
    description: "낡은 항로와 미확인 잔해대가 얽힌 초반 탐험 성계입니다.",
    zones: [
      { id: "anchor-station", name: "앵커 정거장", type: "station", danger: 1, richness: 1, distance: 0, discovered: true, pos: { x: 18, y: 72 } },
      { id: "blue-drift", name: "청색 표류대", type: "nebula", danger: 2, richness: 3, distance: 2, discovered: true, pos: { x: 31, y: 48 } },
      { id: "mare-ruins", name: "마레 폐허", type: "ruin", danger: 3, richness: 4, distance: 4, discovered: false, pos: { x: 47, y: 60 } },
      { id: "ion-reef", name: "이온 암초", type: "anomaly", danger: 2, richness: 2, distance: 3, discovered: false, pos: { x: 42, y: 28 } },
      { id: "black-garden", name: "검은 정원", type: "creature", danger: 4, richness: 5, distance: 6, discovered: false, pos: { x: 61, y: 38 } },
      { id: "copper-moon", name: "구리 달", type: "mining", danger: 1, richness: 4, distance: 5, discovered: false, pos: { x: 58, y: 76 } },
      { id: "veil-gate", name: "장막 관문", type: "gate", danger: 5, richness: 3, distance: 8, discovered: false, pos: { x: 82, y: 30 } },
      { id: "silent-orbit", name: "무음 궤도", type: "wreck", danger: 3, richness: 2, distance: 7, discovered: false, pos: { x: 76, y: 62 } },
    ],
  },
  {
    id: "orion-expanse",
    name: "오리온 확장구역",
    description: "연방 개척선단과 기업 탐사대가 경쟁하는 중반 성계입니다.",
    zones: [
      { id: "vesta-prime", name: "베스타 프라임", type: "colony", danger: 2, richness: 4, distance: 9, discovered: false, pos: { x: 18, y: 26 } },
      { id: "helix-gate", name: "헬릭스 게이트", type: "gate", danger: 3, richness: 3, distance: 11, discovered: false, pos: { x: 30, y: 20 } },
      { id: "nyxia-lab", name: "닉시아 연구소", type: "research", danger: 3, richness: 5, distance: 12, discovered: false, pos: { x: 42, y: 18 } },
      { id: "sable-point", name: "세이블 포인트", type: "market", danger: 1, richness: 3, distance: 13, discovered: false, pos: { x: 56, y: 24 } },
      { id: "koros-field", name: "코로스 파편장", type: "mining", danger: 4, richness: 5, distance: 15, discovered: false, pos: { x: 67, y: 18 } },
      { id: "x93-redline", name: "X-93 레드라인", type: "pirate", danger: 5, richness: 4, distance: 16, discovered: false, pos: { x: 78, y: 22 } },
      { id: "taranis-belt", name: "타라니스 벨트", type: "anomaly", danger: 4, richness: 4, distance: 17, discovered: false, pos: { x: 88, y: 40 } },
      { id: "draco-veil", name: "드라코 장막", type: "nebula", danger: 5, richness: 5, distance: 18, discovered: false, pos: { x: 74, y: 48 } },
    ],
  },
  {
    id: "eos-frontier",
    name: "에오스 변경지대",
    description: "장거리 항해와 생명체 조사가 본격적으로 열리는 고위험 탐험권입니다.",
    zones: [
      { id: "eos-harbor", name: "에오스 항구", type: "station", danger: 2, richness: 2, distance: 19, discovered: false, pos: { x: 12, y: 42 } },
      { id: "glass-comet", name: "유리 혜성", type: "ice", danger: 3, richness: 4, distance: 20, discovered: false, pos: { x: 24, y: 38 } },
      { id: "murmur-nest", name: "속삭임 둥지", type: "creature", danger: 5, richness: 5, distance: 22, discovered: false, pos: { x: 36, y: 45 } },
      { id: "pale-library", name: "창백한 도서관", type: "ruin", danger: 4, richness: 5, distance: 23, discovered: false, pos: { x: 49, y: 36 } },
      { id: "red-harvest", name: "붉은 수확대", type: "mining", danger: 4, richness: 5, distance: 25, discovered: false, pos: { x: 60, y: 52 } },
      { id: "choir-wreck", name: "성가대 난파선", type: "wreck", danger: 5, richness: 4, distance: 26, discovered: false, pos: { x: 72, y: 56 } },
      { id: "ark-light", name: "아크 등대", type: "research", danger: 3, richness: 5, distance: 27, discovered: false, pos: { x: 82, y: 66 } },
      { id: "obsidian-tide", name: "흑요석 조류", type: "anomaly", danger: 5, richness: 5, distance: 28, discovered: false, pos: { x: 90, y: 74 } },
    ],
  },
  {
    id: "umbra-core",
    name: "엄브라 심층권",
    description: "고대 AI, 블랙홀, 군사 잔존세력이 뒤섞인 후반 성계입니다.",
    zones: [
      { id: "umbra-relay", name: "엄브라 중계소", type: "station", danger: 3, richness: 3, distance: 30, discovered: false, pos: { x: 16, y: 84 } },
      { id: "dead-admiral", name: "죽은 제독의 묘역", type: "wreck", danger: 5, richness: 5, distance: 32, discovered: false, pos: { x: 31, y: 82 } },
      { id: "gravemind-array", name: "그레이브마인드 배열", type: "defense", danger: 6, richness: 5, distance: 34, discovered: false, pos: { x: 46, y: 84 } },
      { id: "black-crown", name: "검은 왕관", type: "blackhole", danger: 6, richness: 4, distance: 36, discovered: false, pos: { x: 58, y: 88 } },
      { id: "aether-foundry", name: "에테르 주조소", type: "ruin", danger: 5, richness: 6, distance: 38, discovered: false, pos: { x: 70, y: 82 } },
      { id: "last-market", name: "마지막 시장", type: "market", danger: 4, richness: 5, distance: 39, discovered: false, pos: { x: 83, y: 78 } },
      { id: "seraphim-vault", name: "세라핌 금고", type: "ruin", danger: 6, richness: 6, distance: 41, discovered: false, pos: { x: 90, y: 64 } },
      { id: "zero-throne", name: "제로 왕좌", type: "defense", danger: 7, richness: 7, distance: 45, discovered: false, pos: { x: 94, y: 52 } },
    ],
  },
];

export const getAllZones = () => sectors.flatMap((sector) => sector.zones.map((zone) => ({ ...zone, sectorId: sector.id })));

export const getZoneById = (zoneId) => getAllZones().find((zone) => zone.id === zoneId);
