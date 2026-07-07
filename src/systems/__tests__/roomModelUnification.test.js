import { describe, expect, it } from "vitest";
import { processTimedJobs } from "../gameClock";
import { getActiveVesselCrewAiSnapshot } from "../vesselScope";
import { ROOM_CONFIG } from "../../data/constants";
import { ROOM_IDS, getRoomDef } from "../../data/shipRooms";
import { useCrewStore } from "../../stores/crewStore";
import { useGameStore } from "../../stores/gameStore";
import { useJobStore } from "../../stores/jobStore";
import { useShipInteriorStore } from "../../stores/shipInteriorStore";

// Phase 18-D: two room models coexist by design —
//   - shipInteriorStore.rooms is the single source of PHYSICAL room state
//     (condition/load/tier/modules/activeCrisisId), driven by wear and the
//     Phase 6 crisis system.
//   - jobStore.rooms is a derived JOB-SLOT INDEX (slotCapacity/loadThreshold
//     from ROOM_CONFIG + activeJobIds/currentLoad recomputed from the `jobs`
//     array), consumed by job-scheduling UI (Ship.jsx's RoomSlotPanel,
//     RoomDetailPanel.jsx, CrewFacilityStatus.jsx). jobScheduler.scheduleJobs
//     itself only reads room.slotCapacity from it — currentLoad/activeJobIds
//     are informational/derived only, never an independent source of truth.
// These tests pin down that role separation and the "always derived, never
// diverges from `jobs`, tolerates old-shape saves" contract.

function tick(minutes, times = 1) {
  for (let i = 0; i < times; i += 1) {
    useGameStore.getState().advanceMinutes(minutes);
    processTimedJobs(minutes);
  }
}

describe("room model role separation (Phase 18-D)", () => {
  it("shipInteriorStore.rooms carries physical-state fields that jobStore.rooms does not", () => {
    const interiorRoom = useShipInteriorStore.getState().rooms.engineering;
    expect(interiorRoom).toMatchObject({ condition: expect.any(Number), load: expect.any(Number), tier: expect.any(Number), modules: expect.any(Array), activeCrisisId: null });
    expect(interiorRoom.slotCapacity).toBeUndefined();
    expect(interiorRoom.activeJobIds).toBeUndefined();
  });

  it("jobStore.rooms carries job-slot-index fields that shipInteriorStore.rooms does not", () => {
    const jobRoom = useJobStore.getState().rooms.engineering;
    expect(jobRoom).toMatchObject({ slotCapacity: expect.any(Number), loadThreshold: expect.any(Number), activeJobIds: expect.any(Array), currentLoad: expect.any(Number) });
    expect(jobRoom.condition).toBeUndefined();
    expect(jobRoom.tier).toBeUndefined();
    expect(jobRoom.activeCrisisId).toBeUndefined();
  });

  it("mutating shipInteriorStore's room condition/load never changes jobStore's currentLoad, and vice versa", () => {
    const beforeJobLoad = useJobStore.getState().rooms.engineering.currentLoad;
    useShipInteriorStore.setState((state) => ({ rooms: { ...state.rooms, engineering: { ...state.rooms.engineering, condition: 12, load: 91 } } }));
    expect(useJobStore.getState().rooms.engineering.currentLoad).toBe(beforeJobLoad);

    const beforeInteriorLoad = useShipInteriorStore.getState().rooms.engineering.load;
    useJobStore.getState().recomputeRoomLoad();
    expect(useShipInteriorStore.getState().rooms.engineering.load).toBe(beforeInteriorLoad);
  });
});

describe("jobStore.rooms is a deterministic derived value (Phase 18-D)", () => {
  it("recomputes activeJobIds/currentLoad purely from the in-progress jobs array on every mutation", () => {
    const member = useCrewStore.getState().crew.find((entry) => entry.role === "기관실" && entry.alive);
    const currentMinute = useGameStore.getState().currentMinute;
    const before = useJobStore.getState().rooms.engineering.currentLoad;

    const job = useJobStore.getState().enqueueJob({ type: "hull_repair", roomId: "engineering", requiredRole: "engineer", cost: 0, duration: 60, createdAt: currentMinute });
    // Still backlog: enqueueing alone must not touch currentLoad.
    expect(useJobStore.getState().rooms.engineering.currentLoad).toBe(before);

    // Drive it to in_progress via the real scheduler + tick path.
    tick(10, 6);
    const running = useJobStore.getState().jobs.find((entry) => entry.id === job.id);
    expect(running.status).toBe("in_progress");

    const room = useJobStore.getState().rooms.engineering;
    expect(room.activeJobIds).toContain(job.id);
    expect(room.currentLoad).toBe(before + running.loadCost);
    void member; // role match is what let the scheduler assign it; kept for clarity
  });

  it("ignores whatever is written directly to rooms and rebuilds it from jobs on the next job mutation", () => {
    useJobStore.setState({ rooms: { engineering: { id: "engineering", slotCapacity: 999, loadThreshold: 1, activeJobIds: ["bogus"], currentLoad: 12345 } } });
    expect(useJobStore.getState().rooms.engineering.currentLoad).toBe(12345); // corrupted, as expected, until the next derive

    useJobStore.getState().recomputeRoomLoad();

    const recomputed = useJobStore.getState().rooms.engineering;
    expect(recomputed.currentLoad).not.toBe(12345);
    expect(recomputed.slotCapacity).toBe(ROOM_CONFIG.engineering.slotCapacity); // restored from ROOM_CONFIG, not the corrupted value
    expect(recomputed.activeJobIds).not.toContain("bogus");
  });

  it("jobScheduler only reads slotCapacity off the rooms object — currentLoad/activeJobIds are display-only", () => {
    // scheduleJobs recomputes "used slots" straight from the jobs array
    // (usedSlotIdsForRoom), not from room.currentLoad/activeJobIds, so a room
    // object with a bogus currentLoad but a real slotCapacity schedules
    // exactly as if currentLoad were correct. Uses a role-agnostic job type
    // (decode has no requiredRole) in "ops" so it doesn't contend with the
    // engineer already tied up by the previous test's in-progress job.
    const currentMinute = useGameStore.getState().currentMinute;
    const job = useJobStore.getState().enqueueJob({ type: "decode", roomId: "ops", cost: 0, duration: 30, createdAt: currentMinute, payload: { itemId: "blackbox" } });

    useJobStore.setState((state) => ({ rooms: { ...state.rooms, ops: { ...state.rooms.ops, currentLoad: 999999, activeJobIds: ["totally-not-real"] } } }));

    const logs = useJobStore.getState().runScheduler({ currentMinute, crew: useCrewStore.getState().crew });
    expect(logs.some((entry) => entry.includes("assign"))).toBe(true);
    expect(useJobStore.getState().jobs.find((entry) => entry.id === job.id).status).toBe("assigned");
  });
});

describe("jobStore persist merge tolerates old-shape saves (Phase 18-D)", () => {
  function mergeWith(persistedState) {
    return useJobStore.persist.getOptions().merge(persistedState, useJobStore.getState());
  }

  it("excludes the derived rooms field from what gets persisted going forward", () => {
    const partialize = useJobStore.persist.getOptions().partialize;
    const persisted = partialize(useJobStore.getState());
    expect(persisted).not.toHaveProperty("rooms");
    expect(persisted).toHaveProperty("jobs");
  });

  it("rebuilds a fully valid rooms index when persistedState.rooms is missing entirely (a save written after this change)", () => {
    const merged = mergeWith({ jobs: [], legacyMigrationVersion: 3, legacyMigrationErrors: [] });
    expect(Object.keys(merged.rooms).sort()).toEqual(Object.keys(ROOM_CONFIG).sort());
    Object.values(merged.rooms).forEach((room) => expect(room.currentLoad).toBe(0));
  });

  it("rebuilds a fully valid rooms index even when persistedState.rooms is a stale/garbage pre-18-D shape", () => {
    const staleRooms = { engineering: { id: "engineering", slotCapacity: 1, currentLoad: 77, activeJobIds: ["ghost-job"] }, "not-a-real-room": { id: "not-a-real-room" } };
    const merged = mergeWith({ jobs: [], rooms: staleRooms, legacyMigrationVersion: 3, legacyMigrationErrors: [] });
    expect(Object.keys(merged.rooms).sort()).toEqual(Object.keys(ROOM_CONFIG).sort());
    expect(merged.rooms.engineering.currentLoad).toBe(0); // not 77 — recomputed from jobs, ignoring the stale save
    expect(merged.rooms["not-a-real-room"]).toBeUndefined();
  });

  it("derives rooms from persisted in_progress jobs rather than any persisted rooms snapshot", () => {
    const persistedJobs = [{ id: "old-save-job", type: "training", roomId: "living", status: "in_progress", assignedCrewId: "m1", priority: 5, progress: 0.4, duration: 60, loadCost: 1, createdAt: 0, startedAt: 0, arrivalAt: null, payload: {}, events: [], cost: 0 }];
    const merged = mergeWith({ jobs: persistedJobs, legacyMigrationVersion: 3, legacyMigrationErrors: [] });
    expect(merged.rooms.living.currentLoad).toBe(1);
    expect(merged.rooms.living.activeJobIds).toEqual(["old-save-job"]);
  });
});

describe("ROOM_CONFIG stays keyed off shipRooms.js's single room-id source (Phase 18-D)", () => {
  it("has exactly the same set of room ids as ROOM_IDS — no room can exist in one without the other", () => {
    // Key order intentionally differs from ROOM_IDS (job-slot-capacity order
    // predates Phase 18-D and jobStore.rooms' iteration order is user-visible
    // in Ship.jsx's RoomSlotPanel), so this checks set equality, not order.
    expect(Object.keys(ROOM_CONFIG).sort()).toEqual([...ROOM_IDS].sort());
  });

  it("labels every room from shipRooms.js's getRoomDef — no independently-maintained label copy", () => {
    ROOM_IDS.forEach((id) => {
      expect(ROOM_CONFIG[id].label).toBe(getRoomDef(id).label);
    });
  });
});

describe("vesselScope no longer exposes the dead jobRooms field on the crewAI snapshot (Phase 18-D)", () => {
  it("omits jobRooms — crewAI.js only ever reads snapshot.rooms (shipInteriorStore's physical state)", () => {
    const snapshot = getActiveVesselCrewAiSnapshot({ currentMinute: useGameStore.getState().currentMinute });
    expect(snapshot).not.toHaveProperty("jobRooms");
    expect(snapshot.rooms).toBe(useShipInteriorStore.getState().rooms);
  });
});

describe("vesselScope dead export removal (Phase 18-E)", () => {
  it("no longer exports getActiveVesselResourceView (grep found zero call sites) or getActiveVesselScope (zero external callers)", async () => {
    const vesselScopeModule = await import("../vesselScope");
    expect(vesselScopeModule.getActiveVesselResourceView).toBeUndefined();
    expect(vesselScopeModule.getActiveVesselScope).toBeUndefined();
    expect(vesselScopeModule.getActiveVesselCrewAiSnapshot).toBeTypeOf("function");
  });
});
