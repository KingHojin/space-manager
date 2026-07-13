import { beforeEach, describe, expect, it } from "vitest";
import { MISSION_ENCOUNTER_TEMPLATES } from "../../data/missionEncounters";
import { useCombatStore } from "../../stores/combatStore";
import { useCrewStore } from "../../stores/crewStore";
import { useExplorationStore } from "../../stores/explorationStore";
import { useGameStore } from "../../stores/gameStore";
import { useInventoryStore } from "../../stores/inventoryStore";
import { useMissionStore } from "../../stores/missionStore";
import { useNavStore } from "../../stores/navStore";
import { useRecruitStore } from "../../stores/recruitStore";
import { useShipStore } from "../../stores/shipStore";
import { processEncounterOrchestration, reconcileMissionCombatOutcome, settleMissionEncounterChoice } from "../../orchestration/missionEncounterOrchestrator";
import { generateMissionEncounter, getMissionEncounterCandidates, instantiateMissionEncounter, isMissionFlagSet } from "../missionEncounterSystem";
import { createEventRuntime } from "../eventChainSystem";
import { getEventChain } from "../../data/eventChains";
import { processTimedJobs } from "../gameClock";

const vesselId = "starter";
const mission = { id: "mission-24", templateId: "wreck-blackbox-recovery", title: "테스트 회수", category: "salvage", status: "active", destinationNodeId: "dest", destinationName: "잔해", tags: ["salvage", "wreck", "blackbox"], encounterTags: ["debris", "hull_breach"], reward: {} };

beforeEach(() => {
  useShipStore.setState({ activeVesselId: vesselId });
  useMissionStore.setState({ activeByVesselId: {}, pendingMissionEncountersByVesselId: {}, resolvedMissionEncounters: [], eventRuntimesById: {}, pendingStoryEncounterByVesselId: {}, storyFlags: {}, storyHistory: [] });
  useNavStore.setState({ currentNodeId: "dest", travel: null, pendingEncounter: null, driftState: null, sectorIndex: 0 });
  useCombatStore.setState({ combatByVesselId: {}, feedByVesselId: {}, targetByVesselId: {} });
  useExplorationStore.setState({ pendingCombatEncounter: null });
  useGameStore.setState({ currentMinute: 100, isPaused: true, resources: { credits: 1000, fuel: 100, oxygen: 100, hull: 100 }, encounterReceipts: {} });
  useInventoryStore.setState({ encounterReceipts: {} });
  useCrewStore.setState({ encounterReceipts: {} });
  useRecruitStore.setState({ encounterReceipts: {} });
});

describe("Phase 24-A encounter foundation", () => {
  it("hard-filters before weighting and is deterministic", () => {
    const candidates = getMissionEncounterCandidates({ mission, timing: "arrival" });
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.every(({ template }) => template.timing === "arrival" && template.category === "salvage")).toBe(true);
    expect(generateMissionEncounter({ mission, timing: "arrival", seed: "same", currentMinute: 10 })).toEqual(generateMissionEncounter({ mission, timing: "arrival", seed: "same", currentMinute: 10 }));
    expect(isMissionFlagSet({ value: false })).toBe(false);
    expect(isMissionFlagSet({ value: true })).toBe(true);
  });

  it("creates arrival encounter from gameClock without a mounted panel", () => {
    useMissionStore.setState({ activeByVesselId: { [vesselId]: mission } });
    processTimedJobs(0);
    expect(useMissionStore.getState().pendingMissionEncountersByVesselId[vesselId]).toMatchObject({ missionId: mission.id, timing: "arrival" });
  });

  it("rejects stale tuples and settles deterministic rewards once", () => {
    const template = MISSION_ENCOUNTER_TEMPLATES.find((entry) => entry.id === "salvage-debris-field");
    const encounter = instantiateMissionEncounter(template, { mission, seed: "stable", timing: "arrival", currentMinute: 100 });
    useMissionStore.setState({ activeByVesselId: { [vesselId]: mission }, pendingMissionEncountersByVesselId: { [vesselId]: encounter } });
    expect(settleMissionEncounterChoice({ vesselId, runtimeId: "stale", stageId: "arrival", claimId: encounter.claimId, optionId: "drone-scan", currentMinute: 100 })).toMatchObject({ ok: false, reason: "staleEncounter" });
    const before = useInventoryStore.getState().items.find((entry) => entry.id === "salvage-scrap")?.qty ?? 0;
    expect(settleMissionEncounterChoice({ vesselId, runtimeId: encounter.id, stageId: encounter.timing, claimId: encounter.claimId, optionId: "drone-scan", currentMinute: 100 }).ok).toBe(true);
    expect((useInventoryStore.getState().items.find((entry) => entry.id === "salvage-scrap")?.qty ?? 0) - before).toBe(8);
    expect(settleMissionEncounterChoice({ vesselId, runtimeId: encounter.id, stageId: encounter.timing, claimId: encounter.claimId, optionId: "drone-scan", currentMinute: 100 }).ok).toBe(false);
    expect((useInventoryStore.getState().items.find((entry) => entry.id === "salvage-scrap")?.qty ?? 0) - before).toBe(8);
  });

  it("holds combat reward until victory and finalizes once", () => {
    const bounty = { ...mission, id: "bounty-24", templateId: "pirate-beacon-suppression", category: "bounty", tags: ["bounty", "pirate", "combat"], encounterTags: ["combat", "pirate_ambush"] };
    const template = MISSION_ENCOUNTER_TEMPLATES.find((entry) => entry.id === "bounty-pirate-ambush");
    const encounter = instantiateMissionEncounter(template, { mission: bounty, seed: "battle", timing: "arrival", currentMinute: 100 });
    useMissionStore.setState({ activeByVesselId: { [vesselId]: bounty }, pendingMissionEncountersByVesselId: { [vesselId]: encounter } });
    const before = useInventoryStore.getState().items.find((entry) => entry.id === "salvage-scrap")?.qty ?? 0;
    expect(settleMissionEncounterChoice({ vesselId, runtimeId: encounter.id, stageId: "arrival", claimId: encounter.claimId, optionId: "preemptive-fire", currentMinute: 100 })).toMatchObject({ ok: true, waitingCombat: true });
    expect((useInventoryStore.getState().items.find((entry) => entry.id === "salvage-scrap")?.qty ?? 0) - before).toBe(0);
    const combat = useCombatStore.getState().combatByVesselId[vesselId];
    useCombatStore.setState({ combatByVesselId: { [vesselId]: { ...combat, status: "won" } } });
    processEncounterOrchestration(101); processEncounterOrchestration(200);
    expect((useInventoryStore.getState().items.find((entry) => entry.id === "salvage-scrap")?.qty ?? 0) - before).toBe(24);
    expect(useMissionStore.getState().pendingMissionEncountersByVesselId[vesselId]).toBeUndefined();
  });

  it("completeMission rejects story and combat blockers internally", () => {
    useMissionStore.setState({ activeByVesselId: { [vesselId]: mission }, pendingStoryEncounterByVesselId: { [vesselId]: { runtimeId: "story" } } });
    expect(useMissionStore.getState().completeMission({ vesselId, currentMinute: 100 }).reason).toBe("pendingStoryEncounter");
    useMissionStore.setState({ pendingStoryEncounterByVesselId: {} });
    useCombatStore.setState({ combatByVesselId: { [vesselId]: { status: "engaged" } } });
    expect(useMissionStore.getState().completeMission({ vesselId, currentMinute: 100 }).reason).toBe("combat");
  });

  it("retries after a receiver crash without double-applying an earlier receipt", () => {
    const template = MISSION_ENCOUNTER_TEMPLATES.find((entry) => entry.id === "salvage-debris-field");
    const encounter = instantiateMissionEncounter(template, { mission, seed: "crash", timing: "arrival", currentMinute: 100 });
    useMissionStore.setState({ activeByVesselId: { [vesselId]: mission }, pendingMissionEncountersByVesselId: { [vesselId]: encounter } });
    expect(() => settleMissionEncounterChoice({ vesselId, runtimeId: encounter.id, stageId: "arrival", claimId: encounter.claimId, optionId: "direct-entry", currentMinute: 100, afterStep: (step) => { if (step === "game") throw new Error("crash"); } })).toThrow("crash");
    expect(useGameStore.getState().resources.hull).toBe(95);
    expect(settleMissionEncounterChoice({ vesselId, runtimeId: encounter.id, stageId: "arrival", claimId: encounter.claimId, optionId: "direct-entry", currentMinute: 101 }).ok).toBe(true);
    expect(useGameStore.getState().resources.hull).toBe(95);
  });

  it("recovers terminal loss without UI and never grants combat reward", () => {
    const bounty = { ...mission, id: "bounty-loss", templateId: "pirate-beacon-suppression", category: "bounty", tags: ["bounty", "pirate", "combat"], encounterTags: ["combat", "pirate_ambush"] };
    const template = MISSION_ENCOUNTER_TEMPLATES.find((entry) => entry.id === "bounty-pirate-ambush");
    const encounter = instantiateMissionEncounter(template, { mission: bounty, seed: "loss", timing: "arrival", currentMinute: 100 });
    useMissionStore.setState({ activeByVesselId: { [vesselId]: bounty }, pendingMissionEncountersByVesselId: { [vesselId]: encounter } });
    const before = useInventoryStore.getState().items.find((entry) => entry.id === "salvage-scrap")?.qty ?? 0;
    settleMissionEncounterChoice({ vesselId, runtimeId: encounter.id, stageId: "arrival", claimId: encounter.claimId, optionId: "preemptive-fire", currentMinute: 100 });
    const combat = useCombatStore.getState().combatByVesselId[vesselId];
    useCombatStore.setState({ combatByVesselId: { [vesselId]: { ...combat, status: "lost" } } });
    reconcileMissionCombatOutcome(101);
    expect(useMissionStore.getState().activeByVesselId[vesselId]).toBeUndefined();
    expect((useInventoryStore.getState().items.find((entry) => entry.id === "salvage-scrap")?.qty ?? 0) - before).toBe(0);
  });

  it("guards completion on a paused arrival before mount reconciliation", () => {
    useMissionStore.setState({ activeByVesselId: { [vesselId]: mission } });
    const result = useMissionStore.getState().completeMission({ vesselId, currentMinute: 100 });
    expect(result.reason).toBe("pendingMissionEncounter");
    expect(useMissionStore.getState().pendingMissionEncountersByVesselId[vesselId]).toBeTruthy();
  });

  it("legacy merge cancels unknown runtimes and drops stale pending encounters", () => {
    const merge = useMissionStore.persist.getOptions().merge;
    const merged = merge({ activeByVesselId: {}, pendingMissionEncountersByVesselId: { [vesselId]: { id: "stale", missionId: "gone" } }, eventRuntimesById: { old: { id: "old", chainId: "removed-chain", vesselId, status: "scheduled" } } }, useMissionStore.getState());
    expect(merged.pendingMissionEncountersByVesselId).toEqual({});
    expect(merged.eventRuntimesById.old.status).toBe("cancelled");
    const knownBadStage = merge({ eventRuntimesById: { renamed: { id: "renamed", chainId: "__phase24a-contract", vesselId, stageId: "deleted-stage", status: "scheduled" } } }, useMissionStore.getState());
    expect(knownBadStage.eventRuntimesById.renamed.status).toBe("cancelled");
  });

  it("recovers combat-start and settled-before-finalize crash boundaries", () => {
    const bounty = { ...mission, id: "bounty-crash", templateId: "pirate-beacon-suppression", category: "bounty", tags: ["bounty", "pirate", "combat"], encounterTags: ["combat", "pirate_ambush"] };
    const battleTemplate = MISSION_ENCOUNTER_TEMPLATES.find((entry) => entry.id === "bounty-pirate-ambush");
    const battle = instantiateMissionEncounter(battleTemplate, { mission: bounty, seed: "combat-crash", timing: "arrival", currentMinute: 100 });
    useMissionStore.setState({ activeByVesselId: { [vesselId]: bounty }, pendingMissionEncountersByVesselId: { [vesselId]: battle } });
    expect(() => settleMissionEncounterChoice({ vesselId, runtimeId: battle.id, stageId: "arrival", claimId: battle.claimId, optionId: "preemptive-fire", currentMinute: 100, afterStep: (step) => { if (step === "combat") throw new Error("combat-crash"); } })).toThrow("combat-crash");
    expect(useMissionStore.getState().pendingMissionEncountersByVesselId[vesselId].settlement.status).toBe("prepared");
    reconcileMissionCombatOutcome(101);
    expect(useMissionStore.getState().pendingMissionEncountersByVesselId[vesselId].settlement.status).toBe("waitingCombat");

    useCombatStore.setState({ combatByVesselId: {} });
    const salvageTemplate = MISSION_ENCOUNTER_TEMPLATES.find((entry) => entry.id === "salvage-debris-field");
    const salvage = instantiateMissionEncounter(salvageTemplate, { mission, seed: "settled-crash", timing: "arrival", currentMinute: 102 });
    useMissionStore.setState({ activeByVesselId: { [vesselId]: mission }, pendingMissionEncountersByVesselId: { [vesselId]: salvage } });
    expect(() => settleMissionEncounterChoice({ vesselId, runtimeId: salvage.id, stageId: "arrival", claimId: salvage.claimId, optionId: "drone-scan", currentMinute: 102, afterStep: (step) => { if (step === "settled") throw new Error("settled-crash"); } })).toThrow("settled-crash");
    reconcileMissionCombatOutcome(103);
    expect(useMissionStore.getState().pendingMissionEncountersByVesselId[vesselId]).toBeUndefined();
  });

  it("resolves the inert synthetic story chain through next and terminal stages", () => {
    const chain = getEventChain("__phase24a-contract");
    const runtime = createEventRuntime({ chain, vesselId, currentMinute: 100, dueAtMinute: 100, seed: "contract" });
    expect(useMissionStore.getState().registerEventRuntime(runtime).ok).toBe(true);
    processEncounterOrchestration(100);
    const first = useMissionStore.getState().pendingStoryEncounterByVesselId[vesselId];
    expect(useMissionStore.getState().resolveStoryEncounter({ vesselId, runtimeId: "stale", stageId: first.stageId, claimId: first.claimId, optionId: "continue", currentMinute: 100 }).reason).toBe("staleEncounter");
    expect(useMissionStore.getState().resolveStoryEncounter({ vesselId, runtimeId: first.runtimeId, stageId: first.stageId, claimId: first.claimId, optionId: "continue", currentMinute: 100 }).ok).toBe(true);
    expect(useMissionStore.getState().storyFlags.contractContinued.value).toBe(true);
    expect(useMissionStore.getState().pendingStoryEncounterByVesselId[vesselId]).toBeUndefined();
    processEncounterOrchestration(109);
    expect(useMissionStore.getState().pendingStoryEncounterByVesselId[vesselId]).toBeUndefined();
    processEncounterOrchestration(110);
    const second = useMissionStore.getState().pendingStoryEncounterByVesselId[vesselId];
    expect(useMissionStore.getState().resolveStoryEncounter({ vesselId, runtimeId: second.runtimeId, stageId: second.stageId, claimId: second.claimId, optionId: "finish", currentMinute: 110 }).runtime.status).toBe("completed");
    expect(useMissionStore.getState().storyHistory).toHaveLength(2);
    expect(useMissionStore.getState().pendingStoryEncounterByVesselId[vesselId]).toBeUndefined();
  });

  it("completeMission blocks location and navigation invariants", () => {
    useMissionStore.setState({ activeByVesselId: { [vesselId]: mission } });
    useNavStore.setState({ currentNodeId: "elsewhere" });
    expect(useMissionStore.getState().completeMission({ vesselId, currentMinute: 100 }).reason).toBe("notAtDestination");
    useNavStore.setState({ currentNodeId: "dest", pendingEncounter: { id: "nav-gate" } });
    expect(useMissionStore.getState().completeMission({ vesselId, currentMinute: 100 }).reason).toBe("pendingNavigationEncounter");
    expect(useMissionStore.getState().pendingMissionEncountersByVesselId[vesselId]).toBeUndefined();
  });

  it("old mission combat cannot fail a replacement mission", () => {
    const replacement = { ...mission, id: "replacement" };
    useMissionStore.setState({ activeByVesselId: { [vesselId]: replacement } });
    expect(useMissionStore.getState().failMission({ vesselId, expectedMissionId: "old", reason: "oldCombat" }).reason).toBe("staleMission");
    expect(useMissionStore.getState().activeByVesselId[vesselId].id).toBe("replacement");
  });
});
