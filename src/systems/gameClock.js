import { useEffect } from "react";
import { DUST, GAME_TIME } from "../data/constants";
import { getZoneById } from "../data/sectors";
import { rollEvent } from "./eventEngine";
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

function processTimedJobs() {
  const currentMinute = useGameStore.getState().currentMinute;
  const crewLogs = useCrewStore.getState().completeReadyTraining(currentMinute);
  const moduleLogs = useShipStore.getState().completeReadyInstallations(currentMinute);
  [...crewLogs, ...moduleLogs].forEach((message) => useGameStore.getState().addLog(message));
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
