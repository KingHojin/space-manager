export const MISSION_ENCOUNTER_TIMING = Object.freeze({
  enRoute: "enRoute",
  arrival: "arrival",
  objective: "objective",
});

export const MISSION_ENCOUNTER_OUTCOME_KIND = Object.freeze({
  resource: "resource",
  reward: "reward",
  log: "log",
  combat: "combat",
  crewRisk: "crewRisk",
  missionFlag: "missionFlag",
});

export const MISSION_ENCOUNTER_TEMPLATES = Object.freeze([
  {
    id: "salvage-debris-field",
    title: "잔해 밀집 구역",
    category: "salvage",
    icon: "▣",
    scene: "난파선 주변에 날카로운 파편과 미확인 컨테이너가 흩어져 있다.",
    tags: ["debris", "wreck", "salvage"],
    timing: MISSION_ENCOUNTER_TIMING.arrival,
    risk: "medium",
    options: [
      { id: "drone-scan", label: "드론 먼저 투입", role: "기관실", risk: "low", rewardPreview: { scrap: 8 }, outcomes: [{ kind: "reward", reward: { scrap: 8 } }, { kind: "log", message: "드론 스캔으로 안전한 진입 경로를 확보했습니다." }] },
      { id: "direct-entry", label: "직접 진입", role: "함교", risk: "medium", rewardPreview: { scrap: 16, blueprintChance: 0.04 }, outcomes: [{ kind: "resource", delta: { hull: -4 } }, { kind: "reward", reward: { scrap: 16, blueprintChance: 0.04 } }] },
      { id: "wide-scan", label: "외곽부터 훑기", role: "함교", risk: "low", rewardPreview: { chartData: 1 }, outcomes: [{ kind: "reward", reward: { chartData: 1 } }] },
    ],
  },
  {
    id: "salvage-hull-breach",
    title: "균열 난 선체 통로",
    category: "salvage",
    icon: "◇",
    scene: "블랙박스가 있는 구획으로 가는 통로가 반쯤 무너졌다.",
    tags: ["hull_breach", "blackbox", "wreck"],
    timing: MISSION_ENCOUNTER_TIMING.objective,
    risk: "high",
    options: [
      { id: "brace-corridor", label: "통로 보강", role: "기관실", risk: "medium", rewardPreview: { scrap: 10 }, outcomes: [{ kind: "resource", delta: { hull: -2 } }, { kind: "reward", reward: { scrap: 10 } }] },
      { id: "fast-recover", label: "빠르게 회수", role: "함교", risk: "high", rewardPreview: { dust: 20, blueprintChance: 0.06 }, outcomes: [{ kind: "crewRisk", severity: "minor", chance: 0.12 }, { kind: "reward", reward: { dust: 20, blueprintChance: 0.06 } }] },
      { id: "abort-section", label: "위험 구획 포기", role: "의무실", risk: "low", rewardPreview: { dust: 6 }, outcomes: [{ kind: "reward", reward: { dust: 6 } }, { kind: "log", message: "위험 구획을 포기하고 보조 데이터만 회수했습니다." }] },
    ],
  },
  {
    id: "rescue-oxygen-loss",
    title: "구조 포드 산소 저하",
    category: "rescue",
    icon: "+",
    scene: "구조 포드의 산소 잔량이 빠르게 떨어지고 있다.",
    tags: ["oxygen_loss", "medical", "distress_signal"],
    timing: MISSION_ENCOUNTER_TIMING.arrival,
    risk: "medium",
    options: [
      { id: "share-oxygen", label: "산소 셀 연결", role: "의무실", risk: "low", rewardPreview: { recruitChance: 0.08 }, outcomes: [{ kind: "resource", delta: { oxygen: -5 } }, { kind: "reward", reward: { recruitChance: 0.08 } }] },
      { id: "rush-docking", label: "강제 도킹", role: "함교", risk: "high", rewardPreview: { recruitChance: 0.16 }, outcomes: [{ kind: "resource", delta: { hull: -5 } }, { kind: "crewRisk", severity: "minor", chance: 0.08 }, { kind: "reward", reward: { recruitChance: 0.16 } }] },
      { id: "remote-stabilize", label: "원격 안정화", role: "기관실", risk: "medium", rewardPreview: { dust: 12 }, outcomes: [{ kind: "reward", reward: { dust: 12 } }] },
    ],
  },
  {
    id: "courier-pirate-scan",
    title: "해적 검문 신호",
    category: "courier",
    icon: "▸",
    scene: "화물 서명을 요구하는 가짜 검문 신호가 접근한다.",
    tags: ["pirate_scan", "inspection", "courier"],
    timing: MISSION_ENCOUNTER_TIMING.enRoute,
    risk: "medium",
    options: [
      { id: "mask-cargo", label: "화물 신호 위장", role: "함교", risk: "medium", rewardPreview: { reputation: 1 }, outcomes: [{ kind: "reward", reward: { reputation: 1 } }] },
      { id: "pay-decoy", label: "미끼 화물 투하", role: "기관실", risk: "low", rewardPreview: { dust: 4 }, outcomes: [{ kind: "resource", delta: { fuel: -1 } }, { kind: "reward", reward: { dust: 4 } }, { kind: "log", message: "미끼 화물로 검문을 회피했습니다." }] },
      { id: "challenge", label: "교전 각오", role: "포탑", risk: "high", rewardPreview: { scrap: 12 }, outcomes: [{ kind: "combat", dangerBonus: 1 }, { kind: "reward", reward: { scrap: 12 } }] },
    ],
  },
  {
    id: "survey-sensor-noise",
    title: "센서 노이즈 폭증",
    category: "survey",
    icon: "◌",
    scene: "탐사 데이터가 이온 간섭으로 뒤틀리며 항법 화면이 흔들린다.",
    tags: ["sensor_noise", "rare_signal", "survey"],
    timing: MISSION_ENCOUNTER_TIMING.objective,
    risk: "medium",
    options: [
      { id: "calibrate", label: "센서 보정", role: "함교", risk: "low", rewardPreview: { chartData: 1 }, outcomes: [{ kind: "reward", reward: { chartData: 1 } }] },
      { id: "overclock", label: "스캐너 과출력", role: "기관실", risk: "medium", rewardPreview: { researchData: 1, dust: 14 }, outcomes: [{ kind: "resource", delta: { oxygen: -2 } }, { kind: "reward", reward: { researchData: 1, dust: 14 } }] },
      { id: "follow-signal", label: "희귀 신호 추적", role: "함교", risk: "high", rewardPreview: { artifactChance: 0.05 }, outcomes: [{ kind: "resource", delta: { fuel: -4 } }, { kind: "reward", reward: { artifactChance: 0.05 } }] },
    ],
  },
  {
    id: "bounty-pirate-ambush",
    title: "매복 포격",
    category: "bounty",
    icon: "⌖",
    scene: "비콘 근처의 암석 뒤에서 해적 함선들이 전자 신호를 끈 채 대기 중이다.",
    tags: ["combat", "pirate_ambush", "turret_fire", "bounty"],
    timing: MISSION_ENCOUNTER_TIMING.arrival,
    risk: "high",
    options: [
      { id: "preemptive-fire", label: "선제 포격", role: "포탑", risk: "high", rewardPreview: { scrap: 18 }, outcomes: [{ kind: "combat", dangerBonus: 1 }, { kind: "reward", reward: { scrap: 18 } }] },
      { id: "jam-beacon", label: "비콘 교란", role: "기관실", risk: "medium", rewardPreview: { blueprintChance: 0.05 }, outcomes: [{ kind: "resource", delta: { hull: -3 } }, { kind: "reward", reward: { blueprintChance: 0.05 } }] },
      { id: "defensive-formation", label: "방어 진형", role: "함교", risk: "low", rewardPreview: { dust: 10 }, outcomes: [{ kind: "reward", reward: { dust: 10 } }] },
    ],
  },
  {
    id: "mining-asteroid-surge",
    title: "소행성 난류",
    category: "mining",
    icon: "⬡",
    scene: "광물 지대에 진입하자 작은 암석들이 함체를 두드린다.",
    tags: ["asteroids", "ore_cache", "mining"],
    timing: MISSION_ENCOUNTER_TIMING.arrival,
    risk: "medium",
    options: [
      { id: "slow-maneuver", label: "저속 기동", role: "함교", risk: "low", rewardPreview: { oreSample: 1 }, outcomes: [{ kind: "reward", reward: { oreSample: 1 } }] },
      { id: "harvest-rich-vein", label: "고농도 광맥 채취", role: "기관실", risk: "medium", rewardPreview: { scrap: 22, oreSample: 1 }, outcomes: [{ kind: "resource", delta: { hull: -3 } }, { kind: "reward", reward: { scrap: 22, oreSample: 1 } }] },
      { id: "blast-path", label: "포탑으로 길 개척", role: "포탑", risk: "medium", rewardPreview: { scrap: 12 }, outcomes: [{ kind: "resource", delta: { fuel: -3 } }, { kind: "reward", reward: { scrap: 12 } }] },
    ],
  },
  {
    id: "research-ancient-ai",
    title: "고대 방어 AI 응답",
    category: "research",
    icon: "✦",
    scene: "유적의 방어 AI가 오래된 언어로 접근 권한을 묻는다.",
    tags: ["ancient_ai", "artifact", "system_reboot", "research"],
    timing: MISSION_ENCOUNTER_TIMING.objective,
    risk: "high",
    options: [
      { id: "translate-protocol", label: "프로토콜 해석", role: "함교", risk: "medium", rewardPreview: { researchData: 1, artifactChance: 0.04 }, outcomes: [{ kind: "reward", reward: { researchData: 1, artifactChance: 0.04 } }] },
      { id: "force-reboot", label: "강제 재부팅", role: "기관실", risk: "high", rewardPreview: { blueprintChance: 0.08 }, outcomes: [{ kind: "resource", delta: { hull: -6 } }, { kind: "reward", reward: { blueprintChance: 0.08 } }] },
      { id: "withdraw-scan", label: "외부 스캔만 수행", role: "의무실", risk: "low", rewardPreview: { dust: 18 }, outcomes: [{ kind: "reward", reward: { dust: 18 } }] },
    ],
  },
]);

export function getMissionEncounterTemplate(templateId) {
  return MISSION_ENCOUNTER_TEMPLATES.find((template) => template.id === templateId) ?? null;
}
