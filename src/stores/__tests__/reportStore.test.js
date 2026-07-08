import { describe, expect, it } from "vitest";
import { getReportsByCategory, getUnacknowledgedCount, getUnreadCount, useReportStore } from "../reportStore";
import { PERSIST_VERSION } from "../persistVersion";
import { buildReport } from "../../systems/reportSystem";

function resetReportStore() {
  useReportStore.setState({ reports: [] });
}

describe("reportStore initial state", () => {
  it("starts with an empty reports array", () => {
    resetReportStore();
    expect(useReportStore.getState().reports).toEqual([]);
  });
});

describe("addReport", () => {
  it("adds a report built via reportSystem.buildReport, newest first", () => {
    resetReportStore();
    const first = buildReport({ category: "work", title: "훈련 완료", body: "승무원 A 사격 훈련 완료.", currentMinute: 10 });
    const second = buildReport({ category: "combat", title: "조우 발생", body: "해적선 접근.", currentMinute: 25 });
    useReportStore.getState().addReport(first);
    useReportStore.getState().addReport(second);

    const { reports } = useReportStore.getState();
    expect(reports).toHaveLength(2);
    expect(reports[0].title).toBe("조우 발생"); // newest first
    expect(reports[1].title).toBe("훈련 완료");
  });

  it("auto-generates a unique id when the report has none", () => {
    resetReportStore();
    useReportStore.getState().addReport(buildReport({ category: "work", title: "a", body: "", currentMinute: 0 }));
    useReportStore.getState().addReport(buildReport({ category: "work", title: "b", body: "", currentMinute: 0 }));
    const { reports } = useReportStore.getState();
    expect(typeof reports[0].id).toBe("string");
    expect(reports[0].id.length).toBeGreaterThan(0);
    expect(reports[0].id).not.toBe(reports[1].id);
  });

  it("always starts a new report as unread and unacknowledged, even if the input object claims otherwise", () => {
    resetReportStore();
    useReportStore.getState().addReport({ category: "work", title: "t", body: "b", currentMinute: 0, read: true, acknowledged: true });
    const [report] = useReportStore.getState().reports;
    expect(report.read).toBe(false);
    expect(report.acknowledged).toBe(false);
  });

  it("normalizes an unknown category and out-of-range priority instead of throwing", () => {
    resetReportStore();
    expect(() => useReportStore.getState().addReport({ category: "bogus", priority: "extreme", title: "t", body: "b" })).not.toThrow();
    const [report] = useReportStore.getState().reports;
    expect(report.category).toBe("general");
    expect(report.priority).toBe("info");
  });

  it("caps the reports array at 120 entries, dropping the oldest first", () => {
    resetReportStore();
    for (let i = 0; i < 130; i += 1) {
      useReportStore.getState().addReport(buildReport({ category: "work", title: `report-${i}`, body: "", currentMinute: i }));
    }
    const { reports } = useReportStore.getState();
    expect(reports).toHaveLength(120);
    // Newest (report-129) is first, oldest surviving is report-10 (0..9 dropped).
    expect(reports[0].title).toBe("report-129");
    expect(reports[reports.length - 1].title).toBe("report-10");
  });
});

describe("markRead / markAllRead", () => {
  it("marks a single report read by id and leaves others untouched", () => {
    resetReportStore();
    useReportStore.getState().addReport(buildReport({ category: "work", title: "a", body: "", currentMinute: 0 }));
    useReportStore.getState().addReport(buildReport({ category: "work", title: "b", body: "", currentMinute: 0 }));
    const targetId = useReportStore.getState().reports[1].id; // "a", the older one
    useReportStore.getState().markRead(targetId);
    const { reports } = useReportStore.getState();
    expect(reports.find((entry) => entry.id === targetId).read).toBe(true);
    expect(reports.find((entry) => entry.title === "b").read).toBe(false);
  });

  it("is a no-op (same state reference) for an unknown id", () => {
    resetReportStore();
    useReportStore.getState().addReport(buildReport({ category: "work", title: "a", body: "", currentMinute: 0 }));
    const before = useReportStore.getState().reports;
    useReportStore.getState().markRead("not-a-real-id");
    expect(useReportStore.getState().reports).toBe(before);
  });

  it("markAllRead marks every report read in one call", () => {
    resetReportStore();
    useReportStore.getState().addReport(buildReport({ category: "work", title: "a", body: "", currentMinute: 0 }));
    useReportStore.getState().addReport(buildReport({ category: "work", title: "b", body: "", currentMinute: 0 }));
    useReportStore.getState().markAllRead();
    expect(useReportStore.getState().reports.every((entry) => entry.read)).toBe(true);
  });

  it("markAllRead is a no-op (same state reference) when everything is already read", () => {
    resetReportStore();
    useReportStore.getState().addReport(buildReport({ category: "work", title: "a", body: "", currentMinute: 0 }));
    useReportStore.getState().markAllRead();
    const before = useReportStore.getState().reports;
    useReportStore.getState().markAllRead();
    expect(useReportStore.getState().reports).toBe(before);
  });
});

describe("acknowledge / clearAcknowledged", () => {
  it("acknowledge marks a report both acknowledged and read", () => {
    resetReportStore();
    useReportStore.getState().addReport(buildReport({ category: "crisis", title: "a", body: "", currentMinute: 0 }));
    const id = useReportStore.getState().reports[0].id;
    useReportStore.getState().acknowledge(id);
    const report = useReportStore.getState().reports.find((entry) => entry.id === id);
    expect(report.acknowledged).toBe(true);
    expect(report.read).toBe(true);
  });

  it("acknowledge is a no-op for an unknown id", () => {
    resetReportStore();
    useReportStore.getState().addReport(buildReport({ category: "crisis", title: "a", body: "", currentMinute: 0 }));
    const before = useReportStore.getState().reports;
    useReportStore.getState().acknowledge("not-a-real-id");
    expect(useReportStore.getState().reports).toBe(before);
  });

  it("clearAcknowledged removes only acknowledged reports", () => {
    resetReportStore();
    useReportStore.getState().addReport(buildReport({ category: "work", title: "keep", body: "", currentMinute: 0 }));
    useReportStore.getState().addReport(buildReport({ category: "work", title: "drop", body: "", currentMinute: 0 }));
    const dropId = useReportStore.getState().reports.find((entry) => entry.title === "drop").id;
    useReportStore.getState().acknowledge(dropId);
    useReportStore.getState().clearAcknowledged();
    const { reports } = useReportStore.getState();
    expect(reports).toHaveLength(1);
    expect(reports[0].title).toBe("keep");
  });

  it("clearAcknowledged is a no-op (same state reference) when nothing is acknowledged", () => {
    resetReportStore();
    useReportStore.getState().addReport(buildReport({ category: "work", title: "a", body: "", currentMinute: 0 }));
    const before = useReportStore.getState().reports;
    useReportStore.getState().clearAcknowledged();
    expect(useReportStore.getState().reports).toBe(before);
  });
});

describe("derived selectors (getUnreadCount / getUnacknowledgedCount / getReportsByCategory)", () => {
  it("getUnreadCount counts only unread reports", () => {
    resetReportStore();
    useReportStore.getState().addReport(buildReport({ category: "work", title: "a", body: "", currentMinute: 0 }));
    useReportStore.getState().addReport(buildReport({ category: "work", title: "b", body: "", currentMinute: 0 }));
    expect(getUnreadCount(useReportStore.getState().reports)).toBe(2);
    useReportStore.getState().markRead(useReportStore.getState().reports[0].id);
    expect(getUnreadCount(useReportStore.getState().reports)).toBe(1);
  });

  it("getUnacknowledgedCount counts only unacknowledged reports", () => {
    resetReportStore();
    useReportStore.getState().addReport(buildReport({ category: "work", title: "a", body: "", currentMinute: 0 }));
    expect(getUnacknowledgedCount(useReportStore.getState().reports)).toBe(1);
    useReportStore.getState().acknowledge(useReportStore.getState().reports[0].id);
    expect(getUnacknowledgedCount(useReportStore.getState().reports)).toBe(0);
  });

  it("getReportsByCategory filters by category id", () => {
    resetReportStore();
    useReportStore.getState().addReport(buildReport({ category: "work", title: "a", body: "", currentMinute: 0 }));
    useReportStore.getState().addReport(buildReport({ category: "combat", title: "b", body: "", currentMinute: 0 }));
    const combatOnly = getReportsByCategory(useReportStore.getState().reports, "combat");
    expect(combatOnly).toHaveLength(1);
    expect(combatOnly[0].title).toBe("b");
  });

  it("both counters return 0 for an empty/undefined reports array without throwing", () => {
    expect(getUnreadCount([])).toBe(0);
    expect(getUnreadCount(undefined)).toBe(0);
    expect(getUnacknowledgedCount([])).toBe(0);
    expect(getReportsByCategory(undefined, "work")).toEqual([]);
  });
});

describe("reportStore persist (Phase 20-A, following the persistVersion.js pattern)", () => {
  function mergeWith(persistedState) {
    return useReportStore.persist.getOptions().merge(persistedState, useReportStore.getState());
  }

  it("declares the same PERSIST_VERSION / passthroughMigrate pattern as every other persisted store", () => {
    expect(useReportStore.persist.getOptions().version).toBe(PERSIST_VERSION);
  });

  it("falls back to an empty array when there is no persisted state at all", () => {
    expect(mergeWith(undefined).reports).toEqual([]);
  });

  it("falls back to an empty array when persistedState.reports is missing or not an array", () => {
    expect(mergeWith({}).reports).toEqual([]);
    expect(mergeWith({ reports: "not-an-array" }).reports).toEqual([]);
    expect(mergeWith({ reports: null }).reports).toEqual([]);
  });

  it("preserves a valid saved report's read/acknowledged status (old-save compatibility)", () => {
    const saved = {
      reports: [
        { id: "r1", category: "combat", priority: "high", title: "t", body: "b", createdAtMinute: 50, read: true, acknowledged: false, meta: null },
      ],
    };
    const merged = mergeWith(saved);
    expect(merged.reports).toEqual(saved.reports);
  });

  it("drops non-object entries and normalizes malformed fields in a saved report", () => {
    const saved = {
      reports: [
        null,
        "not-an-object",
        { id: 123, category: "unknown-category", priority: "extreme", title: 5, body: null, createdAtMinute: "oops", read: "yes", acknowledged: 1 },
      ],
    };
    const merged = mergeWith(saved);
    expect(merged.reports).toHaveLength(1);
    const [entry] = merged.reports;
    expect(typeof entry.id).toBe("string");
    expect(entry.category).toBe("general");
    expect(entry.priority).toBe("info");
    expect(entry.title).toBe("일반");
    expect(entry.body).toBe("");
    expect(entry.createdAtMinute).toBe(0);
    expect(entry.read).toBe(false);
    expect(entry.acknowledged).toBe(false);
  });

  it("re-applies the MAX_REPORTS(120) cap when a save somehow exceeds it", () => {
    const saved = {
      reports: Array.from({ length: 150 }, (_, index) => ({
        id: `saved-${index}`,
        category: "work",
        priority: "info",
        title: `t${index}`,
        body: "",
        createdAtMinute: index,
        read: false,
        acknowledged: false,
        meta: null,
      })),
    };
    const merged = mergeWith(saved);
    expect(merged.reports).toHaveLength(120);
  });
});
