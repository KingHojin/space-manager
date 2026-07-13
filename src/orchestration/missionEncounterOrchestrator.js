import { EVENT_CHAINS, getEventChain, EVENT_CHAIN_STATUS } from "../data/eventChains";
import { createCombatState, resolveEnemyFleet } from "../systems/combatEngine";
import { getSectorProfile } from "../systems/campaignProgression";
import { canPresentStoryRuntime, getDueEventRuntimes, storyEncounterClaimId } from "../systems/eventChainSystem";
import { useCombatStore } from "../stores/combatStore";
import { useCrewStore } from "../stores/crewStore";
import { useExplorationStore } from "../stores/explorationStore";
import { useGameStore } from "../stores/gameStore";
import { useInventoryStore } from "../stores/inventoryStore";
import { useMissionStore } from "../stores/missionStore";
import { useNavStore } from "../stores/navStore";
import { useRecruitStore } from "../stores/recruitStore";
import { useShipStore } from "../stores/shipStore";

function activeVesselId() { return useShipStore.getState().activeVesselId; }

function missionEncounterBlocked(vesselId) {
  const nav = useNavStore.getState();
  const combat = useCombatStore.getState().combatByVesselId?.[vesselId];
  return Boolean(nav.travel || nav.pendingEncounter || nav.driftState || combat?.status === "engaged" || useExplorationStore.getState().pendingCombatEncounter);
}

export function processMissionArrivalEncounter(currentMinute) {
  const vesselId = activeVesselId();
  if (!vesselId || missionEncounterBlocked(vesselId)) return { ok: false, reason: "blocked" };
  const missions = useMissionStore.getState();
  const active = missions.activeByVesselId?.[vesselId];
  if (!active || useNavStore.getState().currentNodeId !== active.destinationNodeId) return { ok: false, reason: "notArrived" };
  if (missions.pendingMissionEncountersByVesselId?.[vesselId]) return { ok: true, generated: false };
  if ((missions.resolvedMissionEncounters ?? []).some((entry) => entry.missionId === active.id)) return { ok: false, reason: "alreadyResolved" };
  const result = missions.generateMissionEncounterForVessel({ vesselId, timing: "arrival", currentMinute, seed: `${vesselId}:${active.id}:arrival` });
  if (result.ok && result.generated) useGameStore.getState().addLog(`임무 조우 카드 발생: ${result.encounter.title}`);
  return result;
}

function aggregatePrepared(settlement, { includeReward }) {
  const resourceDelta = {};
  const rewardResources = {};
  const items = [];
  let dust = 0;
  let crewRisk = null;
  let recruitTemplateId = null;
  let combat = null;
  const logs = [];
  settlement.preparedEffects.forEach((effect) => {
    if (effect.kind === "resource") Object.entries(effect.delta ?? {}).forEach(([key, value]) => { resourceDelta[key] = (resourceDelta[key] ?? 0) + value; });
    if (effect.kind === "preparedCrewRisk") crewRisk = effect;
    if (effect.kind === "combat") combat = effect;
    if (effect.kind === "log" && effect.message) logs.push(effect.message);
    if (includeReward && effect.kind === "preparedReward") {
      Object.entries(effect.resources ?? {}).forEach(([key, value]) => { if (key === "dust") dust += value; else rewardResources[key] = (rewardResources[key] ?? 0) + value; });
      items.push(...(effect.items ?? []));
      recruitTemplateId = effect.recruitTemplateId ?? recruitTemplateId;
    }
  });
  return { resourceDelta, rewardResources, items, dust, crewRisk, recruitTemplateId, combat, logs };
}

function applyOnce({ vesselId, settlement, includeReward, afterStep }) {
  const claimId = settlement.claimId;
  const prepared = aggregatePrepared(settlement, { includeReward });
  const gameClaim = `${claimId}:${includeReward ? "reward" : "cost"}:game`;
  const gameDelta = includeReward ? prepared.rewardResources : prepared.resourceDelta;
  useGameStore.getState().applyEncounterResources(gameClaim, gameDelta);
  afterStep?.("game");
  if (!includeReward) {
    useCrewStore.getState().applyEncounterCrewRisk(`${claimId}:crew`, prepared.crewRisk ?? {});
    afterStep?.("crew");
    prepared.logs.forEach((message) => useGameStore.getState().addLog(`임무 조우: ${message}`));
  } else {
    useInventoryStore.getState().applyEncounterGrant(`${claimId}:inventory`, { dust: prepared.dust, items: prepared.items });
    afterStep?.("inventory");
    if (prepared.recruitTemplateId) useRecruitStore.getState().applyEncounterCandidate(`${claimId}:recruit`, prepared.recruitTemplateId);
    afterStep?.("recruit");
  }
  return prepared;
}

function startPreparedCombat(vesselId, encounter, settlement, combatEffect) {
  const existing = useCombatStore.getState().combatByVesselId?.[vesselId];
  if (existing?.status === "engaged") return existing.source?.claimId === settlement.claimId ? { ok: true, combat: existing } : { ok: false, reason: "combatBusy" };
  const nav = useNavStore.getState();
  const node = nav.sector?.nodes?.find((entry) => entry.id === nav.currentNodeId);
  const danger = Math.max(1, Math.round((node?.danger ?? 2) + (combatEffect?.dangerBonus ?? 0)));
  const profile = getSectorProfile(nav.sectorIndex ?? 0);
  const resolved = resolveEnemyFleet(combatEffect?.enemyId, { danger, maxRisk: profile.enemyRiskCeiling, rewardMultiplier: profile.rewardMultiplier, seed: settlement.claimId });
  if (!resolved.exact && combatEffect?.enemyId) useGameStore.getState().addLog(`알 수 없는 임무 적 ID ${combatEffect.enemyId}; ${resolved.enemy.name}(으)로 안전 대체했습니다.`);
  const combat = { ...createCombatState(resolved.enemy), source: { kind: "missionEncounter", encounterId: encounter.id, runtimeId: encounter.id, stageId: encounter.timing, missionId: encounter.missionId, optionId: settlement.optionId, claimId: settlement.claimId, danger } };
  return useCombatStore.getState().startCombat({ vesselId, combat, targetId: "hull", feed: [`임무 조우 전투 발생: ${encounter.title}`, `${resolved.enemy.name} 식별.`] });
}

export function settleMissionEncounterChoice({ vesselId = activeVesselId(), runtimeId, stageId, claimId, optionId, currentMinute = useGameStore.getState().currentMinute, afterStep } = {}) {
  const crewIds = useCrewStore.getState().crew.filter((member) => member.alive !== false).map((member) => member.id);
  const preparedResult = useMissionStore.getState().prepareMissionEncounter({ vesselId, runtimeId, stageId, claimId, optionId, currentMinute, livingCrewIds: crewIds });
  if (!preparedResult.ok) return preparedResult;
  const encounter = useMissionStore.getState().pendingMissionEncountersByVesselId[vesselId];
  const settlement = encounter.settlement;
  if (["prepared", "settling"].includes(settlement.status)) {
    const existingCombat = useCombatStore.getState().combatByVesselId?.[vesselId];
    if (existingCombat?.source?.claimId === settlement.claimId) {
      useMissionStore.getState().setMissionEncounterSettlementStatus({ vesselId, claimId: settlement.claimId, status: "waitingCombat" });
      if (existingCombat.status === "engaged") return { ok: true, waitingCombat: true, repeated: true, claimId: settlement.claimId, combat: existingCombat };
      resumeCombatSettlement(currentMinute);
      return { ok: existingCombat.status === "won", repeated: true, claimId: settlement.claimId, combatResult: existingCombat.status };
    }
  }
  if (settlement.status === "waitingCombat") {
    const combat = useCombatStore.getState().combatByVesselId?.[vesselId];
    if (combat?.source?.claimId !== settlement.claimId) return { ok: false, reason: "combatStateMissing" };
    if (combat.status === "engaged") return { ok: true, waitingCombat: true, repeated: true, claimId: settlement.claimId, combat };
    if (combat.status === "won") {
      resumeCombatSettlement(currentMinute);
      return { ok: true, finalized: !useMissionStore.getState().pendingMissionEncountersByVesselId[vesselId], repeated: true, claimId: settlement.claimId };
    }
    return { ok: false, reason: `combat:${combat.status ?? "missing"}` };
  }
  if (settlement.status === "settled") return useMissionStore.getState().finalizeMissionEncounter({ vesselId, runtimeId, stageId, claimId: settlement.claimId, optionId, currentMinute });
  if (settlement.status === "failed") return useMissionStore.getState().failMission({ vesselId, currentMinute, reason: `missionCombat:${settlement.combatResult ?? "failed"}`, expectedMissionId: encounter.missionId });
  if (settlement.status === "finalized") return { ok: true, repeated: true, claimId: settlement.claimId };
  const prepared = aggregatePrepared(settlement, { includeReward: false });
  applyOnce({ vesselId, settlement, includeReward: false, afterStep });
  if (prepared.combat) {
    const started = startPreparedCombat(vesselId, encounter, settlement, prepared.combat);
    if (!started.ok) { useMissionStore.getState().setMissionEncounterSettlementStatus({ vesselId, claimId: settlement.claimId, status: "settling" }); return started; }
    afterStep?.("combat");
    useMissionStore.getState().setMissionEncounterSettlementStatus({ vesselId, claimId: settlement.claimId, status: "waitingCombat" });
    useGameStore.getState().setPaused(true);
    return { ok: true, waitingCombat: true, claimId: settlement.claimId, combat: started.combat };
  }
  applyOnce({ vesselId, settlement, includeReward: true, afterStep });
  useMissionStore.getState().setMissionEncounterSettlementStatus({ vesselId, claimId: settlement.claimId, status: "settled" });
  afterStep?.("settled");
  return useMissionStore.getState().finalizeMissionEncounter({ vesselId, runtimeId, stageId, claimId: settlement.claimId, optionId, currentMinute });
}

function resumeCombatSettlement(currentMinute) {
  const missions = useMissionStore.getState();
  Object.entries(missions.pendingMissionEncountersByVesselId ?? {}).forEach(([vesselId, encounter]) => {
    const settlement = encounter?.settlement;
    if (settlement?.status === "settled") {
      useMissionStore.getState().finalizeMissionEncounter({ vesselId, runtimeId: encounter.id, stageId: encounter.timing, claimId: settlement.claimId, optionId: settlement.optionId, currentMinute });
      return;
    }
    if (settlement?.status === "failed") {
      useMissionStore.getState().failMission({ vesselId, currentMinute, reason: `missionCombat:${settlement.combatResult ?? "failed"}`, expectedMissionId: encounter.missionId });
      return;
    }
    if (!["prepared", "settling", "waitingCombat"].includes(settlement?.status)) return;
    const combat = useCombatStore.getState().combatByVesselId?.[vesselId];
    if (!combat || combat.source?.claimId !== settlement.claimId) return;
    if (settlement.status !== "waitingCombat") useMissionStore.getState().setMissionEncounterSettlementStatus({ vesselId, claimId: settlement.claimId, status: "waitingCombat" });
    if (combat.status === "engaged") return;
    if (combat.status === "won") {
      applyOnce({ vesselId, settlement, includeReward: true });
      useMissionStore.getState().setMissionEncounterSettlementStatus({ vesselId, claimId: settlement.claimId, status: "settled", combatResult: "won" });
      useMissionStore.getState().finalizeMissionEncounter({ vesselId, runtimeId: encounter.id, stageId: encounter.timing, claimId: settlement.claimId, optionId: settlement.optionId, currentMinute });
      return;
    }
    if (["lost", "retreated"].includes(combat.status)) {
      useMissionStore.getState().setMissionEncounterSettlementStatus({ vesselId, claimId: settlement.claimId, status: "failed", combatResult: combat.status });
      useMissionStore.getState().failMission({ vesselId, currentMinute, reason: `missionCombat:${combat.status}`, expectedMissionId: encounter.missionId });
    }
  });
}

export function reconcileMissionCombatOutcome(currentMinute = useGameStore.getState().currentMinute) {
  resumeCombatSettlement(currentMinute);
}

export function processDueStoryRuntimes(currentMinute) {
  const state = useMissionStore.getState();
  const blocked = new Set();
  Object.values(state.eventRuntimesById ?? {}).forEach((runtime) => { if (missionEncounterBlocked(runtime.vesselId) || state.pendingMissionEncountersByVesselId?.[runtime.vesselId]) blocked.add(runtime.vesselId); });
  const due = getDueEventRuntimes(state.eventRuntimesById, currentMinute);
  for (const runtime of due) {
    if (!canPresentStoryRuntime({ runtime, pendingByVesselId: state.pendingStoryEncounterByVesselId, blockedVesselIds: blocked })) continue;
    const chain = getEventChain(runtime.chainId) ?? EVENT_CHAINS.find((entry) => entry.id === runtime.chainId);
    const stage = chain?.stages?.find((entry) => entry.id === runtime.stageId);
    if (!chain?.enabled || !stage) {
      useMissionStore.setState((next) => ({ eventRuntimesById: { ...next.eventRuntimesById, [runtime.id]: { ...runtime, status: EVENT_CHAIN_STATUS.cancelled, pendingClaim: null, updatedAt: currentMinute } } }));
      continue;
    }
    const encounter = { runtimeId: runtime.id, chainId: chain.id, chainTitle: chain.title, chainStageLabel: stage.label ?? stage.id, stageId: stage.id, claimId: storyEncounterClaimId(runtime), title: stage.title, scene: stage.scene, category: "story", timing: "story", risk: stage.risk ?? "medium", icon: stage.icon ?? "✦", manualOnly: true, options: stage.options ?? [] };
    useMissionStore.setState((next) => ({ eventRuntimesById: { ...next.eventRuntimesById, [runtime.id]: { ...runtime, status: EVENT_CHAIN_STATUS.pending, updatedAt: currentMinute } }, pendingStoryEncounterByVesselId: { ...next.pendingStoryEncounterByVesselId, [runtime.vesselId]: encounter } }));
    break;
  }
}

export function processEncounterOrchestration(currentMinute) {
  processMissionArrivalEncounter(currentMinute);
  resumeCombatSettlement(currentMinute);
  processDueStoryRuntimes(currentMinute);
}
