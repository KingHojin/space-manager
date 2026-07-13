export const NODE_TYPE_LABELS = {
  station: "정거장",
  nebula: "성운",
  debris: "잔해",
  distress: "조난신호",
  unknown: "미탐사",
  exit: "관문",
};

export const NODE_TYPE_ICONS = {
  station: "🛰️",
  nebula: "🌫️",
  debris: "🧱",
  distress: "🆘",
  unknown: "❔",
  exit: "🌀",
};

export const ENCOUNTER_TABLE = {
  station: [
    {
      id: "station-refuel",
      title: "정거장 보급 허가",
      description: "근처 보급 드론이 접근합니다. 크레딧 일부를 내면 연료와 산소를 보충할 수 있습니다.",
      options: [
        { id: "buy-fuel", label: "표준 보급 결재", outcome: [{ kind: "resource", delta: { credits: -120, fuel: 28, oxygen: 12 } }] },
        { id: "skip", label: "보급 보류", outcome: [{ kind: "log", message: "정거장 보급을 보류했습니다." }] },
      ],
    },
    {
      id: "station-recruit-rumor",
      title: "실직 항해사의 연락",
      description: "정거장 게시판에 함선 승무원 지원자가 올라왔습니다. 아직 영입 시스템이 완전 개방되기 전이라 후보 큐에 보관됩니다.",
      options: [
        { id: "save-candidate", label: "후보 정보 저장", outcome: [{ kind: "recruitOffer", templateId: "nav-rookie-pilot" }] },
        { id: "ignore", label: "무시", outcome: [{ kind: "log", message: "지원자 정보를 넘겼습니다." }] },
      ],
    },
  ],
  nebula: [
    {
      id: "nebula-hidden-cache",
      title: "성운 속 은닉 캐시",
      description: "센서가 짧게 끊긴 사이 오래된 채굴 캐시 신호가 잡힙니다.",
      options: [
        { id: "harvest", label: "위험 감수하고 회수", outcome: [{ kind: "resource", delta: { credits: 180, oxygen: -4 } }] },
        { id: "safe-scan", label: "안전 스캔만 수행", outcome: [{ kind: "resource", delta: { credits: 60 } }] },
      ],
    },
    {
      id: "nebula-ion-static",
      title: "이온 난류",
      description: "성운의 이온 폭풍이 함선 전력 계통을 흔듭니다.",
      options: [
        { id: "push-through", label: "추진 유지", outcome: [{ kind: "spawnCrisis", roomId: "engineering", type: "power_loss", severity: 1 }] },
        { id: "slow", label: "속도 낮추고 우회", outcome: [{ kind: "fuel", delta: -6 }, { kind: "log", message: "우회 항로로 추가 연료를 소모했습니다." }] },
      ],
    },
  ],
  debris: [
    {
      id: "debris-salvage",
      title: "표류 잔해 회수",
      description: "소형 잔해대에서 쓸만한 부품과 크레딧을 회수할 수 있습니다.",
      options: [
        { id: "salvage", label: "잔해 회수", outcome: [{ kind: "resource", delta: { credits: 220, hull: -3 } }] },
        { id: "skip", label: "안전 통과", outcome: [{ kind: "log", message: "잔해대를 우회했습니다." }] },
      ],
    },
    {
      id: "debris-impact",
      title: "미세 운석 충돌",
      description: "잔해대가 예상보다 조밀합니다. 선체 외벽에 균열이 발생했습니다.",
      options: [
        { id: "seal", label: "즉시 봉합 지시", outcome: [{ kind: "spawnCrisis", roomId: "cargo", type: "hull_breach", severity: 1 }] },
        { id: "brace", label: "감속 후 피해 제한", outcome: [{ kind: "resource", delta: { hull: -8, fuel: -4 } }] },
      ],
    },
  ],
  distress: [
    {
      id: "distress-survivor",
      title: "탈출 포드 생존자",
      description: "구형 탈출 포드에서 생명 반응이 확인됩니다. 생존자는 승선 의사를 밝힙니다.",
      options: [
        { id: "rescue", label: "구조 후 후보 등록", outcome: [{ kind: "recruitOffer", templateId: "distress-field-medic" }, { kind: "resource", delta: { oxygen: -3 } }] },
        { id: "mark", label: "좌표만 구조망에 전송", outcome: [{ kind: "resource", delta: { credits: 80 } }] },
      ],
    },
    {
      id: "distress-ambush",
      title: "가짜 조난 신호",
      description: "접근 직후 함내 침투 경보가 울립니다. 누군가 도킹 클램프를 강제로 열었습니다.",
      options: [
        { id: "lockdown", label: "격벽 봉쇄", outcome: [{ kind: "spawnCrisis", roomId: "ops", type: "intruder", severity: 1 }] },
        { id: "retreat", label: "연료 태워 이탈", outcome: [{ kind: "fuel", delta: -10 }, { kind: "log", message: "매복을 피해 긴급 이탈했습니다." }] },
      ],
    },
  ],
  unknown: [
    {
      id: "unknown-silent-vector",
      title: "무음 항로",
      description: "성계 데이터에 없는 정적 구역입니다. 센서 기록을 팔 수 있지만, 함선 외벽이 차갑게 얼어붙습니다.",
      options: [
        { id: "map", label: "데이터 수집", outcome: [{ kind: "resource", delta: { credits: 140, hull: -2 } }] },
        { id: "pass", label: "빠르게 통과", outcome: [{ kind: "fuel", delta: -5 }] },
      ],
    },
    {
      id: "unknown-contact",
      title: "미확인 접촉",
      description: "함교에 정체불명의 전술 신호가 잡힙니다. 아직 전투 시스템 전 단계라 텍스트 결과로 기록됩니다.",
      options: [
        { id: "hail", label: "교신 시도", outcome: [{ kind: "combat", enemyId: "scrap-raider" }] },
        { id: "dark", label: "무전 침묵", outcome: [{ kind: "log", message: "교전을 피하고 항로 기록만 남겼습니다." }] },
      ],
    },
  ],
  exit: [
    {
      id: "exit-next-sector",
      title: "섹터 관문",
      description: "장거리 점프 좌표가 안정화됐습니다. 다음 섹터로 넘어갈 수 있습니다.",
      options: [
        { id: "jump", label: "다음 섹터로 점프", manualOnly: true, outcome: [{ kind: "nextSector", manualOnly: true }] },
        { id: "hold", label: "현재 섹터에 남기", outcome: [{ kind: "log", message: "관문 앞에서 현재 섹터 탐험을 계속합니다." }] },
      ],
    },
  ],
};

export function normalizeNodeType(type) {
  if (["station", "nebula", "debris", "distress", "unknown", "exit"].includes(type)) return type;
  if (["wreck", "ruin", "mining", "ice"].includes(type)) return "debris";
  if (["gate"].includes(type)) return "exit";
  if (["anomaly", "creature", "pirate", "defense", "blackhole", "research"].includes(type)) return "unknown";
  if (["market", "colony"].includes(type)) return "station";
  return "unknown";
}
