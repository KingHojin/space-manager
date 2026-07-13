import { describe, expect, it } from "vitest";
import { ROOM_CONFIG } from "../../data/constants";
import { estimateIncidentJobTiming, formatIncidentClock, formatIncidentDeadlineForecast, summarizeIncidentEffects } from "../incidentPresentation";

const crew = [
  { id: "engineer", alive: true, role: "기관실", fatigue: 20, injury: null },
  { id: "captain", alive: true, role: "함교", fatigue: 20, injury: null },
];
const lowMoodCrew = [
  { id: "engineer", alive: true, role: "기관실", fatigue: 70, injury: null, needs: { mood: 10, hunger: 80, stress: 80, sleepDebt: 80, hygiene: 20 } },
  crew[1],
];

const repairOption = {
  id: "repair",
  job: {
    roomId: "engineering",
    duration: 120,
    requiredRole: "기관실",
    completionEffects: [{ type: "room", roomId: "engineering", condition: 6, load: -8 }],
    failureEffects: [{ type: "room", roomId: "engineering", condition: -6, load: 8 }],
  },
};

describe("incident presentation metadata", () => {
  it("automatically exposes room load, item grants, and split crew consequences", () => {
    const lines = summarizeIncidentEffects([
      { type: "room", roomId: "engineering", condition: 6, load: -8 },
      { type: "items", grants: [{ itemId: "research-data", qty: 1 }] },
      { type: "targetPair", firstMorale: 1, secondNeeds: { stress: 9 }, affinity: -12 },
    ], ["윤", "민"]);
    expect(lines).toContain("기관실 상태 +6");
    expect(lines).toContain("기관실 부하 -8");
    expect(lines).toContain("연구 데이터 +1");
    expect(lines).toContain("윤 사기 +1");
    expect(lines).toContain("민 스트레스 +9");
    expect(lines).toContain("윤 · 민 관계 -12");
  });

  it("dry-runs the production scheduler for a fixed incident duration", () => {
    const forecast = estimateIncidentJobTiming({
      option: repairOption,
      runtime: { severity: "daily" },
      currentMinute: 100,
      jobs: [],
      rooms: ROOM_CONFIG,
      crew,
    });
    expect(forecast).toEqual({ startAt: 110, completionAt: 230, duration: 120 });
    expect(formatIncidentClock(forecast.completionAt)).toBe("03:50");
    expect(formatIncidentDeadlineForecast(forecast, 220)).toEqual({ late: true, label: "완료 예상 03:50 / 마감 03:40 / 늦음 위험" });
  });

  it("includes an existing crew reservation in the estimated start", () => {
    const forecast = estimateIncidentJobTiming({
      option: repairOption,
      runtime: { severity: "daily" },
      currentMinute: 100,
      jobs: [{ id: "busy", type: "hull_repair", roomId: "bridge", status: "in_progress", assignedCrewId: "engineer", requiredRole: "engineer", priority: "normal", startedAt: 80, duration: 90, effectiveDuration: 90, progress: 0.2, payload: {} }],
      rooms: ROOM_CONFIG,
      crew,
    });
    expect(forecast).toEqual({ startAt: 180, completionAt: 300, duration: 120 });
  });

  it("keeps a saved done job's authored completion time for truthful recovery tracking", () => {
    const forecast = estimateIncidentJobTiming({
      jobId: "done-incident",
      currentMinute: 400,
      jobs: [{ id: "done-incident", status: "done", startedAt: 200, duration: 120, effectiveDuration: 120, payload: { incident: {} } }],
      rooms: ROOM_CONFIG,
      crew,
    });
    expect(forecast).toEqual({ startAt: 200, completionAt: 320, duration: 120 });
  });

  it.each([
    ["assigned", { status: "assigned", assignedCrewId: "engineer", arrivalAt: 100 }, 332],
    ["backlog", { status: "backlog", assignedCrewId: null, arrivalAt: null }, 342],
  ])("uses production low-mood duration for a %s predecessor", (_label, state, expectedCompletionAt) => {
    const forecast = estimateIncidentJobTiming({
      option: repairOption,
      runtime: { severity: "daily" },
      currentMinute: 100,
      jobs: [{ id: "slow-predecessor", type: "hull_repair", roomId: "engineering", requiredRole: "engineer", priority: "high", createdAt: 0, duration: 90, progress: 0, payload: {}, ...state }],
      rooms: ROOM_CONFIG,
      crew: lowMoodCrew,
    });
    expect(forecast).toEqual({ startAt: expectedCompletionAt - 120, completionAt: expectedCompletionAt, duration: 120 });
  });
});
