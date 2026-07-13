import { describe, expect, it } from "vitest";
import { DIRECTOR_INCIDENTS, INCIDENT_DIRECTOR_RULES } from "../../data/directorIncidents";
import { advanceDirectorWindow, canPresentIncident, chooseIncidentTemplate, normalizeDirector, stableHash } from "../incidentDirectorSystem";

const HEALTHY = {
  aliveCrewCount: 4, foodQty: 24, avgHunger: 18, avgFatigue: 30, targetFatigue: 36, targetSleepDebt: 24,
  oxygen: 92, rooms: { engineering: { condition: 95, load: 25 }, living: { condition: 94, load: 20 }, ops: { condition: 95, load: 20 } },
  highLoadRoomCount: 0, highStressCrewCount: 0, lowestAffinity: 5, traveling: true, isNebula: false, isUnexplored: false, hasActiveCrisis: false,
};

const DAMAGED = {
  aliveCrewCount: 4, foodQty: 5, avgHunger: 58, avgFatigue: 68, targetFatigue: 82, targetSleepDebt: 74,
  oxygen: 44, rooms: { engineering: { condition: 48, load: 82 }, living: { condition: 54, load: 72 }, ops: { condition: 70, load: 35 } },
  highLoadRoomCount: 2, highStressCrewCount: 3, lowestAffinity: -38, traveling: true, isNebula: true, isUnexplored: true, hasActiveCrisis: false,
};

describe("incident director pure system", () => {
  it("is deterministic and never depends on catalog insertion order", () => {
    const args = { fromMinute: 0, toMinute: 720, vesselId: "vessel-a", sectorId: "sector-a", risk: 40, context: { aliveCrewCount: 4 }, snapshot: DAMAGED };
    const first = advanceDirectorWindow({ ...args, catalog: DIRECTOR_INCIDENTS });
    const second = advanceDirectorWindow({ ...args, catalog: [...DIRECTOR_INCIDENTS].reverse() });
    expect(first.selected).toEqual(second.selected);
    expect(first.director).toEqual(second.director);
    expect(stableHash("same-seed")).toBe(stableHash("same-seed"));
  });

  it("keeps the same first selection and cursor for small and large ticks", () => {
    let director;
    const selections = [];
    let hasUnresolvedDecision = false;
    for (let to = 60; to <= 600; to += 60) {
      const result = advanceDirectorWindow({ director, fromMinute: to - 60, toMinute: to, vesselId: "vessel-a", sectorId: "sector-a", risk: 30, context: { aliveCrewCount: 4, hasUnresolvedDecision }, snapshot: HEALTHY });
      director = result.director;
      if (result.selected) { selections.push(result.selected); hasUnresolvedDecision = true; }
    }
    const large = advanceDirectorWindow({ fromMinute: 0, toMinute: 600, vesselId: "vessel-a", sectorId: "sector-a", risk: 30, context: { aliveCrewCount: 4, hasUnresolvedDecision: false }, snapshot: HEALTHY });
    expect(selections).toEqual([large.selected]);
    expect(large.director).toEqual(director);
  });

  it("advances all 1000 pulses while producing at most one runtime candidate", () => {
    const result = advanceDirectorWindow({ fromMinute: 0, toMinute: 60000, vesselId: "vessel-a", sectorId: "sector-a", risk: 80, context: { aliveCrewCount: 4 }, snapshot: DAMAGED });
    expect(result.director.cursorMinute).toBe(60060);
    expect(result.selected).toBeTruthy();
    expect(result.director.sequence).toBe(1);
  });

  it("defers incident presentation behind every higher priority surface", () => {
    expect(canPresentIncident({})).toBe(true);
    ["combat", "navigation", "missionEncounter", "story", "incidentPresented"].forEach((key) => expect(canPresentIncident({ [key]: true })).toBe(false));
  });

  it("repairs malformed persisted director counters and cooldowns", () => {
    const director = normalizeDirector({ cursorMinute: NaN, sequence: "bad", tension: Infinity, pressure: NaN, quietUntil: Infinity, categoryUntil: { crew: 720, broken: NaN, endless: Infinity } }, 120);
    expect(director).toMatchObject({ cursorMinute: 120, sequence: 0, tension: 0, pressure: 0, quietUntil: 480, categoryUntil: { crew: 720 } });
    expect(Object.values(director).filter((value) => typeof value === "number").every(Number.isFinite)).toBe(true);
  });

  it("honors startup/aftermath quiet windows and records exact cooldowns", () => {
    const template = DIRECTOR_INCIDENTS.find((entry) => entry.id === "sensor-zero-drift");
    const quiet = advanceDirectorWindow({ director: { cursorMinute: 0, quietUntil: 600, tension: 100, pressure: 100 }, fromMinute: 0, toMinute: 540, vesselId: "v", sectorId: "s", risk: 0, context: { aliveCrewCount: 4 }, snapshot: HEALTHY, catalog: [template] });
    expect(quiet.selected).toBeNull();
    const selected = advanceDirectorWindow({ director: { cursorMinute: 600, quietUntil: 600, tension: 100, pressure: 100 }, fromMinute: 540, toMinute: 600, vesselId: "v", sectorId: "s", risk: 0, context: { aliveCrewCount: 4 }, snapshot: HEALTHY, catalog: [template] });
    expect(selected.selected?.templateId).toBe(template.id);
    expect(selected.director.quietUntil).toBe(600 + INCIDENT_DIRECTOR_RULES.quietAfterDaily);
    expect(selected.director.categoryUntil[template.category]).toBe(600 + INCIDENT_DIRECTOR_RULES.categoryCooldownDaily);
  });

  it("enforces template and category cooldowns independently", () => {
    const template = DIRECTOR_INCIDENTS.find((entry) => entry.id === "sensor-zero-drift");
    const base = { ...normalizeDirector({ quietUntil: 0 }, 0), tension: 100, pressure: 100 };
    expect(chooseIncidentTemplate({ director: { ...base, recent: [{ id: template.id, category: template.category, at: 0 }] }, pulseMinute: INCIDENT_DIRECTOR_RULES.templateCooldownDaily - 1, vesselId: "v", snapshot: HEALTHY, catalog: [template], context: { aliveCrewCount: 4 } })).toBeNull();
    expect(chooseIncidentTemplate({ director: { ...base, categoryUntil: { [template.category]: 1000 } }, pulseMinute: 999, vesselId: "v", snapshot: HEALTHY, catalog: [template], context: { aliveCrewCount: 4 } })).toBeNull();
    expect(chooseIncidentTemplate({ director: base, pulseMinute: 3000, vesselId: "v", snapshot: HEALTHY, catalog: [template], context: { aliveCrewCount: 4 } })?.id).toBe(template.id);
  });

  it("suppresses medium incidents during crises/another medium and respects the operational cap", () => {
    const medium = DIRECTOR_INCIDENTS.find((entry) => entry.id === "power-bus-instability");
    const daily = DIRECTOR_INCIDENTS.find((entry) => entry.id === "sensor-zero-drift");
    const director = { ...normalizeDirector({ quietUntil: 0 }, 0), tension: 100, pressure: 100 };
    expect(chooseIncidentTemplate({ director, pulseMinute: 600, vesselId: "v", snapshot: DAMAGED, catalog: [medium], context: { aliveCrewCount: 4, hasMedium: true } })).toBeNull();
    expect(chooseIncidentTemplate({ director, pulseMinute: 600, vesselId: "v", snapshot: DAMAGED, catalog: [medium], context: { aliveCrewCount: 4, hasActiveCrisis: true } })).toBeNull();
    expect(chooseIncidentTemplate({ director, pulseMinute: 600, vesselId: "v", snapshot: HEALTHY, catalog: [daily], context: { aliveCrewCount: 4, operationalActive: INCIDENT_DIRECTOR_RULES.maxActive } })).toBeNull();
  });

  it("hard-filters all eight templates from the external state snapshot", () => {
    const byId = Object.fromEntries(DIRECTOR_INCIDENTS.map((template) => [template.id, template]));
    expect(byId["coolant-joint-leak"].eligibility(HEALTHY)).toBe(false);
    expect(byId["coolant-joint-leak"].eligibility(DAMAGED)).toBe(true);
    expect(byId["sensor-zero-drift"].eligibility({ ...HEALTHY, traveling: false })).toBe(false);
    expect(byId["ration-ledger-mismatch"].eligibility(HEALTHY)).toBe(false);
    expect(byId["watch-sleep-debt"].eligibility(HEALTHY)).toBe(false);
    expect(byId["quiet-watch"].eligibility({ ...HEALTHY, minutesSinceIncident: 1500 })).toBe(true);
    expect(byId["air-scrubber-chain-clog"].eligibility(HEALTHY)).toBe(false);
    expect(byId["power-bus-instability"].eligibility(HEALTHY)).toBe(false);
    expect(byId["watch-team-clash"].eligibility(HEALTHY)).toBe(false);
    ["ration-ledger-mismatch", "watch-sleep-debt", "air-scrubber-chain-clog", "power-bus-instability", "watch-team-clash"].forEach((id) => expect(byId[id].eligibility(DAMAGED)).toBe(true));
  });

  it("keeps dominant instant rewards costly while every incident retains a safe no-requirement exit", () => {
    const byId = Object.fromEntries(DIRECTOR_INCIDENTS.map((template) => [template.id, template]));
    expect(byId["coolant-joint-leak"].options.find((option) => option.id === "sample")?.costs).toEqual([{ type: "item", itemId: "alloy-plate", qty: 1 }]);
    expect(byId["watch-sleep-debt"].options.find((option) => option.id === "recovery")?.job).toMatchObject({ roomId: "medbay", duration: 120 });
    expect(byId["watch-sleep-debt"].options.find((option) => option.id === "swap")?.effects.some((effect) => effect.type === "crewAll" && effect.fatigue > 0)).toBe(true);
    expect(byId["watch-team-clash"].options.find((option) => option.id === "mediate")?.job).toMatchObject({ roomId: "living", duration: 120 });
    DIRECTOR_INCIDENTS.forEach((template) => {
      expect(template.options.length).toBeGreaterThanOrEqual(3);
      expect(template.options.some((option) => !option.job
        && (option.costs ?? []).length === 0
        && !(option.effects ?? []).some((effect) => effect.type === "resources" && Object.values(effect.delta ?? {}).some((value) => value < 0)))).toBe(true);
    });
  });

  it("suppresses positive quiet-watch while a physical crisis is active", () => {
    const template = DIRECTOR_INCIDENTS.find((entry) => entry.id === "quiet-watch");
    const director = { ...normalizeDirector({ quietUntil: 0 }, 0), tension: 100, pressure: 100 };
    const crisis = { ...HEALTHY, traveling: false, avgFatigue: 35, hasActiveCrisis: true };
    expect(chooseIncidentTemplate({ director, pulseMinute: 2000, vesselId: "v", snapshot: crisis, catalog: [template], context: { aliveCrewCount: 4 } })).toBeNull();
  });

  it("keeps 72h incident volume in the tuned healthy/damaged bands across 20 seeds", () => {
    const simulate = (seed, snapshot, risk) => {
      let director;
      let count = 0;
      for (let to = 60; to <= 4320; to += 60) {
        const result = advanceDirectorWindow({ director, fromMinute: to - 60, toMinute: to, vesselId: `v-${seed}`, sectorId: `s-${seed}`, risk, context: { aliveCrewCount: 4 }, snapshot });
        director = result.director;
        if (result.selected) count += 1;
      }
      return count;
    };
    const counts = Array.from({ length: 20 }, (_, seed) => ({ healthy: simulate(seed, HEALTHY, 10), damaged: simulate(seed, DAMAGED, 70) }));
    const average = (key) => counts.reduce((sum, entry) => sum + entry[key], 0) / counts.length;
    expect(average("healthy")).toBeGreaterThanOrEqual(6);
    expect(average("healthy")).toBeLessThanOrEqual(8);
    expect(average("damaged")).toBeGreaterThanOrEqual(8);
    expect(average("damaged")).toBeLessThanOrEqual(10);
    counts.forEach(({ healthy, damaged }) => expect(damaged).toBeGreaterThanOrEqual(healthy));
  });
});
