import { describe, expect, it } from "vitest";
import { equipmentForCrew, mergePersistedEquipmentState, useEquipmentStore } from "../../stores/equipmentStore";
import { mergePersistedIncidentState, useIncidentStore } from "../../stores/incidentStore";
import { useMissionStore } from "../../stores/missionStore";
import { useCrewStore } from "../../stores/crewStore";
import { GREYWAKE } from "../../data/constants";
import { applyCombatCasualtyWithJobs, reconcileDeceasedEquipment } from "../gameClock";
import { getEffectiveCrewProfile, outcomeTier, prepareCrewLead, projectActionModifiers, specialtyAvailability } from "../crewCapabilitySystem";
import { getCrewEquipment } from "../../data/crewEquipment";

const engineer = { id: "eng", alive: true, fatigue: 12, injury: "healthy", specialtyId: "bypass-wiring", specialtyState: {}, stats: { engineering: 16 } };

describe("Phase 27-A crew agency", () => {
  it("uses the same deterministic effective profile for fatigue, injury, and one contextual tool", () => {
    const rig = { instanceId: "rig", definition: getCrewEquipment("insulated-torque-rig") };
    expect(getEffectiveCrewProfile({ member: { ...engineer, fatigue: 76, injury: "경상" }, context: "engineering", equipment: [rig] })).toMatchObject({ base: 16, fatigueLoss: 5, injuryLoss: 2, gearBonus: 0, effective: 9 });
    expect(projectActionModifiers(prepareCrewLead({ member: engineer, context: "engineering", threshold: 10, equipment: [rig] })).durationMinutes).toBe(-60);
  });

  it("has deterministic below/standard/expert thresholds and a sector-once specialty gate", () => {
    const profile = getEffectiveCrewProfile({ member: engineer, context: "engineering" });
    expect(outcomeTier(profile, 14)).toBe("standard");
    expect(specialtyAvailability({ member: engineer, sectorId: "a", context: "engineering", profile }).ok).toBe(true);
    expect(specialtyAvailability({ member: { ...engineer, specialtyState: { usedSectorId: "a" } }, sectorId: "a", context: "engineering", profile }).reason).toBe("usedSector");
  });

  it("projects the authored Greywake and Quarantine tools, not a fabricated stat bonus", () => {
    const scout = { id: "scout", alive: true, fatigue: 0, injury: "healthy", stats: { scouting: 16 } };
    const medic = { id: "medic", alive: true, fatigue: 0, injury: "healthy", stats: { medicine: 16 } };
    const calibration = { instanceId: "case", definition: getCrewEquipment("calibration-case") };
    const harness = { instanceId: "harness", definition: getCrewEquipment("trauma-harness") };
    expect(projectActionModifiers(prepareCrewLead({ member: scout, context: "greywake", threshold: 14, equipment: [calibration] }))).toMatchObject({ durationMinutes: -20 });
    expect(projectActionModifiers(prepareCrewLead({ member: medic, context: "quarantine", threshold: 14, equipment: [harness] }))).toMatchObject({ durationMinutes: -30, fatigueDelta: -4 });
  });

  it("rejects stale and double equipment commands without double equipping", () => {
    useEquipmentStore.setState({ instances: mergePersistedEquipmentState({}, {}).instances, revision: 0, receipts: {} });
    const snapshot = { crew: [{ ...engineer, id: "eng" }, { ...engineer, id: "other" }, { ...engineer, id: "engineer-min" }], jobs: [], combatByVesselId: {} };
    const first = useEquipmentStore.getState().equip({ crewId: "eng", slot: "primary", instanceId: "eq-starter-torque", revision: 0, claimId: "eq-1", ...snapshot });
    expect(first.ok).toBe(true);
    expect(useEquipmentStore.getState().equip({ crewId: "other", slot: "primary", instanceId: "eq-starter-torque", revision: 0, claimId: "eq-stale", ...snapshot }).reason).toBe("staleRevision");
    expect(useEquipmentStore.getState().equip({ crewId: "eng", slot: "primary", instanceId: "eq-starter-torque", revision: 0, claimId: "eq-1", ...snapshot }).repeated).toBe(true);
    expect(equipmentForCrew(useEquipmentStore.getState().instances, "eng")).toHaveLength(1);
  });

  it("escrows equipment on death instead of deleting it", () => {
    useEquipmentStore.setState({ instances: mergePersistedEquipmentState({}, {}).instances, revision: 0, receipts: {} });
    useEquipmentStore.getState().escrowDeceasedCrew({ crewId: "engineer-min", claimId: "death" });
    expect(useEquipmentStore.getState().instances.find((entry) => entry.instanceId === "eq-starter-torque")).toMatchObject({ escrowedForCrewId: "engineer-min", equippedSlot: null });
    expect(useEquipmentStore.getState().revision).toBe(1);
    expect(useEquipmentStore.getState().recoverEscrow({ crewId: "engineer-min", instanceId: "eq-starter-torque", claimId: "recover" })).toBe(true);
    expect(useEquipmentStore.getState().instances.find((entry) => entry.instanceId === "eq-starter-torque")).toMatchObject({ ownerCrewId: null, equippedSlot: null, escrowedForCrewId: null });
    expect(useEquipmentStore.getState().revision).toBe(2);
    expect(useEquipmentStore.getState().equip({ crewId: "eng", slot: "primary", instanceId: "eq-starter-torque", revision: 0, claimId: "stale-after-escrow", crew: [{ ...engineer, id: "eng" }], jobs: [], combatByVesselId: {} })).toMatchObject({ ok: false, reason: "staleRevision" });
  });

  it("retains instance ownership and escrow state across a save-style reload", () => {
    const saved = {
      instances: [{ instanceId: "saved-case", equipmentId: "calibration-case", ownerCrewId: "captain-yun", equippedSlot: "utility", escrowedForCrewId: null }],
      revision: 3,
      receipts: { "saved-equip": { kind: "equip" } },
    };
    const reloaded = mergePersistedEquipmentState(structuredClone(saved), {});
    expect(reloaded).toMatchObject({ revision: 3, receipts: saved.receipts });
    expect(equipmentForCrew(reloaded.instances, "captain-yun")).toMatchObject([{ instanceId: "saved-case", equipmentId: "calibration-case", equippedSlot: "utility" }]);
  });

  it("reloads story and director lead/specialty snapshots without a second sector use", () => {
    const lead = { leadCrewId: "medic-rho", context: "quarantine", threshold: 14, tier: "standard", profile: { crewId: "medic-rho", effective: 14 }, modifiers: { durationMinutes: -30, fatigueDelta: -4 } };
    const specialty = { id: "triage", crewId: "medic-rho", sectorId: "persist-sector" };
    const storyMerge = useMissionStore.persist.getOptions().merge;
    const mergedStory = storyMerge({ eventRuntimesById: { persisted: { id: "persisted", chainId: GREYWAKE.chainId, vesselId: "starter", stageId: "ops-wait", status: "settling", pendingClaim: { claimId: "story-claim", stageId: "ops-wait", optionId: "decode-last-watch", lead, specialty } } } }, useMissionStore.getState());
    expect(mergedStory.eventRuntimesById.persisted.pendingClaim).toMatchObject({ lead, specialty });

    const mergedIncident = mergePersistedIncidentState({ runtimesById: { incident: { id: "incident", templateId: "coolant-joint-leak", vesselId: "starter", status: "settling", pendingClaim: { claimId: "incident-claim", snapshot: { lead, specialty, job: { duration: 60 } } } } } }, useIncidentStore.getState());
    expect(mergedIncident.runtimesById.incident.pendingClaim.snapshot).toMatchObject({ lead, specialty, job: { duration: 60 } });

    const previousCrew = useCrewStore.getState().crew;
    useCrewStore.setState({ crew: [{ id: "specialist", alive: true, fatigue: 0, injury: "healthy", specialtyId: "triage", specialtyState: {}, stats: { medicine: 18 } }] });
    expect(useCrewStore.getState().claimSpecialtyUse({ crewId: "specialist", sectorId: "persist-sector", claimId: "story-claim" })).toMatchObject({ ok: true, repeated: false });
    expect(useCrewStore.getState().claimSpecialtyUse({ crewId: "specialist", sectorId: "persist-sector", claimId: "story-claim" })).toMatchObject({ ok: true, repeated: true });
    expect(useCrewStore.getState().crew[0].specialtyState).toMatchObject({ usedSectorId: "persist-sector", receipts: { "story-claim": true } });
    useCrewStore.setState({ crew: previousCrew });
  });

  it("locks a transfer when the current owner is busy even if the target is idle", () => {
    useEquipmentStore.setState({ instances: mergePersistedEquipmentState({}, {}).instances, revision: 0, receipts: {} });
    const crew = [{ ...engineer, id: "engineer-min" }, { ...engineer, id: "idle" }];
    expect(useEquipmentStore.getState().equip({ crewId: "idle", slot: "primary", instanceId: "eq-starter-torque", revision: 0, claimId: "source-busy", crew, jobs: [{ status: "in_progress", assignedCrewId: "engineer-min" }], combatByVesselId: {} })).toMatchObject({ ok: false, reason: "source:busy" });
  });

  it("reconciles death escrow after a crash between crew death and equipment settlement", () => {
    const previousCrew = useCrewStore.getState().crew;
    useCrewStore.setState({ crew: [{ id: "engineer-min", alive: true, fatigue: 0, injury: "healthy", specialtyId: null, specialtyState: {}, stats: { engineering: 16 } }] });
    useEquipmentStore.setState({ instances: [{ instanceId: "rig", equipmentId: "insulated-torque-rig", ownerCrewId: "engineer-min", equippedSlot: "primary", escrowedForCrewId: null }], revision: 0, receipts: {} });
    expect(() => applyCombatCasualtyWithJobs({ memberId: "engineer-min", injury: "전사", afterStep: (step) => { if (step === "crew") throw new Error("crash-after-death"); } })).toThrow("crash-after-death");
    expect(useCrewStore.getState().crew[0].alive).toBe(false);
    expect(useEquipmentStore.getState().instances[0].ownerCrewId).toBe("engineer-min");
    // A save-style reload retains the death, then the game-loop reconciliation
    // settles escrow exactly once instead of relying on retrying the casualty.
    useCrewStore.setState({ crew: structuredClone(useCrewStore.getState().crew) });
    useEquipmentStore.setState({ instances: structuredClone(useEquipmentStore.getState().instances), receipts: structuredClone(useEquipmentStore.getState().receipts) });
    expect(reconcileDeceasedEquipment()).toEqual(["engineer-min"]);
    expect(useEquipmentStore.getState().instances[0]).toMatchObject({ ownerCrewId: null, equippedSlot: null, escrowedForCrewId: "engineer-min" });
    expect(reconcileDeceasedEquipment()).toEqual([]);
    useCrewStore.setState({ crew: previousCrew });
  });

  it("uses the turret role's gunnery stat rather than falling back to scouting", () => {
    const turret = { id: "turret", alive: true, fatigue: 0, injury: "healthy", stats: { gunnery: 15, scouting: 2 } };
    expect(getEffectiveCrewProfile({ member: turret, context: "gunnery" })).toMatchObject({ statKey: "gunnery", base: 15, effective: 15 });
  });
});
