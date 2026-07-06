import { useCombatStore } from "../stores/combatStore";
import { useCrewStore } from "../stores/crewStore";
import { useExplorationStore } from "../stores/explorationStore";
import { useGameStore } from "../stores/gameStore";
import { useJobStore } from "../stores/jobStore";
import { useNavStore } from "../stores/navStore";
import { useShipInteriorStore } from "../stores/shipInteriorStore";
import { useShipStore } from "../stores/shipStore";

function activeVesselIdFromShipStore() {
  const ship = useShipStore.getState();
  return ship.activeVesselId;
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
  const combat = useCombatStore.getState().getCombatState(vesselId);

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
      pendingCombatEncounter: exploration.pendingCombatEncounter ?? null,
      driftState: nav.driftState,
    },
    interior: {
      rooms: interior.rooms,
      activeCrises: interior.activeCrises ?? [],
    },
    crew: {
      members: crew.crew,
      activities: crew.crewActivities ?? [],
      trainingQueue: crew.trainingQueue ?? [],
      treatmentQueue: crew.treatmentQueue ?? [],
      recoveryQueue: jobs.getLegacyRecoveryQueue(),
      roleCoverage: crew.getRoleCoverage(),
    },
    shipLoadout: {
      installed: ship.installed,
      modules: ship.modules,
      installedModules: ship.getInstalledModules(),
      installationQueue: ship.installationQueue ?? [],
      shipWorkQueue: jobs.getLegacyShipWorkQueue(),
    },
    combat,
  };
}

export function getActiveVesselCrewAiSnapshot({ currentMinute = useGameStore.getState().currentMinute } = {}) {
  const scope = getActiveVesselScope();
  return {
    vesselId: scope.vesselId,
    vessel: scope.vessel,
    currentMinute,
    resources: scope.resources,
    activeTravel: scope.nav.travel,
    pendingTravelEvent: scope.nav.pendingEncounter,
    pendingCombatEncounter: scope.nav.pendingCombatEncounter ?? (scope.combat.combat?.status === "engaged" ? scope.combat.combat : null),
    installationQueue: scope.shipLoadout.installationQueue,
    shipWorkQueue: scope.shipLoadout.shipWorkQueue,
    recoveryQueue: scope.crew.recoveryQueue,
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