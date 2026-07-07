// Phase 19-A: policy catalog (pure data, no store/system imports).
//
// A "policy" is a player-toggleable automation rule ("if X, do Y without
// asking me first"). This file only defines WHAT policies exist and their
// default state/params — it does not decide whether/how a policy actually
// fires. That evaluation logic lives in systems/policyEngine.js (pure) and
// is orchestrated by systems/gameClock.js, exactly like ROOM_JOB_CATALOG in
// systems/roomJobs.js and CRISIS_CATALOG in systems/crisisSystem.js are data
// catalogs evaluated by their sibling systems.
//
// `params.minSeverity` on "auto-treatment" intentionally uses the same
// state-id vocabulary as systems/injurySystem.js's INJURY_STATE_ORDER
// ("healthy" | "minor" | "serious" | "critical" | "incapacitated" — Korean
// labels 정상/경상/중상/위독/전투불능), NOT injurySystem's separate
// info/high/critical *card*-priority vocabulary. This file does not import
// injurySystem.js (data files stay dependency-free / catalog-only, matching
// the rest of src/data/*.js), so the mapping is documented here instead:
// whichever future PR (19-C) reads this param is responsible for validating
// it against INJURY_STATE_ORDER at the point of use.

export const POLICY_CATEGORIES = {
  maintenance: "정비",
  crew: "승무원",
  logistics: "보급",
  navigation: "항해",
};

// Allowed values for "encounter-default-choice".params.stance. Kept here
// (not inferred) so 19-D and any future settings UI share one source of
// truth for what stances exist.
export const ENCOUNTER_STANCES = ["safe", "balanced", "aggressive"];

export const POLICY_CATALOG = [
  {
    id: "auto-hull-repair",
    label: "자동 선체 수리",
    description: "선체 내구도가 지정한 임계값 미만으로 떨어지면 자동으로 정비 작업을 예약합니다.",
    category: "maintenance",
    defaultEnabled: false,
    params: { hullThreshold: 40 },
  },
  {
    id: "auto-treatment",
    label: "부상자 자동 치료",
    description: "지정한 등급 이상으로 부상당한 승무원을 자동으로 치료 대기열에 올립니다.",
    category: "crew",
    defaultEnabled: false,
    // "minor" == injurySystem.js INJURY_STATE_ORDER's 경상 stage — see file
    // header comment. Any state at or above this rank should qualify once
    // 19-C implements the real rule.
    params: { minSeverity: "minor" },
  },
  {
    id: "fuel-reserve",
    label: "연료 예비율 경고",
    description: "연료 비율이 예비 임계값 미만으로 떨어지면 경고하고, 가능하면 자동으로 보급을 시도합니다.",
    category: "logistics",
    defaultEnabled: false,
    params: { reserveThreshold: 30 },
  },
  {
    id: "encounter-default-choice",
    label: "항해 조우 기본 대응",
    description: "플레이어 개입 없이 항해 조우 시간이 만료되면 지정한 성향으로 자동 대응을 선택합니다.",
    category: "navigation",
    defaultEnabled: false,
    // See ENCOUNTER_STANCES for the full set of allowed values.
    params: { stance: "balanced" },
  },
];

export function getPolicyDefinition(policyId) {
  return POLICY_CATALOG.find((definition) => definition.id === policyId) ?? null;
}

export function createDefaultPolicyState() {
  return Object.fromEntries(
    POLICY_CATALOG.map((definition) => [definition.id, { enabled: definition.defaultEnabled, params: { ...definition.params } }]),
  );
}
