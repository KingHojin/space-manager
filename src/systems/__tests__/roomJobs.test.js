import { describe, expect, it } from "vitest";
import {
  applyRoomTick,
  createInitialRoomState,
  deriveRoomStatus,
  getRoomJob,
  getRoomSlots,
  pickRoomJobsForIdleCrew,
  scoreJobForMember,
} from "../roomJobs";
import { ROOM_IDS } from "../../data/shipRooms";

function baseRoom(overrides = {}) {
  return { id: "engineering", condition: 82, load: 18, jobId: null, assignedMemberId: null, assignedMemberIds: [], progress: 0, activeCrisisId: null, status: "안정", tier: 1, modules: [], ...overrides };
}

function member(overrides = {}) {
  return { id: "m1", alive: true, role: "기관실", fatigue: 10, injury: "healthy", ...overrides };
}

describe("deriveRoomStatus", () => {
  it("returns 위기 whenever activeCrisisId is set, overriding everything else", () => {
    expect(deriveRoomStatus(baseRoom({ activeCrisisId: "crisis-1", condition: 100, load: 0, jobId: "x" }))).toBe("위기");
  });

  it("returns 작업 중 when a jobId is set and there is no crisis", () => {
    expect(deriveRoomStatus(baseRoom({ jobId: "job-1", condition: 100, load: 0 }))).toBe("작업 중");
  });

  it("returns 위험 at the boundary: condition < 35 or load > 75", () => {
    expect(deriveRoomStatus(baseRoom({ condition: 34, load: 0 }))).toBe("위험");
    expect(deriveRoomStatus(baseRoom({ condition: 35, load: 0 }))).not.toBe("위험");
    expect(deriveRoomStatus(baseRoom({ condition: 100, load: 76 }))).toBe("위험");
    expect(deriveRoomStatus(baseRoom({ condition: 100, load: 75 }))).not.toBe("위험");
  });

  it("returns 점검 필요 at the boundary: condition < 70 or load > 40 (and not already 위험)", () => {
    expect(deriveRoomStatus(baseRoom({ condition: 69, load: 0 }))).toBe("점검 필요");
    expect(deriveRoomStatus(baseRoom({ condition: 70, load: 0 }))).toBe("안정");
    expect(deriveRoomStatus(baseRoom({ condition: 100, load: 41 }))).toBe("점검 필요");
    expect(deriveRoomStatus(baseRoom({ condition: 100, load: 40 }))).toBe("안정");
  });

  it("returns 안정 for a healthy room with no job/crisis", () => {
    expect(deriveRoomStatus(baseRoom({ condition: 100, load: 0 }))).toBe("안정");
  });
});

describe("getRoomJob", () => {
  it("returns the catalog entry for a known room id", () => {
    expect(getRoomJob("bridge")?.id).toBe("bridge-route-analysis");
  });

  it("returns null for an unknown room id", () => {
    expect(getRoomJob("nonexistent-room")).toBeNull();
  });
});

describe("getRoomSlots", () => {
  it("returns at least 1 slot for a tier-1 room with no modules", () => {
    expect(getRoomSlots(baseRoom({ tier: 1, modules: [] }))).toBe(1);
  });

  it("returns 2 slots for a tier-3 room (base slots doubles per ROOM_TIER_CONFIG)", () => {
    expect(getRoomSlots(baseRoom({ tier: 3, modules: [] }))).toBe(2);
  });

  it("adds a slot when the aux-bay module is installed", () => {
    expect(getRoomSlots(baseRoom({ tier: 1, modules: ["aux-bay"] }))).toBe(2);
  });
});

describe("scoreJobForMember", () => {
  it("returns null when there is no job", () => {
    expect(scoreJobForMember(member(), baseRoom(), null)).toBeNull();
  });

  it("returns null for a dead member", () => {
    expect(scoreJobForMember(member({ alive: false }), baseRoom(), getRoomJob("engineering"))).toBeNull();
  });

  it("returns null when the member cannot work due to injury", () => {
    expect(scoreJobForMember(member({ injury: "중상" }), baseRoom(), getRoomJob("engineering"))).toBeNull();
  });

  it("returns null when the room has an active crisis", () => {
    expect(scoreJobForMember(member(), baseRoom({ activeCrisisId: "c1" }), getRoomJob("engineering"))).toBeNull();
  });

  it("returns null when the room's assignment slots are full and the member isn't already assigned", () => {
    const room = baseRoom({ tier: 1, modules: [], assignedMemberIds: ["other-member"] });
    expect(scoreJobForMember(member({ id: "m1" }), room, getRoomJob("engineering"))).toBeNull();
  });

  it("scores a role-matching member higher than a non-matching one in the same room/state", () => {
    const room = baseRoom();
    const job = getRoomJob("engineering");
    const matching = scoreJobForMember(member({ role: "기관실" }), room, job);
    const nonMatching = scoreJobForMember(member({ role: "포탑" }), room, job);
    expect(matching).toBeGreaterThan(nonMatching);
  });

  it("applies mood as a small multiplier to room-work scoring", () => {
    const room = baseRoom();
    const job = getRoomJob("engineering");
    const inspired = scoreJobForMember(member({ fatigue: 0, needs: { mood: 95, hunger: 0, stress: 0, sleepDebt: 0, hygiene: 100 } }), room, job);
    const strained = scoreJobForMember(member({ fatigue: 0, needs: { mood: 30, hunger: 70, stress: 75, sleepDebt: 65, hygiene: 35 } }), room, job);
    expect(inspired).toBeGreaterThan(strained);
  });

  it("penalizes higher fatigue with a lower score", () => {
    const room = baseRoom();
    const job = getRoomJob("engineering");
    const rested = scoreJobForMember(member({ fatigue: 0 }), room, job);
    const tired = scoreJobForMember(member({ fatigue: 80 }), room, job);
    expect(rested).toBeGreaterThan(tired);
  });
});

describe("pickRoomJobsForIdleCrew", () => {
  it("assigns each idle member to at most one room and respects room slot limits", () => {
    const rooms = createInitialRoomState();
    const idleMembers = [
      member({ id: "eng1", role: "기관실" }),
      member({ id: "eng2", role: "기관실" }),
      member({ id: "eng3", role: "기관실" }),
    ];
    const assignments = pickRoomJobsForIdleCrew({ idleMembers, rooms, currentMinute: 0 });
    // engineering room base tier has 1 slot, so at most 1 of the 3 engineers should land there.
    const engineeringAssignees = [...assignments.entries()].filter(([, value]) => value.roomId === "engineering");
    expect(engineeringAssignees.length).toBeLessThanOrEqual(1);
    // Every assigned member should map to a real room id.
    assignments.forEach((value) => expect(ROOM_IDS).toContain(value.roomId));
  });

  it("skips rooms with an active crisis entirely", () => {
    const rooms = createInitialRoomState();
    rooms.engineering = { ...rooms.engineering, activeCrisisId: "crisis-1" };
    const idleMembers = [member({ id: "eng1", role: "기관실" })];
    const assignments = pickRoomJobsForIdleCrew({ idleMembers, rooms, currentMinute: 0 });
    if (assignments.has("eng1")) expect(assignments.get("eng1").roomId).not.toBe("engineering");
  });

  it("returns an empty map when there are no idle members", () => {
    const rooms = createInitialRoomState();
    expect(pickRoomJobsForIdleCrew({ idleMembers: [], rooms, currentMinute: 0 }).size).toBe(0);
  });
});

describe("applyRoomTick", () => {
  it("decays condition and grows load for an idle, unclaimed room over time", () => {
    const rooms = { engineering: baseRoom({ condition: 82, load: 18 }) };
    const { nextRooms } = applyRoomTick({ rooms, roomActivities: {}, deltaMinutes: 60, currentMinute: 60 });
    expect(nextRooms.engineering.condition).toBeLessThan(82);
    expect(nextRooms.engineering.load).toBeGreaterThan(18);
  });

  it("progresses a claimed job and completes it once progress reaches 100, restoring condition/load and reporting completedJobs", () => {
    const rooms = { engineering: baseRoom({ condition: 50, load: 50, progress: 0 }) };
    const roomActivities = { engineering: [{ memberId: "m1", roomId: "engineering", jobId: "engineering-tuning", speedMultiplier: 1 }] };
    // engineering-tuning duration is 100 minutes; one full duration tick should complete it.
    const { nextRooms, completedJobs, logs } = applyRoomTick({ rooms, roomActivities, deltaMinutes: 100, currentMinute: 100 });
    expect(completedJobs).toHaveLength(1);
    expect(completedJobs[0]).toMatchObject({ roomId: "engineering", jobId: "engineering-tuning", memberId: "m1" });
    expect(nextRooms.engineering.progress).toBe(0);
    expect(nextRooms.engineering.jobId).toBeNull();
    expect(nextRooms.engineering.condition).toBeGreaterThan(50);
    expect(nextRooms.engineering.load).toBeLessThan(50);
    expect(logs.some((line) => line.includes("완료"))).toBe(true);
  });


  it("applies friction penalties when conflicted crew share the same room job", () => {
    const rooms = { engineering: baseRoom({ condition: 50, load: 50, progress: 0, tier: 3 }) };
    const roomActivities = { engineering: [
      { memberId: "a", roomId: "engineering", jobId: "engineering-tuning", speedMultiplier: 1 },
      { memberId: "b", roomId: "engineering", jobId: "engineering-tuning", speedMultiplier: 1 },
    ] };
    const neutral = applyRoomTick({ rooms, roomActivities, deltaMinutes: 10, currentMinute: 10 }).nextRooms.engineering.progress;
    const friction = applyRoomTick({ rooms, roomActivities, deltaMinutes: 10, currentMinute: 10, relationships: { "a::b": { crewIds: ["a", "b"], affinity: -60, band: "friction" } } }).nextRooms.engineering.progress;
    expect(friction).toBeLessThan(neutral);
  });

  it("resets progress/assignment and grows load faster while a crisis is active", () => {
    const rooms = { engineering: baseRoom({ condition: 80, load: 20, progress: 40, jobId: "engineering-tuning", assignedMemberIds: ["m1"], activeCrisisId: "crisis-1" }) };
    const { nextRooms } = applyRoomTick({ rooms, roomActivities: {}, deltaMinutes: 60, currentMinute: 60 });
    expect(nextRooms.engineering.progress).toBe(0);
    expect(nextRooms.engineering.jobId).toBeNull();
    expect(nextRooms.engineering.assignedMemberIds).toEqual([]);
    expect(nextRooms.engineering.condition).toBeLessThan(80);
  });

  it("keeps condition and load within the 0-100 bounds across a long idle tick", () => {
    const rooms = { engineering: baseRoom({ condition: 5, load: 95 }) };
    const { nextRooms } = applyRoomTick({ rooms, roomActivities: {}, deltaMinutes: 10000, currentMinute: 10000 });
    expect(nextRooms.engineering.condition).toBeGreaterThanOrEqual(0);
    expect(nextRooms.engineering.condition).toBeLessThanOrEqual(100);
    expect(nextRooms.engineering.load).toBeGreaterThanOrEqual(0);
    expect(nextRooms.engineering.load).toBeLessThanOrEqual(100);
  });

  it("processes every ROOM_ID even when only one room is present in the input", () => {
    const rooms = { engineering: baseRoom() };
    const { nextRooms } = applyRoomTick({ rooms, roomActivities: {}, deltaMinutes: 30, currentMinute: 30 });
    ROOM_IDS.forEach((id) => expect(nextRooms[id]).toBeDefined());
  });
});
