import { useEffect } from "react";
import { DECODE_RULES, DUST, GAME_TIME } from "../data/constants";
import { getZoneById } from "../data/sectors";
import { getActiveModifiers } from "./cardEffects";
import { rollEvent } from "./eventEngine";
import { jobToLegacyShipWork } from "./jobMigration";
import { getTravelEncounterChance, rollTravelEncounter, shouldRollTravelEncounter } from "./travelSystem";
import { getActiveVesselCrewAiSnapshot } from "./vesselScope";
import { useCrewStore } from "../stores/crewStore";
import { useExplorationStore } from "../stores/explorationStore";
import { useGameStore } from "../stores/gameStore";
import { useInventoryStore } from "../stores/inventoryStore";
import { useJobStore } from "../stores/jobStore";
import { useNavStore } from "../stores/navStore";
import { useRecruitStore } from "../stores/recruitStore";
import { useShipInteriorStore } from "../stores/shipInteriorStore";
import { useShipStore } from "../stores/shipStore";

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

function consumeTravelFuel(activeTravel, currentMinute) {
  const lastFuelAt = activeTravel.lastFuelAt ?? activeTravel.startedAt;
  const elapsed = Math.max(0, currentMinute - lastFuelAt);
  if (elapsed <= 0 || activeTravel.duration <= 0) return;
  const mods = getActiveModifiers(useInventoryStore.getState().getActiveCards());
  const fuelBurn = Math.min(activeTravel.fuelCost, (activeTravel.fuelCost / activeTravel.duration) * elapsed) * mods.fuelConsumptionMult;
  if (fuelBurn > 0) {
    useGameStore.getState().addResources({ fuel: -fuelBurn });
    useExplorationStore.getState().registerTravelFuelTick(currentMinute);
  }
  const fuel = useGameStore.getState().resources.fuel;
  if (fuel <= 0) useGameStore.getState().addLog("항해 경고: 연료가 고갈되었습니다. 표류 위험이 급상승합니다.");
}

function processTravel(currentMinute) {
  const exploration = useExplorationStore.getState();
  const activeTravel = exploration.activeTravel;
  if (!activeTravel) return;
  consumeTravelFuel(activeTravel, currentMinute);
  if (shouldRollTravelEncounter(activeTravel, currentMinute)) {
    const chance = getTravelEncounterChance(activeTravel);
    let summary = null;
    let happened = false;
    if (Math.random() <= chance) {
      if (exploration.pendingTravelEvent) summary = `미해결 항해 이벤트 지속: ${exploration.pendingTravelEvent.title}. 항해는 계속 진행 중입니다.`;
      else {
        const eventCard = rollTravelEncounter(activeTravel, currentMinute);
        useExplorationStore.getState().setPendingTravelEvent(eventCard);
        summary = `항해 이벤트 카드: ${eventCard.title} — ${eventCard.message}`;
        useGameStore.getState().addLog(summary);
        happened = true;
      }
    }
    useExplorationStore.getState().registerTravelRoll(summary, currentMinute, happened);
  }
  const latestTravel = useExplorationStore.getState().activeTravel;
  if (latestTravel && currentMinute >= latestTravel.completeAt) {
    const destination = getZoneById(latestTravel.toZoneId);
    useExplorationStore.getState().completeTravel();
    useGameStore.getState().addLog(`${destination?.name ?? "목적지"} 도착. 항해 완료.`);
  }
}

function applyNavEffect(effect, currentMinute) {
  if (!effect) return;
  if (effect.kind === "resource" && effect.delta) useGameStore.getState().addResources(effect.delta);
  if (effect.kind === "fuel" && effect.delta) {
    useNavStore.getState().refuel(effect.delta);
    useGameStore.getState().addResources({ fuel: effect.delta });
    if (effect.delta < 0 && useNavStore.getState().fuel <= 0 && !useNavStore.getState().driftState) {
      const drift = useNavStore.getState().enterDrift(currentMinute, "fuel_loss_event");
      drift.effects.forEach((nested) => applyNavEffect(nested, currentMinute));
      drift.logs.forEach((message) => useGameStore.getState().addLog(`항해: ${message}`));
    }
  }
  if (effect.kind === "spawnCrisis") useShipInteriorStore.getState().spawnCrisis(effect.roomId, effect.type, effect.severity ?? 1, currentMinute);
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
    useExplorationStore.getState().setPendingCombatEncounter({ id: effect.enemyId, title: "미확인 적성 함선 접촉", enemyId: effect.enemyId, fallback: true });
    useGameStore.getState().addLog(`교전 조우 기록: ${effect.enemyId}. Phase 11 전까지 전투는 텍스트 폴백으로 보관됩니다.`);
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

export function applyNavigationEncounter(optionId, currentMinute = useGameStore.getState().currentMinute) {
  const { effects, logs } = useNavStore.getState().resolveEncounter(optionId);
  effects.forEach((effect) => applyNavEffect(effect, currentMinute));
  logs.forEach((message) => useGameStore.getState().addLog(`항해 조우: ${message}`));
  return { effects, logs };
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
  const { completedJobs, logs } = useShipInteriorStore.getState().tickRooms({ currentMinute, deltaMinutes, roomActivities, roleCoverage: crewStore.getRoleCoverage(), usageByRoom });
  completedJobs.forEach((job) => applyRoomJobEffect(job.effect, job.roomId));
  logs.forEach((message) => useGameStore.getState().addLog(`함선: ${message}`));
}

function applyCrisisEffect(effect) {
  if (!effect) return;
  if (effect.type === "crewCasualty" && effect.memberId) useCrewStore.getState().applyCombatCasualty({ memberId: effect.memberId, injury: effect.injury ?? "경상", morale: -1 });
  if (effect.type === "resourceDelta" && effect.resources) useGameStore.getState().addResources(effect.resources);
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
  const { effects, logs } = useShipInteriorStore.getState().tickCrises({ currentMinute, deltaMinutes, crisisActivities, crew: crewStore.crew, roleCoverage: crewStore.getRoleCoverage() });
  effects.forEach(applyCrisisEffect);
  logs.forEach((message) => useGameStore.getState().addLog(`함선 위기: ${message}`));
}

function processCrewHealth(currentMinute, deltaMinutes) {
  const logs = useCrewStore.getState().tickCrewHealth({ currentMinute, deltaMinutes });
  logs.forEach((message) => useGameStore.getState().addLog(`의무실: ${message}`));
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
    const hullDelta = task.payload?.hullDelta ?? 0;
    if (hullDelta > 0) useGameStore.getState().addResources({ hull: hullDelta });
    return `선체 정비 완료: 선체 +${hullDelta}%.`;
  }
  if (task.type === "salvageProcessing") {
    const awarded = applyItemOutputs(task.payload?.outputItems ?? []);
    return `잔해 분해 완료: ${awarded.length > 0 ? awarded.join(", ") : "회수 자원 없음"}.`;
  }
  return `함선 작업 완료: ${task.type}.`;
}

function applyUnifiedJob(job) {
  if (job.type === "training") return useCrewStore.getState().completeTrainingJob({ memberId: job.payload?.targetCrewId, statKey: job.payload?.statKey });
  if (job.type === "treatment") return useCrewStore.getState().completeTreatmentJob({ memberId: job.payload?.targetCrewId, fatiguePenalty: job.payload?.fatiguePenalty, injury: job.payload?.injury });
  if (job.type === "recovery") return useCrewStore.getState().completeRecoveryJob({ memberId: job.payload?.targetCrewId, fatigueRecovery: job.payload?.fatigueRecovery });
  if (job.type === "module_upgrade") return useShipStore.getState().applyModuleJob({ ...job.payload, cost: job.cost, duration: job.duration });
  if (job.type === "decode") {
    const rule = DECODE_RULES[job.payload?.itemId];
    if (!rule) return "해독 완료: 판독 불가 데이터.";
    const revealed = useNavStore.getState().revealHiddenNodes(rule.reveals);
    useInventoryStore.getState().addDust(rule.dustReward);
    const names = revealed.map((node) => node.name).join(", ");
    return revealed.length > 0
      ? `${rule.label} 해독 완료: ${names} 좌표 확보 (+먼지 ${rule.dustReward}).`
      : `${rule.label} 해독 완료: 새 좌표 없음, 항법 데이터로 환원 (+먼지 ${rule.dustReward}).`;
  }
  const shipWork = jobToLegacyShipWork(job);
  if (shipWork) return applyShipWork(shipWork);
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
  const migrationLogs = migrateLegacyJobsOnce();
  processJobScheduler(currentMinute);
  const crewLogs = useCrewStore.getState().completeReadyTraining(currentMinute);
  const treatmentLogs = useCrewStore.getState().completeReadyTreatment(currentMinute);
  const moduleLogs = useShipStore.getState().completeReadyInstallations(currentMinute);
  const unifiedJobLogs = useJobStore.getState().completeReadyJobs(currentMinute).map(applyUnifiedJob).filter(Boolean);
  [...migrationLogs, ...crewLogs, ...treatmentLogs, ...moduleLogs, ...unifiedJobLogs].forEach((message) => useGameStore.getState().addLog(message));
  processTravel(currentMinute);
  processNavigation(currentMinute, deltaMinutes);
  processCrises(currentMinute, deltaMinutes);
  refreshCrewAiImmediatelyForCrisis();
  processCrewAI(currentMinute);
  processCrewMeals(currentMinute);
  processCrewNeeds(deltaMinutes);
  processRoomJobs(currentMinute, deltaMinutes);
  processCrewHealth(currentMinute, deltaMinutes);
}

export const useGameClock = () => {
  const isPaused = useGameStore((state) => state.isPaused);
  const speed = useGameStore((state) => state.speed);
  useEffect(() => {
    migrateLegacyJobsOnce().forEach((message) => useGameStore.getState().addLog(message));
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
      const legacyZone = getZoneById(useExplorationStore.getState().currentZoneId);
      const collector = useShipStore.getState().modules.find((module) => module.id === "dust-collector");
      const richness = node?.richness ?? legacyZone?.richness ?? 1;
      const dustMult = getActiveModifiers(useInventoryStore.getState().getActiveCards()).dustCollectionMult;
      const dustRate = DUST.BASE_COLLECTION_PER_HOUR * (collector?.level || 1) * richness * dustMult;
      useInventoryStore.getState().addDust((dustRate * minutes) / 60);
      const event = rollEvent();
      if (event) useGameStore.getState().addLog(event);
    }, GAME_TIME.TICK_MS);
    return () => window.clearInterval(timer);
  }, [isPaused, speed]);
};
