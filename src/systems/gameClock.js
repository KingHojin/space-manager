import { useEffect } from "react";
import { DUST, GAME_TIME } from "../data/constants";
import { getZoneById } from "../data/sectors";
import { rollEvent } from "./eventEngine";
import { getTravelEncounterChance, rollTravelEncounter, shouldRollTravelEncounter } from "./travelSystem";
import { useCrewStore } from "../stores/crewStore";
import { useExplorationStore } from "../stores/explorationStore";
import { useGameStore } from "../stores/gameStore";
import { useInventoryStore } from "../stores/inventoryStore";
import { useShipStore } from "../stores/shipStore";

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

function consumeTravelFuel(activeTravel, currentMinute) {
  const lastFuelAt = activeTravel.lastFuelAt ?? activeTravel.startedAt;
  const elapsed = Math.max(0, currentMinute - lastFuelAt);
  if (elapsed <= 0 || activeTravel.duration <= 0) return;

  const fuelBurn = Math.min(activeTravel.fuelCost, (activeTravel.fuelCost / activeTravel.duration) * elapsed);
  if (fuelBurn > 0) {
    useGameStore.getState().addResources({ fuel: -fuelBurn });
    useExplorationStore.getState().registerTravelFuelTick(currentMinute);
  }

  const fuel = useGameStore.getState().resources.fuel;
  if (fuel <= 0) {
    useGameStore.getState().addLog("항해 경고: 연료가 고갈되었습니다. 표류 위험이 급상승합니다.");
  }
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
      if (exploration.pendingTravelEvent) {
        summary = `미해결 항해 이벤트 지속: ${exploration.pendingTravelEvent.title}. 항해는 계속 진행 중입니다.`;
      } else {
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

function processCrewAI(currentMinute) {
  const exploration = useExplorationStore.getState();
  const logs = useCrewStore.getState().runCrewAI({
    currentMinute,
    resources: useGameStore.getState().resources,
    activeTravel: exploration.activeTravel,
    pendingTravelEvent: exploration.pendingTravelEvent,
    pendingCombatEncounter: exploration.pendingCombatEncounter,
    installationQueue: useShipStore.getState().installationQueue ?? [],
  });
  logs.forEach((message) => useGameStore.getState().addLog(`승무원 AI: ${message}`));
}

export function processTimedJobs() {
  const currentMinute = useGameStore.getState().currentMinute;
  const crewLogs = useCrewStore.getState().completeReadyTraining(currentMinute);
  const treatmentLogs = useCrewStore.getState().completeReadyTreatment(currentMinute);
  const moduleLogs = useShipStore.getState().completeReadyInstallations(currentMinute);
  [...crewLogs, ...treatmentLogs, ...moduleLogs].forEach((message) => useGameStore.getState().addLog(message));
  processTravel(currentMinute);
  processCrewAI(currentMinute);
}

export const useGameClock = () => {
  const isPaused = useGameStore((state) => state.isPaused);
  const speed = useGameStore((state) => state.speed);

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
      processTimedJobs();

      const zone = getZoneById(useExplorationStore.getState().currentZoneId);
      const collector = useShipStore.getState().modules.find((module) => module.id === "dust-collector");
      const dustRate = DUST.BASE_COLLECTION_PER_HOUR * (collector?.level || 1) * (zone?.richness || 1);
      useInventoryStore.getState().addDust((dustRate * minutes) / 60);

      const event = rollEvent();
      if (event) useGameStore.getState().addLog(event);
    }, GAME_TIME.TICK_MS);
    return () => window.clearInterval(timer);
  }, [isPaused, speed]);
};
