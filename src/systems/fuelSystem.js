import { useGameStore } from "../stores/gameStore";
import { useNavStore } from "../stores/navStore";

// gameStore.resources.fuel is authoritative. navStore.fuel remains as a
// persisted compatibility mirror because older saves and navigation code used
// it directly. Keeping synchronization here gives every producer (clock,
// encounters, combat, missions, inventory and market) the same final value.
function syncNavFuel(fuel) {
  const nav = useNavStore.getState();
  if (nav.fuel !== fuel || nav.fuelAuthorityVersion !== 1) {
    useNavStore.setState({ fuel, fuelAuthorityVersion: 1 });
  }
}

function migrateLegacyFuelOnce() {
  const nav = useNavStore.getState();
  const gameFuel = useGameStore.getState().resources.fuel;
  if (nav.fuelAuthorityVersion === 1) {
    syncNavFuel(gameFuel);
    return;
  }

  // Old builds intentionally kept navigation fuel separate. Preserve the more
  // depleted meter so loading a save never grants free fuel.
  const legacyFuel = Number.isFinite(nav.fuel) ? nav.fuel : gameFuel;
  const migratedFuel = Math.min(gameFuel, legacyFuel);
  useGameStore.getState().addResource("fuel", migratedFuel - gameFuel);
  syncNavFuel(useGameStore.getState().resources.fuel);
}

migrateLegacyFuelOnce();

useGameStore.subscribe((state, previousState) => {
  const fuel = state.resources.fuel;
  if (fuel !== previousState.resources.fuel) syncNavFuel(fuel);
});

export function applyFuelDelta(delta) {
  if (!Number.isFinite(delta) || delta === 0) return useGameStore.getState().resources.fuel;
  useGameStore.getState().addResource("fuel", delta);
  const fuel = useGameStore.getState().resources.fuel;
  syncNavFuel(fuel);
  return fuel;
}

export function spendFuel(amount) {
  if (!Number.isFinite(amount) || amount < 0) return false;
  const spent = useGameStore.getState().spendFuel(amount);
  if (spent) syncNavFuel(useGameStore.getState().resources.fuel);
  return spent;
}

export function reconcileFuel() {
  syncNavFuel(useGameStore.getState().resources.fuel);
  return useGameStore.getState().resources.fuel;
}
