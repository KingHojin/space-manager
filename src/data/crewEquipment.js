// Phase 27-A deliberately keeps equipment authored and contextual.  These are
// unique shipboard tools, not cargo stacks or a random loot progression track.
export const EQUIPMENT_SLOTS = ["primary", "utility"];

export const CREW_EQUIPMENT = {
  "insulated-torque-rig": { id: "insulated-torque-rig", label: "절연 토크 리그", slot: "primary", contexts: ["engineering"], effect: { durationMinutes: -30, failureTier: -1, combat: { takenReduction: 0.01 } }, description: "기관실 대응 30분 단축, 실패 후유증 한 단계 완화. 전투 기관실 배치 시 피격 1% 감소." },
  "calibration-case": { id: "calibration-case", label: "교정 케이스", slot: "utility", contexts: ["scouting", "greywake"], effect: { durationMinutes: -20 }, description: "센서·GREYWAKE 신호 작업 20분 단축." },
  "trauma-harness": { id: "trauma-harness", label: "외상 하네스", slot: "primary", contexts: ["medicine", "quarantine"], effect: { durationMinutes: -30, fatigueDelta: -4, combat: { casualtyReduction: 0.015 } }, description: "의무·격리 대응 30분 단축, 담당 피로 4 감소. 전투 의무 배치 시 부상 위험 1.5%p 감소." },
  "ration-kit": { id: "ration-kit", label: "배급 키트", slot: "utility", contexts: ["cooking"], effect: { penaltyTier: -1 }, description: "배급 대응의 승무원 불이익 한 단계 완화." },
  // No salvage response job exists in 27-A, so this remains an authored,
  // ungranted future salvage tool rather than changing a finished Greywake
  // contract merely to manufacture a consumer.
  "eva-harness": { id: "eva-harness", label: "EVA 하네스", slot: "primary", contexts: ["salvage"], effect: { resourceDelta: { oxygen: 2 } }, description: "잔해 인양의 산소 소모 2 감소 (인양 작업 해금 후 사용)." },
  "rest-brace": { id: "rest-brace", label: "휴식 보조대", slot: "utility", contexts: ["piloting", "crew"], effect: { fatigueDelta: -5, combat: { takenReduction: 0.01 } }, description: "당직·지휘 대응의 피로 후유증 5 감소. 전투 함교 배치 시 피격 1% 감소." },
};

export const STARTER_EQUIPMENT = [
  { instanceId: "eq-starter-torque", equipmentId: "insulated-torque-rig", ownerCrewId: "engineer-min", equippedSlot: "primary" },
  { instanceId: "eq-starter-calibration", equipmentId: "calibration-case", ownerCrewId: "captain-yun", equippedSlot: "utility" },
  { instanceId: "eq-starter-trauma", equipmentId: "trauma-harness", ownerCrewId: "medic-rho", equippedSlot: "primary" },
  { instanceId: "eq-starter-ration", equipmentId: "ration-kit", ownerCrewId: null, equippedSlot: null },
];

export function getCrewEquipment(id) { return CREW_EQUIPMENT[id] ?? null; }
