import { describe, expect, it } from "vitest";
import { EVENT_CHAIN_STATUS } from "../../data/eventChains";
import { EVENT_CHAINS } from "../../data/eventChains";
import { canPresentStoryRuntime, cancelUnknownEventRuntimes, createEventRuntime, getDueEventRuntimes, normalizeEventRuntimeMap, normalizePendingStoryMap, normalizeStoryHistory, resolveStoryEncounterChoice } from "../eventChainSystem";

const chain = { id: "test-chain", version: 1, stages: [{ id: "one" }] };

describe("eventChainSystem", () => {
  it("normalizes legacy additive state and bounds history", () => {
    expect(EVENT_CHAINS.every((chain) => chain.autoRegister === false)).toBe(true);
    expect(normalizeEventRuntimeMap(null)).toEqual({});
    expect(normalizePendingStoryMap({ ship: { runtimeId: "missing" } }, {})).toEqual({});
    expect(normalizeStoryHistory(Array.from({ length: 80 }, (_, id) => ({ id })))).toHaveLength(40);
    const unknown = createEventRuntime({ chain, vesselId: "ship", seed: "legacy" });
    expect(cancelUnknownEventRuntimes({ [unknown.id]: unknown }, [])[unknown.id].status).toBe(EVENT_CHAIN_STATUS.cancelled);
  });
  it("fires a due runtime once and never overwrites a vessel gate", () => {
    const runtime = createEventRuntime({ chain, vesselId: "ship", currentMinute: 10, dueAtMinute: 20, seed: "fixed" });
    expect(getDueEventRuntimes({ [runtime.id]: runtime }, 100).map((entry) => entry.id)).toEqual([runtime.id]);
    expect(canPresentStoryRuntime({ runtime, pendingByVesselId: { ship: { runtimeId: "other" } } })).toBe(false);
    expect(canPresentStoryRuntime({ runtime, blockedVesselIds: new Set(["ship"]) })).toBe(false);
    expect(getDueEventRuntimes({ [runtime.id]: { ...runtime, status: EVENT_CHAIN_STATUS.pending } }, 100)).toEqual([]);
  });
  it("safe-cancels invalid next stages and terminal statuses", () => {
    const runtime = { ...createEventRuntime({ chain, vesselId: "ship", seed: "bad" }), status: EVENT_CHAIN_STATUS.pending };
    const encounter = { runtimeId: runtime.id, stageId: "one", claimId: "claim" };
    const badNext = { ...chain, stages: [{ id: "one", options: [{ id: "go", transition: { nextStageId: "missing" } }] }] };
    expect(resolveStoryEncounterChoice({ runtime, encounter, chain: badNext, runtimeId: runtime.id, stageId: "one", claimId: "claim", optionId: "go" })).toMatchObject({ ok: true, safeCancelled: true, reason: "invalidTransition", runtime: { status: "cancelled" } });
    const badTerminal = { ...chain, stages: [{ id: "one", options: [{ id: "go", transition: { terminalStatus: "victory" } }] }] };
    expect(resolveStoryEncounterChoice({ runtime, encounter, chain: badTerminal, runtimeId: runtime.id, stageId: "one", claimId: "claim", optionId: "go" })).toMatchObject({ ok: true, safeCancelled: true, runtime: { status: "cancelled" } });
  });
});
