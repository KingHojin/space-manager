import { beforeEach, describe, expect, it } from "vitest";
import { useShipInteriorStore } from "../shipInteriorStore";
import { createInitialRoomState } from "../../systems/roomJobs";

// Phase 20-B: tickCrises grew a third return field, `crisisEvents`, on top
// of the pre-existing `{ effects, logs }` contract — a non-destructive
// addition (effects/logs are completely unchanged) that exposes the same
// spawn/resolve/escalate moments as structured { kind, crisis, roomId }
// records instead of only the free-text `logs` strings, so gameClock.js can
// build reportSystem.js's buildCrisisReport() from real data (see
// reportSystem.js's file-header "no log parsing" rule).
function resetShipInteriorStore() {
  useShipInteriorStore.setState({ rooms: createInitialRoomState(), activeCrises: [] });
}

describe("shipInteriorStore.tickCrises crisisEvents (Phase 20-B)", () => {
  beforeEach(() => {
    resetShipInteriorStore();
  });

  it("returns an empty crisisEvents array (alongside the pre-existing empty effects/logs) when deltaMinutes <= 0", () => {
    const result = useShipInteriorStore.getState().tickCrises({ currentMinute: 100, deltaMinutes: 0, crisisActivities: {}, crew: [], roleCoverage: null });
    expect(result).toEqual({ effects: [], logs: [], crisisEvents: [] });
  });

  it("emits a { kind: 'spawned' } crisisEvent, matching the '위기 발생' log line, when a room crosses its internal spawn threshold", () => {
    // engineering's spawn branch is deterministic once load >= 94 (no dice
    // roll needed — see crisisSystem.js's shouldSpawnInternalCrisis: `load
    // >= 94 || Math.random() < 0.55` short-circuits on the first operand),
    // and deltaMinutes >= 60 forces `canRoll` regardless of hour-boundary
    // crossing. Every other room stays at its untouched default
    // (condition 82 / load 18 from createInitialRoomState), which is well
    // under every other spawn branch's threshold, so engineering is the
    // only room that can possibly spawn this tick.
    const rooms = createInitialRoomState();
    rooms.engineering = { ...rooms.engineering, load: 94, condition: 80 };
    useShipInteriorStore.setState({ rooms, activeCrises: [] });

    const result = useShipInteriorStore.getState().tickCrises({ currentMinute: 1000, deltaMinutes: 60, crisisActivities: {}, crew: [], roleCoverage: null });

    expect(result.effects).toEqual([]);
    expect(result.logs.some((message) => message.startsWith("위기 발생:"))).toBe(true);
    expect(result.crisisEvents).toHaveLength(1);
    const [event] = result.crisisEvents;
    expect(event.kind).toBe("spawned");
    expect(event.roomId).toBe("engineering");
    expect(event.crisis.type).toBe("overheat");
    expect(event.crisis.severity).toBe(1);

    // The spawn is also reflected in the store's real state (crisisEvents is
    // additive, not a replacement for the existing activeCrises contract).
    expect(useShipInteriorStore.getState().activeCrises).toHaveLength(1);
    expect(useShipInteriorStore.getState().rooms.engineering.activeCrisisId).toBe(event.crisis.id);
  });

  it("emits a { kind: 'resolved' } crisisEvent, matching the '위기 해결' log line, when an assigned responder pushes progress to 100", () => {
    const rooms = createInitialRoomState();
    const crisisId = "crisis-test-overheat-engineering";
    rooms.engineering = { ...rooms.engineering, activeCrisisId: crisisId };
    const crisis = {
      id: crisisId,
      roomId: "engineering",
      type: "overheat",
      severity: 1,
      progress: 90,
      escalateAt: 1_000_000, // far in the future — this tick must resolve, not escalate.
      assignedCrewId: null,
      assignedCrewIds: [],
      createdAtMinutes: 0,
    };
    useShipInteriorStore.setState({ rooms, activeCrises: [crisis] });

    const engineer = { id: "eng-1", alive: true, role: "기관실", fatigue: 0, injury: "healthy", stats: { engineering: 10 } };
    // rate = (100 / (48 * 1)) * 1.35 (fit role) * 1 (no fatigue) * 1 (healthy)
    // ≈ 2.8125/min; over 15 minutes that is ~42.2 progress — comfortably
    // enough to carry 90 -> 100 in a single tick. overheat has no
    // `injuryChance` in CRISIS_CATALOG, so maybeInjureResponder's
    // `!config.injuryChance` short-circuit makes this fully deterministic
    // (no Math.random() call on the responder-injury path either).
    const result = useShipInteriorStore.getState().tickCrises({
      currentMinute: 1000,
      deltaMinutes: 15,
      crisisActivities: { [crisisId]: [{ memberId: engineer.id, roomId: "engineering" }] },
      crew: [engineer],
      roleCoverage: { missingRoles: [] },
    });

    expect(result.effects).toEqual([]);
    expect(result.logs.some((message) => message.startsWith("위기 해결:"))).toBe(true);
    expect(result.crisisEvents).toHaveLength(1);
    const [event] = result.crisisEvents;
    expect(event.kind).toBe("resolved");
    expect(event.roomId).toBe("engineering");
    expect(event.crisis.id).toBe(crisisId);
    expect(event.dustGain).toBeGreaterThan(0);

    // The crisis is actually gone from the store, same as the pre-existing
    // `logs`-only contract already guaranteed.
    expect(useShipInteriorStore.getState().activeCrises).toEqual([]);
    expect(useShipInteriorStore.getState().rooms.engineering.activeCrisisId).toBeNull();
  });

  it("emits no crisisEvents on an ordinary quiet tick (default rooms, no crises, no activity)", () => {
    const result = useShipInteriorStore.getState().tickCrises({ currentMinute: 500, deltaMinutes: 15, crisisActivities: {}, crew: [], roleCoverage: null });
    expect(result.crisisEvents).toEqual([]);
  });
});
