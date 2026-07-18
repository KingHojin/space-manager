import { useEffect } from "react";
import { DECODE_RULES, DUST, GAME_TIME } from "../data/constants";
import { getEventChain } from "../data/eventChains";
import { getRoomDef } from "../data/shipRooms";
import { statLabel } from "../utils/format";
import { getActiveModifiers } from "./cardEffects";
import { getCrisisLabel } from "./crisisSystem";
import { jobToLegacyShipWork } from "./jobMigration";
import { evaluatePolicies } from "./policyEngine";
import { buildCrisisReport, buildNavigationReport, buildPolicyReport, buildWorkReport } from "./reportSystem";
import { getActiveVesselCrewAiSnapshot } from "./vesselScope";
import { applyFuelDelta } from "./fuelSystem";
import { useCrewStore } from "../stores/crewStore";
import { useCombatStore } from "../stores/combatStore";
import { useExplorationStore } from "../stores/explorationStore";
import { useEquipmentStore } from "../stores/equipmentStore";
import { useGameStore } from "../stores/gameStore";
import { useInventoryStore } from "../stores/inventoryStore";
import { useJobStore } from "../stores/jobStore";
import { useMissionStore } from "../stores/missionStore";
import { useNavStore } from "../stores/navStore";
import { usePolicyStore } from "../stores/policyStore";
import { useRecruitStore } from "../stores/recruitStore";
import { useReportStore } from "../stores/reportStore";
import { useShipInteriorStore } from "../stores/shipInteriorStore";
import { useShipStore } from "../stores/shipStore";
import { useSkillStore } from "../stores/skillStore";
import { settleGateRequisition } from "./requisitionSettlement";
import { applyHullRepair, getSkillEffects } from "./skillEffects";
import { resolveEnemyFleet } from "./combatEngine";
import { processEncounterOrchestration } from "../orchestration/missionEncounterOrchestrator";
import { getSectorBoundStoryBlocker, processStoryJobCompletion, reconcileEventChainRuntimes, settleManualEventChainStarter } from "../orchestration/eventChainOrchestrator";
import { processIncidentJobCompletion, processIncidentOrchestration } from "../orchestration/incidentDirectorOrchestrator";

const MEAL_COOLDOWN_MINUTES = 120;
const LEGACY_JOB_MIGRATION_VERSION = 3;

export const formatGameDate = (totalMinutes) => {
  const year = Math.floor(totalMinutes / 525600);
  const remYear = totalMinutes % 525600;
  const month = Math.floor(remYear / 43200) + 1;
  const remMonth = remYear % 43200;
  const day = Math.floor(remMonth / 1440) + 1;
  const remDay = remMonth % 1440;
  const hour = String(Math.floor(remDay / 60)).padStart(2, "0");
  const minute = String(Math.floor(remDay % 60)).padStart(2, "0");
  return `우주력 ${year}년 ${month}월 ${day}일 ${hour}:${minute}`;
};

function itemQty(items, itemId) {
  return items.find((item) => item.id === itemId)?.qty ?? 0;
}

function applyNavEffect(effect, currentMinute) {
  if (!effect) return;
  if (effect.kind === "gateRequisition") {
    const credits = Math.max(0, (effect.baseCredits ?? 0) + (effect.bonusCredits ?? 0));
    if (credits > 0) useGameStore.getState().addResources({ credits });
    (effect.items ?? []).forEach(({ itemId, qty }) => {
      if (itemId && qty > 0) useInventoryStore.getState().addItem(itemId, qty);
    });
    if ((effect.skillPoints ?? 0) > 0) useSkillStore.getState().grantPoint(effect.skillPoints);
    const itemSummary = (effect.items ?? []).map(({ itemId, qty }) => `${itemId} x${qty}`).join(", ");
    const packageSummary = [effect.bonusCredits ? `₢${effect.bonusCredits}` : null, itemSummary || null].filter(Boolean).join(" · ");
    useReportStore.getState().addReport(buildNavigationReport({
      title: effect.isExpeditionFinale ? "최종 관문 보급 수령" : `섹터 ${effect.sectorNumber} 관문 보급`,
      summary: `기본 보급 ₢${effect.baseCredits ?? 0} · 선택 ${effect.packageLabel ?? effect.packageId}${packageSummary ? ` ${packageSummary}` : ""} · 스킬 포인트 +${effect.skillPoints ?? 0}.`,
      navKind: "gateRequisition",
      currentMinute,
      details: {
        claimId: effect.claimId,
        sectorNumber: effect.sectorNumber,
        packageId: effect.packageId,
        credits,
        items: effect.items ?? [],
        skillPoints: effect.skillPoints ?? 0,
      },
    }));
  }
  if (effect.kind === "resource" && effect.delta) useGameStore.getState().addResources(effect.delta);
  if (effect.kind === "fuel" && effect.delta) {
    applyFuelDelta(effect.delta);
    if (effect.delta < 0 && useNavStore.getState().fuel <= 0 && !useNavStore.getState().driftState) {
      const drift = useNavStore.getState().enterDrift(currentMinute, "fuel_loss_event");
      drift.effects.forEach((nested) => applyNavEffect(nested, currentMinute));
      drift.logs.forEach((message) => useGameStore.getState().addLog(`항해: ${message}`));
    }
  }
  if (effect.kind === "spawnCrisis") {
    const spawned = useShipInteriorStore.getState().spawnCrisis(effect.roomId, effect.type, effect.severity ?? 1, currentMinute);
    // Phase 20-D: this is the encounter/drift-triggered spawn path (see
    // navEncounters.js outcomes and navStore.js's drift crisis roll) — the
    // OTHER spawn path, tickCrises' own ambient/escalation spawns, reports
    // itself via reportCrisisEvent() inside processCrises() below. The two
    // paths can never double-report the SAME crisis: addCrisisToDraft (which
    // both ultimately call) refuses to spawn into a room that already has
    // `activeCrisisId` set, and processNavigation always runs before
    // processCrises within a single processTimedJobs tick (see call order
    // below), so a crisis spawned here occupies its room before tickCrises'
    // ambient-spawn pass for that same room even runs this same tick. See
    // gameClock.integration.test.js's Phase 20-D block for a test pinning
    // this down.
    if (spawned) reportCrisisEvent({ kind: "spawned", crisis: spawned, roomId: spawned.roomId }, currentMinute);
  }
  if (effect.kind === "crewNeeds") {
    const logs = useCrewStore.getState().tickCrewNeeds({ deltaMinutes: effect.deltaMinutes, mode: effect.mode ?? "normal", severity: effect.severity ?? 1 });
    logs.forEach((message) => useGameStore.getState().addLog(`승무원 상태: ${message}`));
  }
  if (effect.kind === "driftPressure") {
    if ((effect.minutesDrifting ?? 0) % 120 < (effect.deltaMinutes ?? 0)) useGameStore.getState().addLog(`표류 지속: ${Math.round((effect.minutesDrifting ?? 0) / 60)}시간 경과 · severity ${effect.severity}.`);
  }
  if (effect.kind === "injure") {
    const crew = useCrewStore.getState().crew.filter((member) => member.alive);
    const target = effect.crewId === "random" ? crew[Math.floor(Math.random() * crew.length)] : crew.find((member) => member.id === effect.crewId);
    if (target) useCrewStore.getState().applyCrewOutcome({ memberId: target.id, injury: effect.state ?? "경상", morale: -1 });
  }
  if (effect.kind === "recruitOffer" && effect.templateId) {
    const result = useRecruitStore.getState().addCandidate(effect.templateId, "navigation");
    useNavStore.getState().addRecruitCandidate(effect.templateId);
    useGameStore.getState().addLog(result.ok ? `영입 후보 확보: ${effect.templateId}. 영입 화면에서 검토할 수 있습니다.` : `영입 후보 처리 실패: ${effect.templateId} (${result.reason}).`);
  }
  if (effect.kind === "combat") {
    const resolved = resolveEnemyFleet(effect.enemyId, { seed: effect.enemyId ?? `${currentMinute}` });
    useExplorationStore.getState().setPendingCombatEncounter({ id: resolved.enemy.id, title: resolved.enemy.name, enemyId: resolved.enemy.id, fallback: !resolved.exact });
    useGameStore.getState().addLog(resolved.exact ? `교전 조우 식별: ${resolved.enemy.name}.` : `알 수 없는 적 ID ${effect.enemyId ?? "없음"}; ${resolved.enemy.name}(으)로 안전 대체했습니다.`);
  }
  if (effect.kind === "campaignComplete") {
    useGameStore.getState().setPaused(true);
    useGameStore.getState().addLog(`원정 완주 기록: ${effect.sectorsCleared ?? 0}개 섹터 항로 개척. 장기 함대 캠페인의 첫 이정표를 달성했습니다.`);
  }
  if (effect.kind === "log" && effect.message) useGameStore.getState().addLog(effect.message);
}

function processNavigation(currentMinute, deltaMinutes) {
  const travelResult = useNavStore.getState().tickTravel(deltaMinutes, currentMinute);
  travelResult.effects.forEach((effect) => applyNavEffect(effect, currentMinute));
  travelResult.logs.forEach((message) => useGameStore.getState().addLog(`항해: ${message}`));
  const driftResult = useNavStore.getState().tickDrift(deltaMinutes, currentMinute);
  driftResult.effects.forEach((effect) => applyNavEffect(effect, currentMinute));
  driftResult.logs.forEach((message) => useGameStore.getState().addLog(`표류: ${message}`));
}

function gateTransitBlockReason() {
  const vesselId = useShipStore.getState().activeVesselId;
  const missionState = useMissionStore.getState();
  const combat = useCombatStore.getState().combatByVesselId?.[vesselId];
  if (missionState.activeByVesselId?.[vesselId]) return "활성 임무를 완료하거나 포기해야 관문을 통과할 수 있습니다.";
  if (missionState.pendingMissionEncountersByVesselId?.[vesselId]) return "대기 중인 임무 조우를 먼저 해결해야 합니다.";
  if (combat?.status === "engaged") return "진행 중인 전투를 먼저 끝내야 합니다.";
  if (useExplorationStore.getState().pendingCombatEncounter) return "대기 중인 긴급 교전을 먼저 해결해야 합니다.";
  const storyBlocker = getSectorBoundStoryBlocker(vesselId);
  if (storyBlocker) return `${storyBlocker.title} 연속 사건을 완료하거나 철수해야 관문을 통과할 수 있습니다.`;
  return null;
}

export function applyNavigationEncounter(optionId, currentMinute = useGameStore.getState().currentMinute, context = {}) {
  const encounter = useNavStore.getState().pendingEncounter;
  if (context.expectedClaimId && encounter?.claimId !== context.expectedClaimId) {
    return { ok: false, reason: "staleClaim", effects: [], logs: [] };
  }
  const option = encounter?.options?.find((entry) => entry.id === optionId);
  if (!option) return { ok: false, reason: "invalidOption", effects: [], logs: [] };
  if (option.manualOnly && !context.manual) return { ok: false, reason: "manualOnly", effects: [], logs: [] };
  if ((option.outcome ?? []).some((effect) => effect.kind === "startEventChain")) {
    return settleManualEventChainStarter({ encounter, option, currentMinute, manual: context.manual, expectedClaimId: context.expectedClaimId, afterStep: context.afterStep });
  }
  const requisitionClaim = (option?.outcome ?? []).find((effect) => effect.kind === "gateRequisitionClaim");
  if (requisitionClaim) {
    if (encounter.claimId !== requisitionClaim.claimId || context.expectedClaimId !== requisitionClaim.claimId) {
      return { ok: false, reason: "staleClaim", effects: [], logs: [] };
    }
    return claimGateRequisition(requisitionClaim.packageId, requisitionClaim.claimId, currentMinute, { optionId });
  }
  const isGateTransit = (option?.outcome ?? []).some((effect) => effect.kind === "nextSector");
  const fuelGain = (option?.outcome ?? []).reduce((sum, effect) => {
    if (effect.kind === "fuel") return sum + Math.max(0, effect.delta ?? 0);
    if (effect.kind === "resource") return sum + Math.max(0, effect.delta?.fuel ?? 0);
    return sum;
  }, 0);
  const creditCost = (option?.outcome ?? []).reduce((sum, effect) => {
    const credits = effect.kind === "resource" ? effect.delta?.credits ?? 0 : 0;
    return sum + Math.max(0, -credits);
  }, 0);
  const isFuelPurchase = fuelGain > 0 && creditCost > 0;
  if (useNavStore.getState().driftState && isFuelPurchase) {
    const logs = ["결재 실패: 표류 중에는 정거장 보급을 이용할 수 없습니다. 구조 계약을 요청하세요."];
    logs.forEach((message) => useGameStore.getState().addLog(`항해 조우: ${message}`));
    return { ok: false, reason: "drifting", effects: [], logs };
  }
  const blockReason = isGateTransit ? (context.manual ? gateTransitBlockReason() : "관문 통과는 함장의 수동 결재가 필요합니다.") : null;
  if (creditCost > useGameStore.getState().resources.credits) {
    const logs = [`결재 실패: 크레딧이 부족합니다. 필요 ₢${creditCost}.`];
    logs.forEach((message) => useGameStore.getState().addLog(`항해 조우: ${message}`));
    return { ok: false, reason: "insufficientCredits", effects: [], logs };
  }
  const { effects, logs } = useNavStore.getState().resolveEncounter(optionId, currentMinute, {
    allowGateTransit: !isGateTransit || !blockReason,
    gateBlockReason: blockReason,
  });
  effects.forEach((effect) => applyNavEffect(effect, currentMinute));
  logs.forEach((message) => useGameStore.getState().addLog(`항해 조우: ${message}`));
  return { ok: true, effects, logs };
}

export function claimGateRequisition(packageId, claimId, currentMinute = useGameStore.getState().currentMinute, options = {}) {
  if (!claimId) return { ok: false, reason: "missingClaimId", newlyClaimed: false, effects: [] };
  const optionId = options.optionId ?? `claim:${claimId}:${packageId}`;
  return settleGateRequisition({ packageId, claimId, optionId, currentMinute, afterStep: options.afterStep });
}

export function requestDriftRescue(currentMinute = useGameStore.getState().currentMinute) {
  const nav = useNavStore.getState();
  const quote = nav.getRescueQuote(currentMinute);
  if (!quote.ok) return quote;
  if (!useGameStore.getState().spendCredits(quote.cost)) return { ...quote, ok: false, reason: "insufficientCredits" };
  const result = useNavStore.getState().requestRescue(currentMinute);
  if (!result.ok) {
    useGameStore.getState().addResource("credits", quote.cost);
    return result;
  }
  useGameStore.getState().setPaused(false);
  useGameStore.getState().addLog(`구조 계약 체결: ₢${quote.cost} 선결제 · ${quote.delayMinutes}분 후 구조선 도착 · 비상 연료 +${quote.fuel}.`);
  return { ok: true, ...quote, rescue: result.rescue };
}

// Orchestration wrapper around crewStore.applyCombatCasualty: crewStore
// cannot import jobStore directly (no cross-store imports outside the
// grandfathered jobStore/gameStore -> inventoryStore exceptions), but a
// crew member's death needs to cancel their now-orphaned active jobStore
// jobs (training/treatment/recovery) too, or those jobs sit occupying a
// room slot until an eventual no-op completion. gameClock is the
// designated multi-store orchestration point, so this lives here — the
// same pattern applyNavigationEncounter already established for UI
// components that need a casualty+jobs bundle instead of calling
// crewStore.applyCombatCasualty directly. All three call sites (this
// module's applyCrisisEffect, Combat.jsx, Exploration.jsx) use this
// instead of the bare crewStore action so the job-cancellation behavior
// can't be forgotten at any one of them.
export function reconcileDeceasedEquipment() {
  const deceased = useCrewStore.getState().crew.filter((member) => !member.alive);
  return deceased.filter((member) => useEquipmentStore.getState().escrowDeceasedCrew({ crewId: member.id, claimId: `death-escrow:${member.id}` })).map((member) => member.id);
}

export function applyCombatCasualtyWithJobs({ memberId, injury = "경상", morale = -1, afterStep } = {}) {
  useCrewStore.getState().applyCombatCasualty({ memberId, injury, morale });
  afterStep?.("crew");
  if (injury !== "전사") return [];
  reconcileDeceasedEquipment();
  afterStep?.("equipment");
  const cancelledJobs = useJobStore.getState().cancelJobsForCrew(memberId);
  if (cancelledJobs.length > 0) {
    useGameStore.getState().addLog(`작업 취소: 전사한 승무원의 진행 중이던 작업 ${cancelledJobs.length}건이 취소되었습니다.`);
  }
  return cancelledJobs;
}

function processJobScheduler(currentMinute) {
  const crew = useCrewStore.getState().crew;
  const logs = useJobStore.getState().runScheduler({ currentMinute, crew });
  logs.forEach((message) => useGameStore.getState().addLog(`작업: ${message}`));
}

function processCrewAI(currentMinute) {
  const crewStore = useCrewStore.getState();
  const logs = crewStore.runCrewAI(getActiveVesselCrewAiSnapshot({ currentMinute }));
  logs.forEach((message) => useGameStore.getState().addLog(`승무원 AI: ${message}`));
}

function refreshCrewAiImmediatelyForCrisis() {
  if ((useShipInteriorStore.getState().activeCrises ?? []).length <= 0) return;
  useCrewStore.setState({ lastCrewAiAt: null });
}

function processCrewMeals(currentMinute) {
  const crewStore = useCrewStore.getState();
  const mealActivities = (crewStore.crewActivities ?? []).filter((activity) => activity.intent === "meal").slice(0, 2);
  if (mealActivities.length === 0) return;
  const hasCook = crewStore.crew.some((member) => member.alive && member.role === "조리실");
  mealActivities.forEach((activity) => {
    const member = useCrewStore.getState().crew.find((entry) => entry.id === activity.memberId);
    if (!member?.alive || (member.needs?.hunger ?? 0) < 58) return;
    if (member.lastMealAt && currentMinute - member.lastMealAt < MEAL_COOLDOWN_MINUTES) return;
    const inventoryStore = useInventoryStore.getState();
    const items = inventoryStore.items;
    const ingredients = itemQty(items, "raw-ingredients");
    const rations = itemQty(items, "food-ration");
    if (hasCook && ingredients > 0) {
      inventoryStore.removeItem("raw-ingredients", 1);
      const message = useCrewStore.getState().completeMeal({ memberId: member.id, quality: "cooked", currentMinute });
      if (message) useGameStore.getState().addLog(`식당: ${message} 식재료 1개 사용.`);
      return;
    }
    if (rations > 0) {
      inventoryStore.removeItem("food-ration", 1);
      const message = useCrewStore.getState().completeMeal({ memberId: member.id, quality: "ration", currentMinute });
      if (message) useGameStore.getState().addLog(`식당: ${message} 표준 식량 1개 사용.`);
      return;
    }
    if ((member.needs?.hunger ?? 0) >= 75) useGameStore.getState().addLog(`${member.name} 식사 실패: 식량이 부족합니다.`);
  });
}

function processCrewNeeds(deltaMinutes) {
  if (useNavStore.getState().driftState) return;
  const logs = useCrewStore.getState().tickCrewNeeds({ deltaMinutes, mode: "normal", severity: 1 });
  logs.forEach((message) => useGameStore.getState().addLog(`승무원 상태: ${message}`));
}

function applyRoomJobEffect(effect) {
  if (!effect) return;
  if (effect.crewFatigueAll) useCrewStore.getState().crew.forEach((member) => { if (member.alive) useCrewStore.getState().applyCrewOutcome({ memberId: member.id, fatigue: effect.crewFatigueAll }); });
  if (effect.hullDelta) useGameStore.getState().addResources({ hull: effect.hullDelta });
}

function processRoomJobs(currentMinute, deltaMinutes) {
  const crewStore = useCrewStore.getState();
  const activities = crewStore.crewActivities ?? [];
  const roomActivities = {};
  activities.forEach((activity) => {
    if (activity.intent !== "room-job" || !activity.roomId) return;
    const list = roomActivities[activity.roomId] ?? [];
    list.push({ memberId: activity.memberId, roomId: activity.roomId, jobId: activity.jobId, speedMultiplier: activity.speedMultiplier ?? 1 });
    roomActivities[activity.roomId] = list;
  });
  const usageByRoom = {};
  useJobStore.getState().jobs.forEach((job) => {
    if (job.status !== "in_progress" || !job.roomId) return;
    usageByRoom[job.roomId] = (usageByRoom[job.roomId] ?? 0) + 1;
  });
  const { completedJobs, logs } = useShipInteriorStore.getState().tickRooms({ currentMinute, deltaMinutes, roomActivities, roleCoverage: crewStore.getRoleCoverage(), usageByRoom, relationships: crewStore.relationships });
  completedJobs.forEach((job) => applyRoomJobEffect(job.effect, job.roomId));
  logs.forEach((message) => useGameStore.getState().addLog(`함선: ${message}`));
}

function applyCrisisEffect(effect) {
  if (!effect) return;
  if (effect.type === "crewCasualty" && effect.memberId) applyCombatCasualtyWithJobs({ memberId: effect.memberId, injury: effect.injury ?? "경상", morale: -1 });
  if (effect.type === "resourceDelta" && effect.resources) useGameStore.getState().addResources(effect.resources);
}

// Phase 20-B: only "spawned" and "resolved" crisisEvents become reports
// (critical / info respectively, both category defaults) — "escalated" is
// deliberately skipped here to avoid over-reporting: the spawn report
// already exists for that crisis, and ShipInterior's live crisis cards show
// escalation state in real time (see the volume-selection table in this
// PR's docs). Report bodies are built from the structured `crisis`/`roomId`
// fields tickCrises hands back, not by parsing the parallel `logs` strings.
function reportCrisisEvent(event, currentMinute) {
  if (event.kind !== "spawned" && event.kind !== "resolved") return;
  const roomLabel = getRoomDef(event.roomId)?.label ?? event.roomId;
  const label = getCrisisLabel(event.crisis);
  if (event.kind === "spawned") {
    useReportStore.getState().addReport(
      buildCrisisReport({
        title: "함내 위기 발생",
        summary: `${label} 발생 — ${roomLabel}, 심각도 ${event.crisis.severity}. 대응 인력을 배정하세요.`,
        crisisKind: "spawned",
        currentMinute,
        priority: "critical",
      }),
    );
    return;
  }
  useReportStore.getState().addReport(
    buildCrisisReport({
      title: "함내 위기 해결",
      summary: `${label} 진압 완료 — ${roomLabel}. 먼지 +${event.dustGain ?? 0} 회수.`,
      crisisKind: "resolved",
      currentMinute,
      priority: "info",
    }),
  );
}

function processCrises(currentMinute, deltaMinutes) {
  const crewStore = useCrewStore.getState();
  const activities = crewStore.crewActivities ?? [];
  const crisisActivities = {};
  activities.forEach((activity) => {
    if (activity.intent !== "crisis-response" || !activity.crisisId) return;
    const list = crisisActivities[activity.crisisId] ?? [];
    list.push({ memberId: activity.memberId, roomId: activity.roomId });
    crisisActivities[activity.crisisId] = list;
  });
  const { effects, logs, crisisEvents } = useShipInteriorStore.getState().tickCrises({ currentMinute, deltaMinutes, crisisActivities, crew: crewStore.crew, roleCoverage: crewStore.getRoleCoverage() });
  effects.forEach(applyCrisisEffect);
  logs.forEach((message) => useGameStore.getState().addLog(`함선 위기: ${message}`));
  (crisisEvents ?? []).forEach((event) => reportCrisisEvent(event, currentMinute));
}

function processCrewHealth(currentMinute, deltaMinutes) {
  const logs = useCrewStore.getState().tickCrewHealth({ currentMinute, deltaMinutes });
  logs.forEach((message) => useGameStore.getState().addLog(`의무실: ${message}`));
}

// Phase 19-B: throttle state for repeated policy *warning* logs
// ("diagnostic" actions only — a real "enqueue-ship-work" always logs
// immediately, since it's already self-limiting: the next tick sees the
// freshly-enqueued job via jobStore.getActiveJobs() and skips re-firing).
// Deliberately a module-level in-memory Map, NOT stored in policyStore or
// gameStore: it is purely a display-spam guard, not game state, so it does
// not need to survive a save/reload — a fresh page load just re-warns on
// the next tick past the threshold, which is harmless. Keying is
// `${policyId}:${reason}` so e.g. auto-hull-repair's "insufficient-scrap"
// warning and fuel-reserve's "low-fuel" warning throttle independently.
const policyWarningLastLoggedMinute = new Map();
const POLICY_WARNING_THROTTLE_MINUTES = 60;

function shouldLogPolicyMessage(action, currentMinute) {
  if (action.kind !== "diagnostic") return true;
  const key = `${action.policyId}:${action.detail?.reason ?? action.kind}`;
  const last = policyWarningLastLoggedMinute.get(key);
  if (last !== undefined && currentMinute - last < POLICY_WARNING_THROTTLE_MINUTES) return false;
  policyWarningLastLoggedMinute.set(key, currentMinute);
  return true;
}

// applyPolicyActions: two action kinds mutate gameplay state today.
// "enqueue-ship-work" (auto-hull-repair's real repair-job enqueue) mirrors
// Ship.jsx's ScrapRepairCard.onRepair (handleRepair) exactly: remove the
// consumed inputItems from inventoryStore, then hand the same job payload
// shape to jobStore.enqueueShipWork. "enqueue-treatment-job"
// (auto-treatment's real treatment-job enqueue, Phase 19-C) mirrors
// Crew.jsx's treat() exactly: spend the job's cost via gameStore.spendCredits
// first — same as Crew.jsx checks `if (!spendCredits(rule.cost))` before
// calling startTreatment — and only enqueue via jobStore.enqueueTreatment if
// that succeeds. spendCredits can fail here even though policyEngine.js
// already checked resources.credits against the cost, because that check
// ran against a snapshot taken at the start of this tick's processPolicies;
// if credits dropped in between (e.g. another policy action spent them
// first), this silently skips and lets the next tick retry — no store
// mutation happens on failure. Either way, a policy-triggered job is
// indistinguishable from a manually-queued one once it's in the job queue.
// "diagnostic" actions are intentionally ignored here; they only ever
// produce a log (see processPolicies below).
// Phase 20-B: every branch below that actually mutates a store (as opposed
// to "diagnostic", which applyPolicyActions never sees — see the kind check
// in each branch) also files a "policy" report via reportStore.addReport(),
// built from the same structured `action.detail`/`job` fields the branch
// already used to perform the mutation — never by parsing the parallel log
// string processPolicies() emits (see reportSystem.js's file-header "no log
// parsing" rule). This is gameClock.js, the designated orchestrator, so a
// direct addReport() call here is allowed by the architecture rule that
// confines addReport() to gameClock.js + UI components.
function reportPolicyAction(policyId, summary, currentMinute) {
  useReportStore.getState().addReport(buildPolicyReport({ policyId, summary, currentMinute }));
}

function applyPolicyActions(actions, currentMinute) {
  actions.forEach((action) => {
    if (action.kind === "enqueue-ship-work") {
      const job = action.detail?.job;
      if (!job) return;
      (job.payload?.inputItems ?? []).forEach(({ itemId, qty }) => {
        if (itemId && qty) useInventoryStore.getState().removeItem(itemId, qty);
      });
      useJobStore.getState().enqueueShipWork({ ...job, createdAt: currentMinute });
      const roomLabel = getRoomDef(job.roomId)?.label ?? job.roomId;
      const consumed = (job.payload?.inputItems ?? [])
        .filter((entry) => entry.itemId && entry.qty)
        .map((entry) => `${entry.itemId} ${entry.qty}개`)
        .join(", ");
      reportPolicyAction(
        action.policyId,
        `선체 ${Math.round(action.detail?.hull ?? 0)}% (임계값 ${action.detail?.threshold ?? 0}% 미만) — ${roomLabel} 정비 예약${consumed ? `, ${consumed} 소모` : ""}.`,
        currentMinute,
      );
      return;
    }
    if (action.kind === "enqueue-treatment-job") {
      const job = action.detail?.job;
      if (!job) return;
      if (!useGameStore.getState().spendCredits(job.cost ?? 0)) return;
      useJobStore.getState().enqueueTreatment({ ...job, createdAt: currentMinute });
      const member = useCrewStore.getState().crew.find((entry) => entry.id === action.detail?.memberId);
      reportPolicyAction(
        action.policyId,
        `${member?.name ?? "승무원"} ${job.injury ?? ""} 자동 치료 예약 — ₢${job.cost ?? 0}, ${job.duration ?? 0}분.`,
        currentMinute,
      );
      return;
    }
    if (action.kind === "resolve-encounter") {
      const detail = action.detail ?? {};
      // Defensive re-check against the *current* store, not the snapshot
      // policyEngine.js scored against: another path could have resolved or
      // replaced pendingEncounter earlier in this same tick (e.g. a
      // different effect chain), so only proceed if it's still the exact
      // encounter this action was computed for.
      const pending = useNavStore.getState().pendingEncounter;
      if (!pending) return;
      if (pending.manualOnly) return;
      // Every gate interaction, including the locked gate's harmless-looking
      // "hold" option, is captain-only. Automation must not dismiss the card
      // or strand the player without a gate decision.
      if (pending.nodeType === "exit" || pending.nodeType === "requisition" || pending.id === "exit-objective-locked") return;
      if (detail.encounterId && pending.id !== detail.encounterId) return;
      if (!detail.optionId) return;
      // applyNavigationEncounter already does resolveEncounter() +
      // applyNavEffect() for every effect in the chosen option's outcome —
      // reuse it verbatim instead of re-implementing that combination here.
      const result = applyNavigationEncounter(detail.optionId, currentMinute);
      if (!result.ok) return;
      reportPolicyAction(
        action.policyId,
        `${pending.title ?? "조우"} 자동 해결 — "${detail.label ?? detail.optionId}" 선택 (${detail.stance ?? "balanced"} 전략).`,
        currentMinute,
      );
    }
  });
}

// Phase 19-A/19-B/19-D: reads policyStore + snapshots of the stores a
// policy might care about (including jobStore's active jobs,
// inventoryStore's items, navStore's pendingEncounter and
// explorationStore's pendingCombatEncounter, so policyEngine.js can decide
// things like "is a repair already queued" / "do we have enough scrap" /
// "is there an encounter waiting" without ever importing a store itself),
// hands them to the pure systems/policyEngine.js (same orchestration shape
// as every other process* function here: read stores -> call a pure system
// -> apply the returned effects to stores), then applies both the returned
// `logs` (subject to the repeat-warning throttle above) and `actions` (via
// applyPolicyActions) to their respective stores. Every catalog policy
// defaults to disabled (see data/policies.js), so with no player
// interaction this function evaluates to `{ actions: [], logs: [] }` and is
// a no-op — see gameClock.integration.test.js's "policies default OFF" case.
function processPolicies(currentMinute, deltaMinutes) {
  const { policies } = usePolicyStore.getState();
  const resources = useGameStore.getState().resources;
  const crew = useCrewStore.getState().crew;
  const rooms = useShipInteriorStore.getState().rooms;
  const jobs = useJobStore.getState().getActiveJobs();
  const items = useInventoryStore.getState().items;
  const pendingEncounter = useNavStore.getState().pendingEncounter;
  const pendingCombatEncounter = useExplorationStore.getState().pendingCombatEncounter;
  const { actions, logs } = evaluatePolicies({
    policies,
    resources,
    crew,
    rooms,
    currentMinute,
    deltaMinutes,
    jobs,
    items,
    pendingEncounter,
    pendingCombatEncounter,
  });
  // actions/logs are index-aligned by policyEngine.js's contract (see its
  // file header), so actions[i] is always the action that produced logs[i].
  logs.forEach((message, index) => {
    const action = actions[index];
    if (action && !shouldLogPolicyMessage(action, currentMinute)) return;
    useGameStore.getState().addLog(message);
  });
  applyPolicyActions(actions, currentMinute);
}

function applyItemOutputs(outputItems = []) {
  const awarded = [];
  outputItems.forEach(({ itemId, qty }) => {
    if (!itemId || !qty) return;
    useInventoryStore.getState().addItem(itemId, qty);
    awarded.push(`${itemId} x${qty}`);
  });
  return awarded;
}

function applyShipWork(task) {
  if (task.type === "hullRepair") {
    // Deliberately resolve against the doctrine active at completion time.
    // Skill changes while a job is queued therefore affect the final result.
    const effects = getSkillEffects(useSkillStore.getState().levels);
    const hullDelta = applyHullRepair((task.payload?.hullDelta ?? 0) + (task.payload?.workerSnapshot?.outcome?.hullDelta ?? 0), effects.repair);
    if (hullDelta > 0) useGameStore.getState().addResources({ hull: hullDelta });
    return `선체 정비 완료: 선체 +${hullDelta}%.`;
  }
  if (task.type === "salvageProcessing") {
    const outputs = [...(task.payload?.outputItems ?? [])];
    const bonus = Math.max(0, Number(task.payload?.workerSnapshot?.outcome?.outputBonus ?? 0));
    if (bonus > 0 && outputs[0]) outputs[0] = { ...outputs[0], qty: outputs[0].qty + bonus };
    const awarded = applyItemOutputs(outputs);
    return `잔해 분해 완료: ${awarded.length > 0 ? awarded.join(", ") : "회수 자원 없음"}.`;
  }
  return `함선 작업 완료: ${task.type}.`;
}

// Phase 20-B: every completed job (regardless of whether it was queued
// manually or by a policy — see this PR's brief, "정책이 예약한 작업의 완료는
// 제외하지 말고 포함") files a "work" report. The report's title/body is
// built from the same structured job fields (job.type/job.payload/job.cost/
// job.duration, plus a crew-name/module lookup taken before the mutating
// store call below) each branch already has on hand to perform the
// completion — never by parsing the log string the branch also returns
// (see reportSystem.js's file-header "no log parsing" rule). `currentMinute`
// is threaded in by processTimedJobs's `.map((job) => applyUnifiedJob(job,
// currentMinute))` call below.
function reportJobCompletion({ title, summary, jobType, currentMinute }) {
  useReportStore.getState().addReport(buildWorkReport({ title, summary, jobType, currentMinute }));
}

function applyUnifiedJob(job, currentMinute = 0) {
  const story = processStoryJobCompletion(job, currentMinute);
  if (story.handled) {
    const chainTitle = getEventChain(job.payload?.story?.chainId)?.title ?? "연속 사건";
    const log = story.ok
      ? story.waitingLocation ? `${chainTitle} 작업 완료: 목표 좌표가 지도에 표시되었습니다.` : `${chainTitle} 작업을 안전 종료했습니다.`
      : `${chainTitle} 작업 처리 실패: ${story.reason}.`;
    reportJobCompletion({ title: `${chainTitle} 작업 완료`, summary: log, jobType: job.type, currentMinute });
    return log;
  }
  if (job.type === "training") {
    const member = useCrewStore.getState().crew.find((entry) => entry.id === job.payload?.targetCrewId);
    // Like repair, training uses the doctrine active when the clock settles
    // the job rather than snapshotting levels at enqueue time.
    const effects = getSkillEffects(useSkillStore.getState().levels);
    const log = useCrewStore.getState().completeTrainingJob({ memberId: job.payload?.targetCrewId, statKey: job.payload?.statKey, skillEffects: effects.training });
    if (log) reportJobCompletion({ title: "훈련 완료", summary: `${member?.name ?? "승무원"} ${statLabel[job.payload?.statKey] ?? job.payload?.statKey ?? ""} +1 훈련 완료.`, jobType: job.type, currentMinute });
    return log;
  }
  if (job.type === "treatment") {
    const member = useCrewStore.getState().crew.find((entry) => entry.id === job.payload?.targetCrewId);
    const log = useCrewStore.getState().completeTreatmentJob({ memberId: job.payload?.targetCrewId, fatiguePenalty: job.payload?.fatiguePenalty, injury: job.payload?.injury });
    if (log) reportJobCompletion({ title: "치료 완료", summary: `${member?.name ?? "승무원"} 의무실 치료 단계 완료 (기존 ${job.payload?.injury ?? "부상"}).`, jobType: job.type, currentMinute });
    return log;
  }
  if (job.type === "recovery") {
    const member = useCrewStore.getState().crew.find((entry) => entry.id === job.payload?.targetCrewId);
    const log = useCrewStore.getState().completeRecoveryJob({ memberId: job.payload?.targetCrewId, fatigueRecovery: job.payload?.fatigueRecovery });
    if (log) reportJobCompletion({ title: "회복 완료", summary: `${member?.name ?? "승무원"} 회복 절차 완료 (피로 -${job.payload?.fatigueRecovery ?? 0}).`, jobType: job.type, currentMinute });
    return log;
  }
  if (job.type === "module_upgrade") {
    const module = useShipStore.getState().modules.find((entry) => entry.id === job.payload?.moduleId);
    const log = useShipStore.getState().applyModuleJob({ ...job.payload, cost: job.cost, duration: job.duration });
    if (log) {
      const actionLabel = job.payload?.action === "equip" ? "장착" : "개선";
      reportJobCompletion({ title: "모듈 작업 완료", summary: `${module?.name ?? job.payload?.moduleId ?? "모듈"} ${actionLabel} 완료 (${job.payload?.slot ?? "-"} 슬롯).`, jobType: job.type, currentMinute });
    }
    return log;
  }
  if (job.type === "decode") {
    const rule = DECODE_RULES[job.payload?.itemId];
    if (!rule) return "해독 완료: 판독 불가 데이터.";
    const revealed = useNavStore.getState().revealHiddenNodes(rule.reveals);
    const dustReward = Math.max(0, rule.dustReward + Number(job.payload?.workerSnapshot?.outcome?.dustDelta ?? 0));
    useInventoryStore.getState().addDust(dustReward);
    const names = revealed.map((node) => node.name).join(", ");
    const log =
      revealed.length > 0
        ? `${rule.label} 해독 완료: ${names} 좌표 확보 (+먼지 ${dustReward}).`
        : `${rule.label} 해독 완료: 새 좌표 없음, 항법 데이터로 환원 (+먼지 ${dustReward}).`;
    reportJobCompletion({ title: "해독 완료", summary: log, jobType: job.type, currentMinute });
    return log;
  }
  const shipWork = jobToLegacyShipWork(job);
  if (shipWork) {
    const log = applyShipWork(shipWork);
    if (log) reportJobCompletion({ title: "함선 작업 완료", summary: log, jobType: job.type, currentMinute });
    return log;
  }
  return null;
}

function clearMigratedLegacyQueues(result) {
  if (result.migrated <= 0 || result.errors.length > 0) return;
  useCrewStore.setState({ trainingQueue: [], treatmentQueue: [], recoveryQueue: [] });
  useShipStore.setState({ shipWorkQueue: [] });
}

function migrateLegacyJobsOnce() {
  const jobStore = useJobStore.getState();
  if (jobStore.legacyMigrationVersion >= LEGACY_JOB_MIGRATION_VERSION) return [];
  const crewStore = useCrewStore.getState();
  const result = jobStore.migrateLegacyQueues({
    shipWorkQueue: useShipStore.getState().shipWorkQueue ?? [],
    recoveryQueue: crewStore.recoveryQueue ?? [],
    trainingQueue: crewStore.trainingQueue ?? [],
    treatmentQueue: crewStore.treatmentQueue ?? [],
    currentMinute: useGameStore.getState().currentMinute,
  });
  clearMigratedLegacyQueues(result);
  if (result.migrated <= 0 && result.errors.length <= 0) return [];
  const logs = result.migrated > 0 ? [`작업 큐 마이그레이션: 기존 작업 ${result.migrated}개를 통합 Job 시스템으로 이전.`] : [];
  if (result.errors.length > 0) logs.push(`작업 큐 마이그레이션 경고: ${result.errors.length}개 작업 변환 실패.`);
  return logs;
}

export function processTimedJobs(deltaMinutes = 0) {
  const currentMinute = useGameStore.getState().currentMinute;
  reconcileDeceasedEquipment();
  const migrationLogs = migrateLegacyJobsOnce();
  processJobScheduler(currentMinute);
  const readyJobs = useJobStore.getState().completeReadyJobs(currentMinute);
  const incidentReadyJobs = readyJobs.filter((job) => job.payload?.incident?.runtimeId);
  const unifiedJobLogs = readyJobs.filter((job) => !job.payload?.incident?.runtimeId).map((job) => applyUnifiedJob(job, currentMinute)).filter(Boolean);
  [...migrationLogs, ...unifiedJobLogs].forEach((message) => useGameStore.getState().addLog(message));
  processNavigation(currentMinute, deltaMinutes);
  // Recover done story jobs and multi-store settlements even when no panel is mounted.
  reconcileEventChainRuntimes(currentMinute);
  // Arrival and due-story encounters are game-loop state, not panel state.
  // Run after navigation and before crises/policies; existing gates are never overwritten.
  processEncounterOrchestration(currentMinute);
  processCrises(currentMinute, deltaMinutes);
  incidentReadyJobs.forEach((job) => {
    const incident = processIncidentJobCompletion(job, currentMinute);
    if (incident.handled && incident.ok) useGameStore.getState().addLog("항해 사건 대응 작업 완료.");
  });
  processIncidentOrchestration(currentMinute, deltaMinutes);
  refreshCrewAiImmediatelyForCrisis();
  processCrewAI(currentMinute);
  processCrewMeals(currentMinute);
  processCrewNeeds(deltaMinutes);
  processRoomJobs(currentMinute, deltaMinutes);
  processCrewHealth(currentMinute, deltaMinutes);
  processPolicies(currentMinute, deltaMinutes);
}

export const useGameClock = () => {
  const isPaused = useGameStore((state) => state.isPaused);
  const speed = useGameStore((state) => state.speed);
  useEffect(() => {
    migrateLegacyJobsOnce().forEach((message) => useGameStore.getState().addLog(message));
    reconcileEventChainRuntimes(useGameStore.getState().currentMinute);
    processEncounterOrchestration(useGameStore.getState().currentMinute);
    processIncidentOrchestration(useGameStore.getState().currentMinute, 0);
  }, []);
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.code === "Space" && !["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName)) {
        event.preventDefault();
        useGameStore.getState().togglePause();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  useEffect(() => {
    if (isPaused) return undefined;
    const timer = window.setInterval(() => {
      const minutes = GAME_TIME.REAL_SECOND_TO_GAME_MINUTES * speed;
      useGameStore.getState().advanceMinutes(minutes);
      processTimedJobs(minutes);
      const node = useNavStore.getState().sector.nodes.find((entry) => entry.id === useNavStore.getState().currentNodeId);
      const collector = useShipStore.getState().modules.find((module) => module.id === "dust-collector");
      // node is always resolvable here — currentNodeId is initialized from and
      // kept in sync with sector.nodes by navStore (see navStore.js
      // arriveNode/generateSector/merge) — so the ?? 1 fallback below only
      // guards richness ever being nullish on a node, not a missing node. This
      // used to also fall back to explorationStore.getZoneById(currentZoneId),
      // a dead field frozen at "anchor-station" since Phase 18-C (see
      // docs/NEXT_CHAT_HANDOFF.md "알려진 지뢰"); that fallback never actually
      // fired since node was always found, so it has been removed as dead code.
      const richness = node?.richness ?? 1;
      const dustMult = getActiveModifiers(useInventoryStore.getState().getActiveCards()).dustCollectionMult;
      const dustRate = DUST.BASE_COLLECTION_PER_HOUR * (collector?.level || 1) * richness * dustMult;
      useInventoryStore.getState().addDust((dustRate * minutes) / 60);
    }, GAME_TIME.TICK_MS);
    return () => window.clearInterval(timer);
  }, [isPaused, speed]);
};
