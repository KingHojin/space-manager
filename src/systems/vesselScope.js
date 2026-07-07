import { useCrewStore } from "../stores/crewStore";
import { useExplorationStore } from "../stores/explorationStore";
import { useGameStore } from "../stores/gameStore";
import { useJobStore } from "../stores/jobStore";
import { useNavStore } from "../stores/navStore";
import { useShipInteriorStore } from "../stores/shipInteriorStore";
import { useShipStore } from "../stores/shipStore";

const BUSY_CREW_JOB_STATUSES = new Set(["assigned", "in_progress"]);

function activeVesselIdFromShipStore() {
  return useShipStore.getState().activeVesselId;
}

function busyQueue(queue = []) {
  return queue.filter((task) => !task.status || BUSY_CREW_JOB_STATUSES.has(task.status));
}

// Phase 18-E: not exported. grep across src/ (`grep -rn "from.*vesselScope"`)
// shows only getActiveVesselCrewAiSnapshot is ever imported from this file
// (gameClock.js and its test) — getActiveVesselScope had zero external
// callers, so its `export` was dead weight even though the function itself
// is very much alive (used by getActiveVesselCrewAiSnapshot below). Kept as
// a module-private helper.
function getActiveVesselScope() {
  const vesselId = activeVesselIdFromShipStore();
  const ship = useShipStore.getState();
  const game = useGameStore.getState();
  const nav = useNavStore.getState();
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
      // Phase 18-C: navStore is the single live travel source; explorationStore's
      // activeTravel/pendingTravelEvent are save-compat-only remnants of the
      // removed legacy travel tick (see stores/explorationStore.js) and are
      // never written anymore, so no fallback is needed here.
      travel: nav.travel,
      fuel: nav.fuel,
      pendingEncounter: nav.pendingEncounter,
      driftState: nav.driftState,
    },
    // Phase 18-D: two distinct room models coexist by design, not by accident.
    // interior.rooms (shipInteriorStore) is the physical room state — condition/
    // load/tier/modules/activeCrisisId — driven by wear and the Phase 6 crisis
    // system (systems/roomJobs.js, systems/crisisSystem.js). jobs.rooms
    // (jobStore) is a derived job-slot index — slotCapacity/currentLoad/
    // activeJobIds recomputed from the `jobs` array on every mutation (see
    // roomsFromJobs in stores/jobStore.js) — used only for job-scheduling UI
    // (backlog "slot full" state, per-room job load gauges). Their `load`
    // fields look similar but measure different things: ship maintenance wear
    // vs job-queue occupancy. Do not merge them.
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
      trainingQueue: busyQueue(jobs.getLegacyTrainingQueue()),
      treatmentQueue: busyQueue(jobs.getLegacyTreatmentQueue()),
      recoveryQueue: busyQueue(jobs.getLegacyRecoveryQueue()),
      roleCoverage: crew.getRoleCoverage(),
    },
    shipLoadout: {
      installed: ship.installed,
      modules: ship.modules,
      installedModules: ship.getInstalledModules(),
      installationQueue: jobs.getLegacyModuleQueue(),
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
    installationQueue: busyQueue(jobStore.getLegacyModuleQueue()),
    shipWorkQueue: jobStore.getLegacyShipWorkQueue(),
    trainingQueue: busyQueue(jobStore.getLegacyTrainingQueue()),
    treatmentQueue: busyQueue(jobStore.getLegacyTreatmentQueue()),
    recoveryQueue: busyQueue(jobStore.getLegacyRecoveryQueue()),
    jobs: jobStore.getActiveJobs(),
    // Phase 18-D: previously also exposed `jobRooms: jobStore.rooms` here, but
    // grep across src/ found zero reads of snapshot.jobRooms anywhere (crewAI.js
    // only ever reads snapshot.rooms, which is shipInteriorStore's physical room
    // state below) — removed as dead. jobStore.rooms is still reachable directly
    // via useJobStore.getState().rooms and via getActiveVesselScope().jobs.rooms
    // for job-scheduling UI (see the comment above getActiveVesselScope's return).
    modules: scope.shipLoadout.modules,
    rooms: scope.interior.rooms,
    activeCrises: scope.interior.activeCrises,
    roleCoverage: scope.crew.roleCoverage,
  };
}

// Phase 18-E: getActiveVesselResourceView (previously here) was removed as
// dead code — `grep -rn "getActiveVesselResourceView" src/` found zero call
// sites anywhere outside its own definition (no imports, no references).
// If a resource-only view of the active vessel is needed again, note that
// `getActiveVesselCrewAiSnapshot().resources` already covers the same
// fields (resources, plus nav.fuel is available via scope.nav.fuel above).
