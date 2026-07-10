import { beforeEach, describe, expect, it } from "vitest";
import { DRIFT } from "../../data/constants";
import { useGameStore } from "../../stores/gameStore";
import { useNavStore } from "../../stores/navStore";
import { applyFuelDelta, reconcileFuel, spendFuel } from "../fuelSystem";
import { applyNavigationEncounter, processTimedJobs, requestDriftRescue } from "../gameClock";

function setResources(resources) {
  useGameStore.setState((state) => ({ resources: { ...state.resources, ...resources } }));
  reconcileFuel();
}

describe("authoritative fuel synchronization", () => {
  beforeEach(() => {
    useNavStore.getState().generateSector("fuel-stability");
    useNavStore.setState({ travel: null, pendingEncounter: null, driftState: null, rescueUsesBySector: {} });
    setResources({ credits: 1800, fuel: 80, oxygen: 100, hull: 100 });
  });

  it("keeps Header/game and navigation fuel equal for gains and spending", () => {
    expect(applyFuelDelta(12)).toBe(92);
    expect(useNavStore.getState().fuel).toBe(92);
    expect(spendFuel(17)).toBe(true);
    expect(useGameStore.getState().resources.fuel).toBe(75);
    expect(useNavStore.getState().fuel).toBe(75);
  });

  it("synchronizes ordinary resource deltas used by missions, combat and inventory", () => {
    useGameStore.getState().addResources({ fuel: -23, hull: -4 });
    expect(useGameStore.getState().resources.fuel).toBe(57);
    expect(useNavStore.getState().fuel).toBe(57);
  });
});

describe("costed delayed drift rescue", () => {
  beforeEach(() => {
    useNavStore.getState().generateSector("rescue-contract");
    useNavStore.setState({ travel: null, pendingEncounter: null, driftState: null, rescueUsesBySector: {} });
    setResources({ credits: 1000, fuel: 0, oxygen: 100, hull: 100 });
    useNavStore.getState().enterDrift(useGameStore.getState().currentMinute, "test");
  });

  it("charges once, persists a pending ETA and only refuels after the delay", () => {
    const startedAt = useGameStore.getState().currentMinute;
    const result = requestDriftRescue(startedAt);
    expect(result.ok).toBe(true);
    expect(useGameStore.getState().resources.credits).toBe(1000 - DRIFT.RESCUE_CREDIT_COST);
    expect(useGameStore.getState().resources.fuel).toBe(0);
    expect(useNavStore.getState().driftState.rescue.arrivesAt).toBe(startedAt + DRIFT.RESCUE_CHECK_MINUTES);

    useGameStore.getState().advanceMinutes(DRIFT.RESCUE_CHECK_MINUTES - 1);
    processTimedJobs(DRIFT.RESCUE_CHECK_MINUTES - 1);
    expect(useGameStore.getState().resources.fuel).toBe(0);
    expect(useNavStore.getState().driftState).not.toBeNull();

    useGameStore.getState().advanceMinutes(1);
    processTimedJobs(1);
    expect(useGameStore.getState().resources.fuel).toBe(DRIFT.RESCUE_FUEL);
    expect(useNavStore.getState().fuel).toBe(DRIFT.RESCUE_FUEL);
    expect(useNavStore.getState().driftState).toBeNull();

    useGameStore.getState().addResource("fuel", -DRIFT.RESCUE_FUEL);
    useNavStore.getState().enterDrift(useGameStore.getState().currentMinute, "again");
    expect(requestDriftRescue(useGameStore.getState().currentMinute)).toMatchObject({ ok: false, reason: "sectorLimit" });
  });

  it("does not create a rescue contract or clamp credits into a free purchase", () => {
    setResources({ credits: DRIFT.RESCUE_CREDIT_COST - 1, fuel: 0 });
    const result = requestDriftRescue(useGameStore.getState().currentMinute);
    expect(result).toMatchObject({ ok: false, reason: "insufficientCredits" });
    expect(useGameStore.getState().resources.credits).toBe(DRIFT.RESCUE_CREDIT_COST - 1);
    expect(useNavStore.getState().driftState.rescue).toBeUndefined();
  });
});

describe("station encounter affordability", () => {
  it("keeps an unaffordable purchase pending without granting fuel", () => {
    setResources({ credits: 50, fuel: 10 });
    const encounter = {
      id: "station-refuel-test",
      title: "정거장 보급",
      options: [
        { id: "buy", label: "구매", outcome: [{ kind: "resource", delta: { credits: -120, fuel: 28 } }] },
        { id: "skip", label: "보류", outcome: [] },
      ],
    };
    useNavStore.setState({ pendingEncounter: encounter });

    const result = applyNavigationEncounter("buy", useGameStore.getState().currentMinute);
    expect(result).toMatchObject({ ok: false, reason: "insufficientCredits" });
    expect(useGameStore.getState().resources.credits).toBe(50);
    expect(useGameStore.getState().resources.fuel).toBe(10);
    expect(useNavStore.getState().pendingEncounter).toEqual(encounter);
  });
});
