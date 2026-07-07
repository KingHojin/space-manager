import { describe, expect, it } from "vitest";
import { passthroughMigrate, PERSIST_VERSION } from "../../stores/persistVersion";
import { useCrewStore } from "../../stores/crewStore";
import { useGameStore } from "../../stores/gameStore";
import { useJobStore } from "../../stores/jobStore";

// Phase 18-E: proves that pre-existing (version-less) saves keep loading
// correctly now that every persisted store declares `version: PERSIST_VERSION`
// + `migrate: passthroughMigrate`.
//
// zustand's persist middleware (node_modules/zustand/esm/middleware.mjs,
// persistImpl/hydrate) always writes `{ state, version: options.version }` to
// storage, and before Phase 18-E none of these stores set a `version` option,
// which defaults to 0 — so every save written before this phase already has
// an explicit `version: 0` on disk. Bumping a store's `options.version` to 1
// means those saves are now read back as "version 0, needs migration": the
// middleware calls `migrate(state, 0)`, then always feeds the result into the
// store's existing `merge(persistedState, currentState)` (migrate runs first,
// merge always runs after, never the other way around — see
// src/stores/persistVersion.js's header comment for the exact source lines).
// `passthroughMigrate` returns the state unchanged, so this whole path
// reduces to "call the store's pre-existing merge exactly as before" — which
// is why old saves must keep loading exactly as they did pre-Phase-18-E.

function writeStorage(name, value) {
  localStorage.setItem(name, JSON.stringify(value));
}

describe("passthroughMigrate", () => {
  it("returns the persisted state unchanged regardless of the incoming version", () => {
    const state = { foo: "bar", nested: { a: 1 } };
    expect(passthroughMigrate(state, 0)).toBe(state);
    expect(passthroughMigrate(state, 0)).toEqual(state);
    expect(passthroughMigrate(state, 999)).toBe(state);
  });
});

describe("version-0 (pre-Phase-18-E, unversioned) saves rehydrate correctly", () => {
  it("gameStore: version:0 save loads shipName/resources/currentMinute as-is", async () => {
    writeStorage("space-manager-game", {
      version: 0,
      state: {
        shipName: "레거시 항로",
        shipGrade: "shuttle",
        currentMinute: 4820,
        isPaused: false,
        speed: 2,
        resources: { credits: 777, fuel: 55, oxygen: 61, hull: 88 },
        lastLowResourceWarningAt: null,
        logs: ["옛 저장 로그"],
        news: ["옛 뉴스"],
      },
    });

    await useGameStore.persist.rehydrate();
    const state = useGameStore.getState();

    expect(state.shipName).toBe("레거시 항로");
    expect(state.currentMinute).toBe(4820);
    expect(state.resources).toEqual({ credits: 777, fuel: 55, oxygen: 61, hull: 88 });
  });

  it("crewStore: version:0 save loads a known crew member's saved fields", async () => {
    writeStorage("space-manager-crew", {
      version: 0,
      state: {
        crew: [{ id: "captain-yun", alive: true, fatigue: 42, experience: 13, morale: "보통" }],
        trainingQueue: [],
        treatmentQueue: [],
        recoveryQueue: [],
        crewActivities: [],
        crewActivityLog: [],
        lastCrewAiAt: null,
      },
    });

    await useCrewStore.persist.rehydrate();
    const captain = useCrewStore.getState().crew.find((member) => member.id === "captain-yun");

    expect(captain).toBeDefined();
    expect(captain.fatigue).toBe(42);
    expect(captain.experience).toBe(13);
  });

  it("jobStore: version:0 save loads jobs and recomputes rooms from them (rooms itself is never trusted from storage)", async () => {
    writeStorage("space-manager-jobs", {
      version: 0,
      state: {
        jobs: [
          {
            id: "legacy-job-1",
            type: "training",
            roomId: "living",
            status: "in_progress",
            assignedCrewId: "captain-yun",
            priority: 3,
            progress: 0.5,
            duration: 120,
            createdAt: 0,
            startedAt: 0,
            payload: { targetCrewId: "captain-yun", statKey: "leadership" },
          },
        ],
        // Older (pre-18-D) saves could carry a stale/independent `rooms`
        // blob; merge always recomputes rooms from `jobs` and ignores it.
        rooms: { bogus: { id: "bogus", activeJobIds: ["nonexistent"] } },
        legacyMigrationVersion: 3,
        legacyMigrationErrors: [],
      },
    });

    await useJobStore.persist.rehydrate();
    const state = useJobStore.getState();
    const job = state.jobs.find((entry) => entry.id === "legacy-job-1");

    expect(job).toBeDefined();
    expect(job.priority).toBe(3);
    expect(job.progress).toBe(0.5);
    expect(state.rooms.bogus).toBeUndefined();
    expect(state.rooms.living.activeJobIds).toContain("legacy-job-1");
  });
});

describe("version-1 (current) saves round-trip unchanged", () => {
  it("gameStore: a version:1 save is read back with the same values (no migration needed)", async () => {
    writeStorage("space-manager-game", {
      version: PERSIST_VERSION,
      state: {
        shipName: "현재 항로",
        shipGrade: "shuttle",
        currentMinute: 100,
        isPaused: true,
        speed: 1,
        resources: { credits: 500, fuel: 90, oxygen: 90, hull: 90 },
        lastLowResourceWarningAt: null,
        logs: [],
        news: [],
      },
    });

    await useGameStore.persist.rehydrate();
    expect(useGameStore.getState().shipName).toBe("현재 항로");
    expect(useGameStore.getState().resources.credits).toBe(500);
  });
});

describe("unknown future persist versions do not crash rehydrate", () => {
  it("gameStore: a version far ahead of PERSIST_VERSION still hydrates via passthroughMigrate + merge", async () => {
    writeStorage("space-manager-game", {
      version: PERSIST_VERSION + 99,
      state: {
        shipName: "미래에서 온 저장",
        shipGrade: "shuttle",
        currentMinute: 1,
        isPaused: true,
        speed: 1,
        resources: { credits: 1, fuel: 1, oxygen: 1, hull: 1 },
        lastLowResourceWarningAt: null,
        logs: [],
        news: [],
      },
    });

    await expect(useGameStore.persist.rehydrate()).resolves.not.toThrow();
    expect(useGameStore.getState().shipName).toBe("미래에서 온 저장");
  });

  it("jobStore: a save with no `version` field at all (not just version:0) still hydrates without crashing", async () => {
    // zustand only treats `version` as present when it's a number; a value
    // with no version key at all skips migrate and goes straight to merge —
    // covered here as an extra defensive case beyond the realistic
    // (always-explicit-version-0) legacy-save shape tested above.
    writeStorage("space-manager-jobs", {
      state: { jobs: [], rooms: {}, legacyMigrationVersion: 0, legacyMigrationErrors: [] },
    });

    await expect(useJobStore.persist.rehydrate()).resolves.not.toThrow();
    expect(useJobStore.getState().jobs).toEqual([]);
  });
});
