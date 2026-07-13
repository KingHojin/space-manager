export const INCIDENT_DIRECTOR_RULES = {
  pulseMinutes: 60,
  startupQuietMinutes: 360,
  dailyThreshold: 32,
  mediumThreshold: 64,
  mediumRiskThreshold: 32,
  quietAfterDaily: 420,
  quietAfterMedium: 600,
  templateCooldownDaily: 600,
  templateCooldownMedium: 2880,
  categoryCooldownDaily: 480,
  categoryCooldownMedium: 960,
  maxActive: 2,
  maxMedium: 1,
  maxQueue: 3,
  maxHistory: 120,
};

const daily = (definition) => ({ severity: "daily", weight: 10, deadlineMinutes: 360, manualOnly: true, ...definition });
const medium = (definition) => ({ severity: "medium", weight: 6, deadlineMinutes: 240, pauseOnPresent: true, manualOnly: true, ...definition });
const room = (snapshot, id) => snapshot.rooms?.[id] ?? {};
const deficit = (value, threshold) => Math.max(0, threshold - (value ?? 100));
const excess = (value, threshold) => Math.max(0, (value ?? 0) - threshold);

export const DIRECTOR_INCIDENTS = [
  daily({
    id: "coolant-joint-leak", category: "engineering", title: "냉각수 접합부 누수", roomId: "engineering",
    eligibility: (snapshot) => (room(snapshot, "engineering").condition ?? 100) <= 85 || (room(snapshot, "engineering").load ?? 0) >= 55,
    triggerScore: (snapshot) => 1 + deficit(room(snapshot, "engineering").condition, 85) / 20 + excess(room(snapshot, "engineering").load, 55) / 25,
    summary: "기관실 접합부에서 냉각수가 맺힙니다. 지금 손보지 않으면 계통 손상이 남습니다.",
    options: [
      { id: "repair", label: "기관실 정비 배정", detail: "기관실 작업 120분 · 완료 시 기관실 상태 +6", job: { roomId: "engineering", duration: 120, requiredRole: "기관실", completionEffects: [{ type: "room", roomId: "engineering", condition: 6, load: -8 }], failureEffects: [{ type: "room", roomId: "engineering", condition: -6, load: 8 }] } },
      { id: "sample", label: "합금 용기에 누출액을 봉인", detail: "합금 장갑판 -1 · 기관실 상태 -2 · 부하 +3 · 냉각 샘플 +1", costs: [{ type: "item", itemId: "alloy-plate", qty: 1 }], effects: [{ type: "room", roomId: "engineering", condition: -2, load: 3 }, { type: "items", grants: [{ itemId: "cryo-sample", qty: 1 }] }] },
      { id: "ignore", label: "손실을 감수하고 지나간다", detail: "기관실 상태 -9 · 부하 +10", effects: [{ type: "room", roomId: "engineering", condition: -9, load: 10 }] },
    ],
    timeoutEffects: [{ type: "room", roomId: "engineering", condition: -11, load: 12 }],
  }),
  daily({
    id: "sensor-zero-drift", category: "navigation", title: "센서 영점 편류", roomId: "ops",
    eligibility: (snapshot) => Boolean(snapshot.traveling || snapshot.isNebula || snapshot.isUnexplored),
    triggerScore: (snapshot) => 1 + (snapshot.traveling ? 0.8 : 0) + (snapshot.isNebula ? 0.5 : 0) + (snapshot.isUnexplored ? 0.4 : 0),
    summary: "관제실 센서 기준점이 어긋났습니다. 방치하면 항로 보정에 연료가 더 듭니다.",
    options: [
      { id: "calibrate", label: "관제실 재보정", detail: "관제실 작업 90분 · 완료 시 상태 +5", job: { roomId: "ops", duration: 90, completionEffects: [{ type: "room", roomId: "ops", condition: 5, load: -7 }], failureEffects: [{ type: "resources", delta: { fuel: -2 } }] } },
      { id: "probe", label: "탐사 프로브로 기준점 고정", detail: "탐사 프로브 -1 · 항로 데이터 +1", costs: [{ type: "item", itemId: "survey-probe", qty: 1 }], effects: [{ type: "items", grants: [{ itemId: "chart-data", qty: 1 }] }] },
      { id: "manual", label: "수동 항법으로 버틴다", detail: "관제실 상태 -7 · 부하 +8", effects: [{ type: "room", roomId: "ops", condition: -7, load: 8 }] },
    ],
    timeoutEffects: [{ type: "resources", delta: { fuel: -4 } }, { type: "room", roomId: "ops", condition: -6, load: 6 }],
  }),
  daily({
    id: "ration-ledger-mismatch", category: "supplies", title: "배급 장부 불일치", roomId: "cargo",
    eligibility: (snapshot) => (snapshot.foodQty ?? Infinity) <= (snapshot.aliveCrewCount ?? 0) * 2 + 4 || (snapshot.avgHunger ?? 0) >= 35,
    triggerScore: (snapshot) => 1 + Math.max(0, ((snapshot.aliveCrewCount ?? 0) * 2 + 4) - (snapshot.foodQty ?? 0)) / 8 + excess(snapshot.avgHunger, 35) / 30,
    summary: "창고 장부와 실제 식량 수량이 맞지 않습니다. 배급 기준을 정해야 합니다.",
    options: [
      { id: "audit", label: "창고 전수 감사", detail: "창고 작업 120분 · 완료 시 상태 +4", job: { roomId: "cargo", duration: 120, completionEffects: [{ type: "room", roomId: "cargo", condition: 4, load: -5 }], failureEffects: [{ type: "crewAll", needs: { stress: 4, hunger: 3 } }] } },
      { id: "open", label: "예비 식량을 개방", detail: "표준 식량 -2 · 전 승무원 스트레스 -4", costs: [{ type: "item", itemId: "food-ration", qty: 2 }], effects: [{ type: "crewAll", needs: { stress: -4, hunger: -5 } }] },
      { id: "ration", label: "배급을 줄인다", detail: "전 승무원 배고픔 +6 · 스트레스 +3", effects: [{ type: "crewAll", needs: { hunger: 6, stress: 3 } }] },
    ],
    timeoutEffects: [{ type: "crewAll", needs: { hunger: 7, stress: 5 } }],
  }),
  daily({
    id: "watch-sleep-debt", category: "crew", title: "당직자의 수면 부채", roomId: "bridge", targetMode: "highestFatigue",
    eligibility: (snapshot) => (snapshot.targetFatigue ?? 0) >= 55 || (snapshot.targetSleepDebt ?? 0) >= 55,
    triggerScore: (snapshot) => 1 + excess(snapshot.targetFatigue, 55) / 30 + excess(snapshot.targetSleepDebt, 55) / 30,
    summary: "당직 승무원이 집중력을 잃고 있습니다. 근무를 바꿀지 밀어붙일지 결정해야 합니다.",
    options: [
      { id: "swap", label: "당직을 교대한다", detail: "대상 피로 총 -12 · 동료 피로 +3 · 전 승무원 스트레스 +1", effects: [{ type: "targetCrew", fatigue: -15, needs: { sleepDebt: -8 } }, { type: "crewAll", fatigue: 3, needs: { stress: 1 } }] },
      { id: "recovery", label: "의무실 회복 근무를 배정", detail: "크레딧 -80 · 의무실 작업 120분 · 완료 시 대상 피로 -22 · 사기 +1", effects: [{ type: "resources", delta: { credits: -80 } }], job: { roomId: "medbay", duration: 120, completionEffects: [{ type: "targetCrew", fatigue: -22, morale: 1, needs: { sleepDebt: -16 } }], failureEffects: [{ type: "targetCrew", needs: { stress: 4, sleepDebt: 4 } }] } },
      { id: "press", label: "이번 당직만 버티게 한다", detail: "대상 피로 +12 · 스트레스 +8 · 함교 부하 -3", effects: [{ type: "targetCrew", fatigue: 12, needs: { stress: 8, sleepDebt: 5 } }, { type: "room", roomId: "bridge", load: -3 }] },
    ],
    timeoutEffects: [{ type: "targetCrew", fatigue: 15, morale: -1, needs: { stress: 10 } }],
  }),
  daily({
    id: "quiet-watch", category: "opportunity", title: "고요한 당직", roomId: "bridge", positive: true,
    eligibility: (snapshot) => !snapshot.hasActiveCrisis && (snapshot.minutesSinceIncident ?? 0) >= 1440 && (snapshot.avgFatigue ?? 0) >= 25,
    triggerScore: (snapshot) => 1 + excess(snapshot.avgFatigue, 25) / 40 + excess(snapshot.minutesSinceIncident, 1440) / 2880,
    summary: "몇 시간째 항로가 안정적입니다. 여유 시간을 어디에 쓸지 정할 수 있습니다.",
    options: [
      { id: "rest", label: "전 승무원에게 휴식을 준다", detail: "전 승무원 피로 -6 · 스트레스 -3", effects: [{ type: "crewAll", fatigue: -6, needs: { stress: -3, sleepDebt: -3 } }] },
      { id: "maintenance", label: "예방 정비를 실시한다", detail: "기관실 작업 90분 · 완료 시 상태 +7", job: { roomId: "engineering", duration: 90, completionEffects: [{ type: "room", roomId: "engineering", condition: 7, load: -6 }], failureEffects: [] } },
      { id: "research", label: "항로를 분석한다", detail: "연구 데이터 +1", effects: [{ type: "items", grants: [{ itemId: "research-data", qty: 1 }] }] },
    ],
    timeoutEffects: [],
  }),
  medium({
    id: "air-scrubber-chain-clog", category: "life-support", title: "공기 정화기 연쇄 막힘", roomId: "living",
    eligibility: (snapshot) => (snapshot.oxygen ?? 100) <= 60 || (room(snapshot, "living").condition ?? 100) <= 60 || (room(snapshot, "engineering").condition ?? 100) <= 60,
    triggerScore: (snapshot) => 1 + deficit(snapshot.oxygen, 60) / 30 + deficit(room(snapshot, "living").condition, 60) / 25 + deficit(room(snapshot, "engineering").condition, 60) / 25,
    summary: "생활구역 정화기 압력이 빠르게 오릅니다. 제한 시간 안에 계통을 안정시켜야 합니다.",
    options: [
      { id: "purge", label: "산소로 계통을 퍼지한다", detail: "산소 -8 · 생활구역 상태 +4", effects: [{ type: "resources", delta: { oxygen: -8 } }, { type: "room", roomId: "living", condition: 4, load: -8 }] },
      { id: "repair", label: "기관실 비상 정비", detail: "기관실 작업 180분 · 완료 시 생활구역 상태 +8 · 부하 -12", job: { roomId: "engineering", duration: 180, requiredRole: "기관실", completionEffects: [{ type: "room", roomId: "living", condition: 8, load: -12 }], failureEffects: [{ type: "resources", delta: { oxygen: -6 } }, { type: "room", roomId: "living", condition: -8, load: 10 }, { type: "crisis", roomId: "living", crisisType: "power_loss", severity: 1 }] } },
      { id: "isolate", label: "생활구역을 격리한다", detail: "전 승무원 스트레스 +7 · 생활구역 상태 -5", effects: [{ type: "crewAll", needs: { stress: 7 } }, { type: "room", roomId: "living", condition: -5, load: -4 }] },
    ],
    timeoutEffects: [{ type: "resources", delta: { oxygen: -8 } }, { type: "room", roomId: "living", condition: -10, load: 12 }, { type: "crisis", roomId: "living", crisisType: "power_loss", severity: 1 }],
  }),
  medium({
    id: "power-bus-instability", category: "engineering", title: "전력 버스 불안정", roomId: "engineering",
    eligibility: (snapshot) => (snapshot.highLoadRoomCount ?? 0) >= 2 || (room(snapshot, "engineering").condition ?? 100) < 55,
    triggerScore: (snapshot) => 1 + Math.max(0, (snapshot.highLoadRoomCount ?? 0) - 1) * 0.5 + deficit(room(snapshot, "engineering").condition, 55) / 20,
    summary: "주 전력 버스의 위상이 흔들립니다. 방치하면 기관실 정전으로 이어집니다.",
    options: [
      { id: "patch", label: "기관실 패치 작업", detail: "기관실 작업 180분 · 완료 시 상태 +8", job: { roomId: "engineering", duration: 180, requiredRole: "기관실", completionEffects: [{ type: "room", roomId: "engineering", condition: 8, load: -10 }], failureEffects: [{ type: "crisis", roomId: "engineering", crisisType: "power_loss", severity: 2 }] } },
      { id: "core", label: "이온 코어를 교체한다", detail: "이온 코어 -1 · 기관실 상태 +12", costs: [{ type: "item", itemId: "ion-core", qty: 1 }], effects: [{ type: "room", roomId: "engineering", condition: 12, load: -15 }] },
      { id: "shed", label: "비필수 부하를 차단한다", detail: "전 승무원 스트레스 +7 · 관제실 상태 -4 · 기관실 부하 -8", effects: [{ type: "crewAll", needs: { stress: 7 } }, { type: "room", roomId: "ops", condition: -4, load: 4 }, { type: "room", roomId: "engineering", load: -8 }] },
    ],
    timeoutEffects: [{ type: "crisis", roomId: "engineering", crisisType: "power_loss", severity: 2 }],
  }),
  medium({
    id: "watch-team-clash", category: "crew", title: "당직조 충돌", roomId: "bridge", targetMode: "lowestAffinityPair",
    eligibility: (snapshot) => (snapshot.lowestAffinity ?? 0) <= -20 || (snapshot.highStressCrewCount ?? 0) >= 2,
    triggerScore: (snapshot) => 1 + Math.max(0, -20 - (snapshot.lowestAffinity ?? 0)) / 30 + Math.max(0, (snapshot.highStressCrewCount ?? 0) - 1) * 0.4,
    summary: "당직조의 언쟁이 명령 체계를 흔듭니다. 두 사람의 관계와 근무를 조정해야 합니다.",
    options: [
      { id: "mediate", label: "생활구역 중재 회의를 연다", detail: "생활구역 작업 120분 · 완료 시 두 승무원 스트레스 -3 · 관계 +10", job: { roomId: "living", duration: 120, completionEffects: [{ type: "targetPair", needs: { stress: -3 }, affinity: 10 }], failureEffects: [{ type: "targetPair", needs: { stress: 4 }, affinity: -4 }] } },
      { id: "separate", label: "당직을 분리한다", detail: "두 승무원 피로 +5 · 관계 +3", effects: [{ type: "targetPair", fatigue: 5, affinity: 3 }] },
      { id: "side", label: "한쪽의 손을 들어준다", detail: "첫 대상 사기 +1 · 둘째 스트레스 +9 · 관계 -12", effects: [{ type: "targetPair", firstMorale: 1, secondNeeds: { stress: 9 }, affinity: -12 }] },
    ],
    timeoutEffects: [{ type: "targetPair", needs: { stress: 10 }, affinity: -14 }],
  }),
];

export const DIRECTOR_INCIDENT_BY_ID = Object.fromEntries(DIRECTOR_INCIDENTS.map((incident) => [incident.id, incident]));
export function getDirectorIncident(id) { return DIRECTOR_INCIDENT_BY_ID[id] ?? null; }
