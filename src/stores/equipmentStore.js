import { create } from "zustand";
import { persist } from "zustand/middleware";
import { EQUIPMENT_SLOTS, getCrewEquipment, STARTER_EQUIPMENT } from "../data/crewEquipment";
import { passthroughMigrate, PERSIST_VERSION } from "./persistVersion";
import { getCrewChangeLockReason } from "../systems/equipmentLockSystem";

function normalizeInstance(input = {}) {
  const definition = getCrewEquipment(input.equipmentId);
  if (!definition || !input.instanceId) return null;
  return { instanceId: String(input.instanceId), equipmentId: definition.id, ownerCrewId: input.ownerCrewId ?? null, equippedSlot: EQUIPMENT_SLOTS.includes(input.equippedSlot) && definition.slot === input.equippedSlot ? input.equippedSlot : null, escrowedForCrewId: input.escrowedForCrewId ?? null };
}
function uniqueInstances(entries = []) {
  const usedSlots = new Set();
  return [...new Map(entries.map(normalizeInstance).filter(Boolean).map((entry) => [entry.instanceId, entry])).values()].map((entry) => {
    const key = entry.ownerCrewId && entry.equippedSlot ? `${entry.ownerCrewId}:${entry.equippedSlot}` : null;
    if (!key || !usedSlots.has(key)) { if (key) usedSlots.add(key); return entry; }
    return { ...entry, equippedSlot: null };
  });
}
function normalizeReceipts(value = {}) { return value && typeof value === "object" ? value : {}; }

export function equipmentForCrew(instances = [], crewId) { return instances.filter((entry) => entry.ownerCrewId === crewId && entry.equippedSlot).map((entry) => ({ ...entry, definition: getCrewEquipment(entry.equipmentId) })).filter((entry) => entry.definition); }
export function mergePersistedEquipmentState(persistedState, currentState) {
  const persisted = uniqueInstances(persistedState?.instances ?? []);
  // Old saves have no equipment key: seed the authored starter kit once. A
  // present but empty key is respected so a user can intentionally unequip all.
  const instances = persistedState?.instances === undefined ? uniqueInstances(STARTER_EQUIPMENT) : persisted;
  return { ...currentState, ...(persistedState ?? {}), instances, revision: Math.max(0, Number(persistedState?.revision ?? 0)), receipts: normalizeReceipts(persistedState?.receipts) };
}

export const useEquipmentStore = create(persist((set, get) => ({
  instances: uniqueInstances(STARTER_EQUIPMENT), revision: 0, receipts: {},
  equip: ({ crewId, slot, instanceId, revision, claimId, crew = [], jobs = [], combatByVesselId = {} } = {}) => {
    if (!crewId || !instanceId || !EQUIPMENT_SLOTS.includes(slot) || !claimId) return { ok: false, reason: "invalid" };
    const state = get();
    if (state.receipts?.[claimId]) return { ok: true, repeated: true, revision: state.revision };
    const targetLock = getCrewChangeLockReason({ crew, jobs, combatByVesselId, crewId });
    if (targetLock) return { ok: false, reason: targetLock };
    if (revision !== state.revision) return { ok: false, reason: "staleRevision" };
    const instance = state.instances.find((entry) => entry.instanceId === instanceId);
    const definition = getCrewEquipment(instance?.equipmentId);
    if (!instance || !definition || instance.escrowedForCrewId || definition.slot !== slot) return { ok: false, reason: "ineligible" };
    const sourceLock = instance.ownerCrewId && instance.ownerCrewId !== crewId ? getCrewChangeLockReason({ crew, jobs, combatByVesselId, crewId: instance.ownerCrewId }) : null;
    if (sourceLock) return { ok: false, reason: `source:${sourceLock}` };
    const nextRevision = state.revision + 1;
    set((current) => ({
      instances: current.instances.map((entry) => entry.instanceId === instanceId
        ? { ...entry, ownerCrewId: crewId, equippedSlot: slot }
        : entry.ownerCrewId === crewId && entry.equippedSlot === slot ? { ...entry, equippedSlot: null } : entry),
      revision: nextRevision, receipts: { ...current.receipts, [claimId]: { kind: "equip", instanceId, crewId, slot, revision: nextRevision } },
    }));
    return { ok: true, revision: nextRevision };
  },
  unequip: ({ crewId, slot, revision, claimId, crew = [], jobs = [], combatByVesselId = {} } = {}) => {
    if (!crewId || !EQUIPMENT_SLOTS.includes(slot) || !claimId) return { ok: false, reason: "invalid" };
    const state = get();
    if (state.receipts?.[claimId]) return { ok: true, repeated: true, revision: state.revision };
    const lock = getCrewChangeLockReason({ crew, jobs, combatByVesselId, crewId });
    if (lock) return { ok: false, reason: lock };
    if (revision !== state.revision) return { ok: false, reason: "staleRevision" };
    if (!state.instances.some((entry) => entry.ownerCrewId === crewId && entry.equippedSlot === slot)) return { ok: false, reason: "empty" };
    const nextRevision = state.revision + 1;
    set((current) => ({ instances: current.instances.map((entry) => entry.ownerCrewId === crewId && entry.equippedSlot === slot ? { ...entry, equippedSlot: null } : entry), revision: nextRevision, receipts: { ...current.receipts, [claimId]: { kind: "unequip", crewId, slot, revision: nextRevision } } }));
    return { ok: true, revision: nextRevision };
  },
  escrowDeceasedCrew: ({ crewId, claimId } = {}) => {
    if (!crewId || !claimId || get().receipts?.[claimId]) return false;
    const affected = get().instances.some((entry) => entry.ownerCrewId === crewId);
    set((state) => ({ instances: state.instances.map((entry) => entry.ownerCrewId === crewId ? { ...entry, ownerCrewId: null, equippedSlot: null, escrowedForCrewId: crewId } : entry), revision: affected ? state.revision + 1 : state.revision, receipts: { ...state.receipts, [claimId]: { kind: "deathEscrow", crewId } } }));
    return true;
  },
  recoverEscrow: ({ crewId, instanceId, claimId } = {}) => {
    if (!crewId || !instanceId || !claimId || get().receipts?.[claimId]) return false;
    const instance = get().instances.find((entry) => entry.instanceId === instanceId && entry.escrowedForCrewId === crewId);
    if (!instance) return false;
    set((state) => ({ instances: state.instances.map((entry) => entry.instanceId === instanceId ? { ...entry, escrowedForCrewId: null } : entry), revision: state.revision + 1, receipts: { ...state.receipts, [claimId]: { kind: "recoverEscrow", crewId, instanceId } } }));
    return true;
  },
  grantAuthored: ({ instance, claimId } = {}) => {
    const normalized = normalizeInstance(instance);
    if (!normalized || !claimId || get().receipts?.[claimId]) return false;
    set((state) => ({ instances: state.instances.some((entry) => entry.instanceId === normalized.instanceId) ? state.instances : [...state.instances, normalized], receipts: { ...state.receipts, [claimId]: { kind: "grant", instanceId: normalized.instanceId } } }));
    return true;
  },
}), { name: "space-manager-equipment", version: PERSIST_VERSION, migrate: passthroughMigrate, merge: mergePersistedEquipmentState }));
