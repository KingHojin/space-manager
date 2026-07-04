export const sectors = [
  {
    id: "helios-rim",
    name: "헬리오스 외연",
    description: "낡은 항로와 미확인 잔해대가 얽힌 초반 탐험 성계입니다.",
    zones: [
      { id: "anchor-station", name: "앵커 정거장", type: "station", danger: 1, richness: 1, distance: 0, discovered: true },
      { id: "blue-drift", name: "청색 표류대", type: "nebula", danger: 2, richness: 3, distance: 2, discovered: true },
      { id: "mare-ruins", name: "마레 폐허", type: "ruin", danger: 3, richness: 4, distance: 4, discovered: false },
      { id: "ion-reef", name: "이온 암초", type: "anomaly", danger: 2, richness: 2, distance: 3, discovered: false },
      { id: "black-garden", name: "검은 정원", type: "creature", danger: 4, richness: 5, distance: 6, discovered: false },
      { id: "copper-moon", name: "구리 달", type: "mining", danger: 1, richness: 4, distance: 5, discovered: false },
      { id: "veil-gate", name: "장막 관문", type: "gate", danger: 5, richness: 3, distance: 8, discovered: false },
      { id: "silent-orbit", name: "무음 궤도", type: "wreck", danger: 3, richness: 2, distance: 7, discovered: false },
    ],
  },
];

export const getAllZones = () => sectors.flatMap((sector) => sector.zones.map((zone) => ({ ...zone, sectorId: sector.id })));

export const getZoneById = (zoneId) => getAllZones().find((zone) => zone.id === zoneId);
