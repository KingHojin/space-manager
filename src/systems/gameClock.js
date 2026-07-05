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

function applyCrewRisk(risk) {
  if (!risk) return;
  const crew = useCrewStore.getState().crew.filter((member) => member.alive);
  if (crew.length === 0) return;
  const target = crew[Math.floor(Math.random() * crew.length)];
  const injury = risk === "major" ? "중상" : "경상";
  useCrewStore.getState().applyCombatCasualty({ memberId: target.id, injury, morale: -1 });
  useGameStore.getState().addLog(`승무원 피해: ${target.name} ${injury}.`);
}

function processTravel(currentMinute) {
  const exploration = useExplorationStore.getState();
  const activeTravel = exploration.activeTravel;
  if (!activeTravel) return;

  if (shouldRollTravelEncounter(activeTravel, currentMinute)) {
    const chance = getTravelEncounterChance(activeTravel);
    let summary = null;
    let happened = false;

    if (Math.random() <= chance) {
      const outcome = rollTravelEncounter(activeTravel, currentMinute);
      if (outcome.resources) useGameStore.getState().addResources(outcome.resources);
      if (outcome.dust) useInventoryStore.getState().addDust(outcome.dust);
      if (outcome.item) useInventoryStore.getState().addItem(outcome.item.id, outcome.item.qty ?? 1);
      if (outcome.reveal) useExplorationStore.getState().revealRandomZone();
      if (outcome.crewRisk) applyCrewRisk(outcome.crewRisk);
      summary = `항해 인카운터: ${outcome.title} — ${outcome.message}`;
      if (outcome.combatHint) summary += " 전투 메뉴에서 추적 교전으로 확장 가능.";
      useGameStore.getState().addLog(summary);
      happened = true;
    }

    useExplorationStore.getState().registerTravelRoll(summary, currentMinute, happened);
  }

  if (currentMinute >= activeTravel.completeAt) {
    const destination = getZoneById(activeTravel.toZoneId);
    useExplorationStore.getState().completeTravel();
    useGameStore.getState().addLog(`${destination?.name ?? "목적지"} 도착. 항해 완료.`);
  }
}

export function processTimedJobs() {
  const currentMinute = useGameStore.getState().currentMinute;
  const crewLogs = useCrewStore.getState().completeReadyTraining(currentMinute);
  const treatmentLogs = useCrewStore.getState().completeReadyTreatment(currentMinute);
  const moduleLogs = useShipStore.getState().completeReadyInstallations(currentMinute);
  [...crewLogs, ...treatmentLogs, ...moduleLogs].forEach((message) => useGameStore.getState().addLog(message));
  processTravel(currentMinute);
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
