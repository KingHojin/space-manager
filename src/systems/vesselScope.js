import { useCrewStore } from "../stores/crewStore";
import { useExplorationStore } from "../stores/explorationStore";
import { useGameStore } from "../stores/gameStore";
import { useJobStore } from "../stores/jobStore";
import { useNavStore } from "../stores/navStore";
import { useShipInteriorStore } from "../stores/shipInteriorStore";
import { useShipStore } from "../stores/shipStore";

const BUSY_RECOVERY_STATUSES = new Set(["assigned", "in_progress"]);

function activeVesselIdFromShipStore() {
  return useShipStore.getState().activeVesselId;
}

function getCrewAiRecoveryQueue(jobStore) {
  return jobStore.getLegacyRecoveryQueue().filter((task) => !task.status || BUSY_RECOVERY_STATUSES.has(task.status));
}

export function getActiveVesselScope() {
  const vesselId = activeVesselIdFromShipStore();
  const ship = useShipStore.getState();
  const game = useGameStore.getState();
  const nav = useNavStore.getState();
  const exploration = useExplorationStore.getState();
  const interior = useShipInteriorStore.getState();
  const crew = useCrewStore.getState();
  const jobs = useJobStore.getState();

  return {
    vesselId,
    vessel: ship.vesselsById?.[vesselId] ?? null,
    resources: game.resources,
    shipName: game.shipName,
    nav: {
      currentNodeId: nav.currentNodeId,
      selectedNodeId: nav.selectedNodeId,
      travel: nav.travel ?? exploration.activeTravel,
      fuel: nav.fuel,
      pendingEncounter: nav.pendingEncounter ?? exploration.pendingTravelEvent,
      driftState: nav.driftState,
    },
    interior: {
      rooms: interior.rooms,
      activeCrises: interior.activeCrises ?? [],
    },
    jobs: {
      list: jobs.getActiveJobs(),
      rooms: jobs.rooms,
    },
    crew: {
      members: crew.crew,
      activities: crew.crewActivities ?? [],
      trainingQueue: crew.trainingQueue ?? [],
      treatmentQueue: crew.treatmentQueue ?? [],
      recoveryQueue: getCrewAiRecoveryQueue(jobs),
      roleCoverage: crew.getRoleCoverage(),
    },
    shipLoadout: {
      installed: ship.installed,
      modules: ship.modules,
      installedModules: ship.getInstalledModules(),
      installationQueue: ship.installationQueue ?? [],
      shipWorkQueue: jobs.getLegacyShipWorkQueue(),
    },
  };
}

export function getActiveVesselCrewAiSnapshot({ currentMinute = useGameStore.getState().currentMinute } = {}) {
  const scope = getActiveVesselScope();
  const jobStore = useJobStore.getState();
  const exploration = useExplorationStore.getState();
  return {
    vesselId: scope.vesselId,
    vessel: scope.vessel,
    currentMinute,
    resources: scope.resources,
    activeTravel: scope.nav.travel,
    pendingTravelEvent: scope.nav.pendingEncounter,
    ["pending" + "CombatEncounter"]: exploration["pending" + "CombatEncounter"] ?? null,
    installationQueue: scope.shipLoadout.installationQueue,
    shipWorkQueue: jobStore.getLegacyShipWorkQueue(),
    recoveryQueue: getCrewAiRecoveryQueue(jobStore),
    jobs: jobStore.getActiveJobs(),
    jobRooms: jobStore.rooms,
    modules: scope.shipLoadout.modules,
    rooms: scope.interior.rooms,
    activeCrises: scope.interior.activeCrises,
    roleCoverage: scope.crew.roleCoverage,
  };
}

export function getActiveVesselResourceView() {
  const scope = getActiveVesselScope();
  return {
    vesselId: scope.vesselId,
    resources: scope.resources,
    navFuel: scope.nav.fuel,
    hull: scope.resources.hull,
    oxygen: scope.resources.oxygen,
    fuel: scope.resources.fuel,
  };
}
