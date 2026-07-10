import { describe, expect, it } from "vitest";
import { evaluatePolicies } from "../policyEngine";
import { TREATMENT_RULES } from "../injurySystem";
import { createDefaultPolicyState } from "../../data/policies";
import { JOB_DURATION, JOB_ECONOMY } from "../../data/constants";
import { ENCOUNTER_TABLE } from "../../data/navEncounters";

const SCRAP_COST = JOB_ECONOMY.hullRepair.salvageScrapCost;
const HULL_DELTA = JOB_ECONOMY.hullRepair.hullDelta;

describe("evaluatePolicies", () => {
  it("returns an empty result when called with no arguments at all", () => {
    expect(evaluatePolicies()).toEqual({ actions: [], logs: [] });
  });

  it("returns an empty result when every catalog policy is at its default (all disabled) state", () => {
    const policies = createDefaultPolicyState();
    const result = evaluatePolicies({ policies, resources: { hull: 5 }, crew: [], rooms: {}, currentMinute: 100 });
    // Hull is far below the default 40% threshold, but auto-hull-repair is
    // disabled by default, so nothing should fire.
    expect(result).toEqual({ actions: [], logs: [] });
  });

  describe("auto-hull-repair", () => {
    it("enabled + hull below threshold + no active repair job + insufficient scrap produces a diagnostic warning, no enqueue action", () => {
      const policies = createDefaultPolicyState();
      policies["auto-hull-repair"] = { enabled: true, params: { hullThreshold: 40 } };
      // No `items` passed -> salvage-scrap qty defaults to 0, which is below
      // JOB_ECONOMY.hullRepair.salvageScrapCost, so this must land in the
      // "insufficient scrap" branch, not enqueue anything.
      const result = evaluatePolicies({ policies, resources: { hull: 25 }, crew: [], rooms: {}, currentMinute: 0 });
      expect(result.logs).toHaveLength(1);
      expect(result.logs[0]).toContain("정책");
      expect(result.logs[0]).toContain("25");
      expect(result.logs[0]).toContain(`0/${SCRAP_COST}`);
      expect(result.actions).toEqual([
        {
          policyId: "auto-hull-repair",
          kind: "diagnostic",
          detail: { reason: "insufficient-scrap", hull: 25, threshold: 40, scrapQty: 0, scrapCost: SCRAP_COST },
        },
      ]);
    });

    it("enabled + hull below threshold + no active repair job + sufficient scrap produces an enqueue-ship-work action matching Ship.jsx's manual-repair payload", () => {
      const policies = createDefaultPolicyState();
      policies["auto-hull-repair"] = { enabled: true, params: { hullThreshold: 40 } };
      const items = [{ id: "salvage-scrap", qty: SCRAP_COST }];
      const result = evaluatePolicies({ policies, resources: { hull: 25 }, jobs: [], items });
      expect(result.logs).toHaveLength(1);
      expect(result.actions).toEqual([
        {
          policyId: "auto-hull-repair",
          kind: "enqueue-ship-work",
          detail: {
            reason: "threshold-breach",
            hull: 25,
            threshold: 40,
            job: {
              type: "hullRepair",
              roomId: "engineering",
              cost: SCRAP_COST,
              duration: JOB_DURATION.hull_repair,
              priority: "high",
              payload: {
                hullDelta: HULL_DELTA,
                inputItems: [{ itemId: "salvage-scrap", qty: SCRAP_COST }],
              },
            },
          },
        },
      ]);
    });

    it("does not re-enqueue when a hull_repair job is already active, even with sufficient scrap — silent, no log", () => {
      const policies = createDefaultPolicyState();
      policies["auto-hull-repair"] = { enabled: true, params: { hullThreshold: 40 } };
      const items = [{ id: "salvage-scrap", qty: 999 }];
      const jobs = [{ id: "job-1", type: "hull_repair", status: "in_progress" }];
      const result = evaluatePolicies({ policies, resources: { hull: 10 }, jobs, items });
      expect(result).toEqual({ actions: [], logs: [] });
    });

    it("a hull_repair job in the 'backlog' status also counts as active (jobStore.getActiveJobs() semantics)", () => {
      const policies = createDefaultPolicyState();
      policies["auto-hull-repair"] = { enabled: true, params: { hullThreshold: 40 } };
      const items = [{ id: "salvage-scrap", qty: 999 }];
      const jobs = [{ id: "job-1", type: "hull_repair", status: "backlog" }];
      const result = evaluatePolicies({ policies, resources: { hull: 10 }, jobs, items });
      expect(result).toEqual({ actions: [], logs: [] });
    });

    it("a queued job of a different type does not block the repair enqueue", () => {
      const policies = createDefaultPolicyState();
      policies["auto-hull-repair"] = { enabled: true, params: { hullThreshold: 40 } };
      const items = [{ id: "salvage-scrap", qty: SCRAP_COST }];
      const jobs = [{ id: "job-1", type: "salvage", status: "in_progress" }];
      const result = evaluatePolicies({ policies, resources: { hull: 10 }, jobs, items });
      expect(result.actions).toHaveLength(1);
      expect(result.actions[0].kind).toBe("enqueue-ship-work");
    });

    it("enabled + hull at or above threshold produces no log/action (boundary is exclusive)", () => {
      const policies = createDefaultPolicyState();
      policies["auto-hull-repair"] = { enabled: true, params: { hullThreshold: 40 } };
      expect(evaluatePolicies({ policies, resources: { hull: 40 } })).toEqual({ actions: [], logs: [] });
      expect(evaluatePolicies({ policies, resources: { hull: 90 } })).toEqual({ actions: [], logs: [] });
    });

    it("disabled never fires even when hull is critically low", () => {
      const policies = createDefaultPolicyState();
      policies["auto-hull-repair"] = { enabled: false, params: { hullThreshold: 40 } };
      expect(evaluatePolicies({ policies, resources: { hull: 1 } })).toEqual({ actions: [], logs: [] });
    });

    it("respects a custom hullThreshold param instead of the catalog default", () => {
      const policies = createDefaultPolicyState();
      policies["auto-hull-repair"] = { enabled: true, params: { hullThreshold: 80 } };
      const result = evaluatePolicies({ policies, resources: { hull: 70 } });
      expect(result.logs).toHaveLength(1);
      expect(result.actions[0].detail.threshold).toBe(80);
    });

    it("never mutates a store or enqueues a job itself — actions are plain descriptors only", () => {
      const policies = createDefaultPolicyState();
      policies["auto-hull-repair"] = { enabled: true, params: { hullThreshold: 40 } };
      const result = evaluatePolicies({ policies, resources: { hull: 10 } });
      expect(result.actions[0].kind).toBe("diagnostic");
      expect(result.actions[0]).not.toHaveProperty("jobId");
    });
  });

  describe("fuel-reserve", () => {
    it("enabled + fuel below reserveThreshold produces a diagnostic warning log/action", () => {
      const policies = createDefaultPolicyState();
      policies["fuel-reserve"] = { enabled: true, params: { reserveThreshold: 30 } };
      const result = evaluatePolicies({ policies, resources: { fuel: 15 } });
      expect(result.logs).toHaveLength(1);
      expect(result.logs[0]).toContain("정책");
      expect(result.logs[0]).toContain("15");
      expect(result.actions).toEqual([
        { policyId: "fuel-reserve", kind: "diagnostic", detail: { reason: "low-fuel", fuel: 15, threshold: 30 } },
      ]);
    });

    it("enabled + fuel at or above reserveThreshold produces no log/action (boundary is exclusive)", () => {
      const policies = createDefaultPolicyState();
      policies["fuel-reserve"] = { enabled: true, params: { reserveThreshold: 30 } };
      expect(evaluatePolicies({ policies, resources: { fuel: 30 } })).toEqual({ actions: [], logs: [] });
      expect(evaluatePolicies({ policies, resources: { fuel: 90 } })).toEqual({ actions: [], logs: [] });
    });

    it("disabled never fires even when fuel is critically low", () => {
      const policies = createDefaultPolicyState();
      policies["fuel-reserve"] = { enabled: false, params: { reserveThreshold: 30 } };
      expect(evaluatePolicies({ policies, resources: { fuel: 1 } })).toEqual({ actions: [], logs: [] });
    });

    it("never enqueues a job or mutates resources — diagnostic only (auto-refuel is out of scope for 19-B)", () => {
      const policies = createDefaultPolicyState();
      policies["fuel-reserve"] = { enabled: true, params: { reserveThreshold: 30 } };
      const result = evaluatePolicies({ policies, resources: { fuel: 5 } });
      expect(result.actions[0].kind).toBe("diagnostic");
    });
  });

  describe("auto-treatment", () => {
    const MINOR = TREATMENT_RULES.minor;
    const SERIOUS = TREATMENT_RULES.serious;

    function crewMember(overrides = {}) {
      return { id: "m1", name: "테스트대원", alive: true, injury: "healthy", ...overrides };
    }

    it("disabled never fires even with an injured crew member and plenty of credits", () => {
      const policies = createDefaultPolicyState();
      policies["auto-treatment"] = { enabled: false, params: { minSeverity: "minor" } };
      const result = evaluatePolicies({ policies, resources: { credits: 9999 }, crew: [crewMember({ injury: "minor" })], jobs: [] });
      expect(result).toEqual({ actions: [], logs: [] });
    });

    it("no injured crew produces no actions/logs", () => {
      const policies = createDefaultPolicyState();
      policies["auto-treatment"] = { enabled: true, params: { minSeverity: "minor" } };
      const result = evaluatePolicies({ policies, resources: { credits: 9999 }, crew: [crewMember({ injury: "healthy" })], jobs: [] });
      expect(result).toEqual({ actions: [], logs: [] });
    });

    it("an injury below minSeverity does not qualify", () => {
      const policies = createDefaultPolicyState();
      // minSeverity "serious" excludes "minor" injuries (INJURY_STATE_ORDER
      // ranks minor below serious).
      policies["auto-treatment"] = { enabled: true, params: { minSeverity: "serious" } };
      const result = evaluatePolicies({ policies, resources: { credits: 9999 }, crew: [crewMember({ injury: "minor" })], jobs: [] });
      expect(result).toEqual({ actions: [], logs: [] });
    });

    it("enabled + qualifying injury + sufficient credits produces an enqueue-treatment-job action matching Crew.jsx's treat() payload", () => {
      const policies = createDefaultPolicyState();
      policies["auto-treatment"] = { enabled: true, params: { minSeverity: "minor" } };
      const result = evaluatePolicies({ policies, resources: { credits: 9999 }, crew: [crewMember({ injury: "minor" })], jobs: [] });
      expect(result.logs).toHaveLength(1);
      expect(result.logs[0]).toContain("정책");
      expect(result.actions).toEqual([
        {
          policyId: "auto-treatment",
          kind: "enqueue-treatment-job",
          detail: {
            memberId: "m1",
            job: { memberId: "m1", injury: "경상", cost: MINOR.cost, duration: MINOR.minutes, fatiguePenalty: MINOR.fatiguePenalty, priority: "high" },
          },
        },
      ]);
    });

    it("insufficient credits produces a diagnostic warning, no enqueue action", () => {
      const policies = createDefaultPolicyState();
      policies["auto-treatment"] = { enabled: true, params: { minSeverity: "minor" } };
      const result = evaluatePolicies({ policies, resources: { credits: MINOR.cost - 1 }, crew: [crewMember({ injury: "minor" })], jobs: [] });
      expect(result.logs).toHaveLength(1);
      expect(result.logs[0]).toContain("크레딧 부족");
      expect(result.actions).toEqual([
        {
          policyId: "auto-treatment",
          kind: "diagnostic",
          detail: { reason: "insufficient-credits", memberId: "m1", injury: "경상", cost: MINOR.cost, credits: MINOR.cost - 1 },
        },
      ]);
    });

    it("a crew member already in an active job (training/treatment/recovery) is excluded from candidates", () => {
      const policies = createDefaultPolicyState();
      policies["auto-treatment"] = { enabled: true, params: { minSeverity: "minor" } };
      const jobs = [{ id: "job-1", type: "treatment", status: "in_progress", payload: { targetCrewId: "m1" } }];
      const result = evaluatePolicies({ policies, resources: { credits: 9999 }, crew: [crewMember({ injury: "minor" })], jobs });
      expect(result).toEqual({ actions: [], logs: [] });
    });

    it("a backlog-status job for the same member also counts as busy (jobStore.getActiveJobs() semantics)", () => {
      const policies = createDefaultPolicyState();
      policies["auto-treatment"] = { enabled: true, params: { minSeverity: "minor" } };
      const jobs = [{ id: "job-1", type: "recovery", status: "backlog", payload: { targetCrewId: "m1" } }];
      const result = evaluatePolicies({ policies, resources: { credits: 9999 }, crew: [crewMember({ injury: "minor" })], jobs });
      expect(result).toEqual({ actions: [], logs: [] });
    });

    it("a dead crew member never qualifies even if marked injured", () => {
      const policies = createDefaultPolicyState();
      policies["auto-treatment"] = { enabled: true, params: { minSeverity: "minor" } };
      const result = evaluatePolicies({ policies, resources: { credits: 9999 }, crew: [crewMember({ injury: "critical", alive: false })], jobs: [] });
      expect(result).toEqual({ actions: [], logs: [] });
    });

    it("multiple qualifying crew members: only the most severely injured one is queued this tick", () => {
      const policies = createDefaultPolicyState();
      policies["auto-treatment"] = { enabled: true, params: { minSeverity: "minor" } };
      const crew = [
        crewMember({ id: "m1", name: "경상대원", injury: "minor" }),
        crewMember({ id: "m2", name: "중상대원", injury: "serious" }),
        crewMember({ id: "m3", name: "위독대원", injury: "critical" }),
      ];
      const result = evaluatePolicies({ policies, resources: { credits: 9999 }, crew, jobs: [] });
      expect(result.actions).toHaveLength(1);
      expect(result.actions[0].detail.memberId).toBe("m3");
    });

    it("ties in severity keep crew array order", () => {
      const policies = createDefaultPolicyState();
      policies["auto-treatment"] = { enabled: true, params: { minSeverity: "minor" } };
      const crew = [
        crewMember({ id: "m1", injury: "serious" }),
        crewMember({ id: "m2", injury: "serious" }),
      ];
      const result = evaluatePolicies({ policies, resources: { credits: 9999 }, crew, jobs: [] });
      expect(result.actions[0].detail.memberId).toBe("m1");
    });

    it("respects a custom minSeverity param instead of the catalog default", () => {
      const policies = createDefaultPolicyState();
      policies["auto-treatment"] = { enabled: true, params: { minSeverity: "critical" } };
      const crew = [crewMember({ id: "m1", injury: "serious" }), crewMember({ id: "m2", injury: "critical" })];
      const result = evaluatePolicies({ policies, resources: { credits: 9999 }, crew, jobs: [] });
      expect(result.actions).toHaveLength(1);
      expect(result.actions[0].detail.memberId).toBe("m2");
    });

    it("uses treatmentRule's per-severity cost/duration/fatiguePenalty, matching Crew.jsx exactly", () => {
      const policies = createDefaultPolicyState();
      policies["auto-treatment"] = { enabled: true, params: { minSeverity: "minor" } };
      const result = evaluatePolicies({ policies, resources: { credits: 9999 }, crew: [crewMember({ id: "m1", injury: "serious" })], jobs: [] });
      expect(result.actions[0].detail.job).toEqual({
        memberId: "m1",
        injury: "중상",
        cost: SERIOUS.cost,
        duration: SERIOUS.minutes,
        fatiguePenalty: SERIOUS.fatiguePenalty,
        priority: "emergency",
      });
    });
  });

  it("encounter-default-choice enabled but with no pending encounter produces no actions/logs", () => {
    const policies = createDefaultPolicyState();
    policies["encounter-default-choice"] = { enabled: true, params: { stance: "aggressive" } };
    const result = evaluatePolicies({
      policies,
      resources: { hull: 100, fuel: 100 },
      crew: [{ id: "m1", alive: true, injury: "중상" }],
      rooms: {},
      currentMinute: 0,
      // pendingEncounter deliberately omitted -> defaults to null.
    });
    expect(result).toEqual({ actions: [], logs: [] });
  });

  describe("encounter-default-choice", () => {
    // A synthetic three-option encounter whose risk/reward/net scores are
    // hand-picked so "safe", "aggressive" and "balanced" each land on a
    // *different* option (see the score table in the comment on each case
    // below) — a real navEncounters.js entry rarely has enough options to
    // separate all three stances at once, so this fixture is what actually
    // exercises the three branches of evaluateEncounterDefaultChoice.
    //
    //   option      risk   reward   net (reward-risk)
    //   cautious       0       20    20
    //   moderate       5      100    95
    //   risky         50      140    90
    const scoredEncounter = {
      id: "test-scored-encounter",
      title: "테스트 조우",
      options: [
        { id: "cautious", label: "신중 대응", outcome: [{ kind: "resource", delta: { credits: 20 } }] },
        { id: "moderate", label: "균형 대응", outcome: [{ kind: "resource", delta: { credits: 100, hull: -5 } }] },
        { id: "risky", label: "고위험 강행", outcome: [{ kind: "resource", delta: { credits: 140, hull: -50 } }] },
      ],
    };

    function policiesWithStance(stance) {
      const policies = createDefaultPolicyState();
      policies["encounter-default-choice"] = { enabled: true, params: { stance } };
      return policies;
    }

    it("disabled never fires even with a pending encounter", () => {
      const policies = policiesWithStance("balanced");
      policies["encounter-default-choice"].enabled = false;
      const result = evaluatePolicies({ policies, pendingEncounter: scoredEncounter });
      expect(result).toEqual({ actions: [], logs: [] });
    });

    it("'safe' picks the lowest-risk option (cautious, risk 0)", () => {
      const result = evaluatePolicies({ policies: policiesWithStance("safe"), pendingEncounter: scoredEncounter });
      expect(result.actions).toEqual([
        {
          policyId: "encounter-default-choice",
          kind: "resolve-encounter",
          detail: { encounterId: "test-scored-encounter", optionId: "cautious", stance: "safe", label: "신중 대응" },
        },
      ]);
      expect(result.logs[0]).toContain("정책");
      expect(result.logs[0]).toContain("신중 대응");
      expect(result.logs[0]).toContain("safe");
    });

    it("'aggressive' picks the highest-reward option (risky, reward 140)", () => {
      const result = evaluatePolicies({ policies: policiesWithStance("aggressive"), pendingEncounter: scoredEncounter });
      expect(result.actions[0].detail.optionId).toBe("risky");
      expect(result.actions[0].detail.stance).toBe("aggressive");
    });

    it("'balanced' picks the highest net (reward - risk) option (moderate, net 95, beating risky's net 90)", () => {
      const result = evaluatePolicies({ policies: policiesWithStance("balanced"), pendingEncounter: scoredEncounter });
      expect(result.actions[0].detail.optionId).toBe("moderate");
      expect(result.actions[0].detail.stance).toBe("balanced");
    });

    it("defaults to 'balanced' when params.stance is missing", () => {
      const policies = createDefaultPolicyState();
      policies["encounter-default-choice"] = { enabled: true, params: {} };
      const result = evaluatePolicies({ policies, pendingEncounter: scoredEncounter });
      expect(result.actions[0].detail.optionId).toBe("moderate");
      expect(result.actions[0].detail.stance).toBe("balanced");
    });

    it("ties in risk keep option array order for 'safe'", () => {
      const tiedEncounter = {
        id: "test-tied-encounter",
        title: "동률 조우",
        options: [
          { id: "first", label: "첫번째", outcome: [{ kind: "resource", delta: { credits: 10 } }] },
          { id: "second", label: "두번째", outcome: [{ kind: "resource", delta: { credits: 999 } }] },
        ],
      };
      const result = evaluatePolicies({ policies: policiesWithStance("safe"), pendingEncounter: tiedEncounter });
      expect(result.actions[0].detail.optionId).toBe("first");
    });

    it("a real navEncounters.js entry (nebula-hidden-cache): 'safe' avoids the oxygen-cost option, 'aggressive'/'balanced' take the bigger payout", () => {
      // harvest: credits +180, oxygen -4 -> risk 4, reward 180, net 176.
      // safe-scan: credits +60 -> risk 0, reward 60, net 60.
      const nebulaEncounter = ENCOUNTER_TABLE.nebula.find((entry) => entry.id === "nebula-hidden-cache");
      const safeResult = evaluatePolicies({ policies: policiesWithStance("safe"), pendingEncounter: nebulaEncounter });
      expect(safeResult.actions[0].detail.optionId).toBe("safe-scan");

      const aggressiveResult = evaluatePolicies({ policies: policiesWithStance("aggressive"), pendingEncounter: nebulaEncounter });
      expect(aggressiveResult.actions[0].detail.optionId).toBe("harvest");

      const balancedResult = evaluatePolicies({ policies: policiesWithStance("balanced"), pendingEncounter: nebulaEncounter });
      expect(balancedResult.actions[0].detail.optionId).toBe("harvest");
    });

    it("REGRESSION: a combat option is never chosen even when it would score best on both risk and reward", () => {
      // "greedy-combat" bundles a huge credit reward with a combat effect —
      // if the combat exclusion ran *after* scoring instead of before, this
      // option would win on both "safe" (risk 0, tied for lowest) and
      // "aggressive" (reward 999, far and away the highest). It must never
      // be selected, no matter the stance.
      const temptingEncounter = {
        id: "test-tempting-combat",
        title: "탐욕스러운 조우",
        options: [
          {
            id: "greedy-combat",
            label: "고위험 교전 확보",
            outcome: [{ kind: "resource", delta: { credits: 999 } }, { kind: "combat", enemyId: "test-foe" }],
          },
          { id: "modest-safe", label: "무난한 대응", outcome: [{ kind: "resource", delta: { credits: 50 } }] },
        ],
      };

      ["safe", "aggressive", "balanced"].forEach((stance) => {
        const result = evaluatePolicies({ policies: policiesWithStance(stance), pendingEncounter: temptingEncounter });
        expect(result.actions[0].detail.optionId).toBe("modest-safe");
        expect(result.actions[0].detail.optionId).not.toBe("greedy-combat");
      });
    });

    it("REGRESSION: a real navEncounters.js entry with a combat option ('unknown-contact') never auto-selects 'hail'", () => {
      const unknownEncounter = ENCOUNTER_TABLE.unknown.find((entry) => entry.id === "unknown-contact");
      ["safe", "aggressive", "balanced"].forEach((stance) => {
        const result = evaluatePolicies({ policies: policiesWithStance(stance), pendingEncounter: unknownEncounter });
        expect(result.actions[0].detail.optionId).toBe("dark");
        expect(result.actions[0].detail.optionId).not.toBe("hail");
      });
    });

    it("never auto-selects the gate's manualOnly nextSector option", () => {
      const exitEncounter = ENCOUNTER_TABLE.exit.find((entry) => entry.id === "exit-next-sector");
      ["safe", "aggressive", "balanced"].forEach((stance) => {
        const result = evaluatePolicies({ policies: policiesWithStance(stance), pendingEncounter: exitEncounter });
        expect(result.actions[0].detail.optionId).toBe("hold");
        expect(result.actions[0].detail.optionId).not.toBe("jump");
      });
    });

    it("when every option leads to combat, produces a diagnostic log only, no resolve-encounter action", () => {
      const allCombatEncounter = {
        id: "test-all-combat",
        title: "총력전 조우",
        options: [
          { id: "engage-1", label: "정면 교전", outcome: [{ kind: "combat", enemyId: "foe-a" }] },
          { id: "engage-2", label: "측면 교전", outcome: [{ kind: "combat", enemyId: "foe-b" }] },
        ],
      };
      const result = evaluatePolicies({ policies: policiesWithStance("aggressive"), pendingEncounter: allCombatEncounter });
      expect(result.actions).toEqual([
        {
          policyId: "encounter-default-choice",
          kind: "diagnostic",
          detail: { reason: "all-combat", encounterId: "test-all-combat" },
        },
      ]);
      expect(result.logs[0]).toContain("정책");
      expect(result.logs[0]).toContain("전투");
    });

    it("does nothing when explorationStore's pendingCombatEncounter snapshot is already set, even with a pending nav encounter and the policy enabled", () => {
      const result = evaluatePolicies({
        policies: policiesWithStance("aggressive"),
        pendingEncounter: scoredEncounter,
        pendingCombatEncounter: { id: "raider-scout", title: "미확인 적성 함선 접촉" },
      });
      expect(result).toEqual({ actions: [], logs: [] });
    });
  });

  it("ignores unknown policy ids in the policies map without throwing", () => {
    const policies = { ...createDefaultPolicyState(), "some-future-policy": { enabled: true, params: {} } };
    expect(() => evaluatePolicies({ policies, resources: { hull: 100 } })).not.toThrow();
  });

  it("actions and logs are always index-aligned (every action has exactly one corresponding log, and vice versa)", () => {
    const policies = createDefaultPolicyState();
    policies["auto-hull-repair"] = { enabled: true, params: { hullThreshold: 40 } };
    policies["fuel-reserve"] = { enabled: true, params: { reserveThreshold: 30 } };
    const result = evaluatePolicies({ policies, resources: { hull: 10, fuel: 5 } });
    expect(result.actions).toHaveLength(2);
    expect(result.logs).toHaveLength(2);
    expect(result.actions[0].policyId).toBe("auto-hull-repair");
    expect(result.actions[1].policyId).toBe("fuel-reserve");
  });
});
