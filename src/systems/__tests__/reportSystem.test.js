import { describe, expect, it } from "vitest";
import { buildCombatReport, buildCrisisReport, buildNavigationReport, buildPolicyReport, buildReport, buildWorkReport } from "../reportSystem";
import { FALLBACK_REPORT_CATEGORY, REPORT_CATEGORIES, REPORT_PRIORITIES } from "../../data/reports";

describe("buildReport", () => {
  it("builds a normalized report from valid structured input", () => {
    const report = buildReport({
      category: "combat",
      title: "해적 조우 승리",
      body: "함체 손상 12%, 전리품 확보.",
      priority: "high",
      currentMinute: 4320,
      meta: { encounterId: "abc" },
    });
    expect(report).toEqual({
      category: "combat",
      priority: "high",
      title: "해적 조우 승리",
      body: "함체 손상 12%, 전리품 확보.",
      createdAtMinute: 4320,
      meta: { encounterId: "abc" },
    });
  });

  it("never assigns id/read/acknowledged — that is reportStore.addReport's job", () => {
    const report = buildReport({ category: "work", title: "훈련 완료", body: "", currentMinute: 0 });
    expect(report.id).toBeUndefined();
    expect(report.read).toBeUndefined();
    expect(report.acknowledged).toBeUndefined();
  });

  it("falls back to FALLBACK_REPORT_CATEGORY for an unknown category id instead of throwing", () => {
    const report = buildReport({ category: "not-a-real-category", title: "?", body: "", currentMinute: 10 });
    expect(report.category).toBe(FALLBACK_REPORT_CATEGORY.id);
    expect(report.priority).toBe(FALLBACK_REPORT_CATEGORY.defaultPriority);
  });

  it("falls back to FALLBACK_REPORT_CATEGORY for a missing category", () => {
    const report = buildReport({ title: "제목", body: "본문", currentMinute: 0 });
    expect(report.category).toBe(FALLBACK_REPORT_CATEGORY.id);
  });

  it("applies the category's defaultPriority when priority is omitted", () => {
    REPORT_CATEGORIES.forEach((category) => {
      const report = buildReport({ category: category.id, title: "t", body: "b", currentMinute: 0 });
      expect(report.priority).toBe(category.defaultPriority);
    });
  });

  it("replaces an invalid priority value with the category default instead of trusting the caller", () => {
    const report = buildReport({ category: "crisis", priority: "super-urgent", title: "t", body: "b", currentMinute: 0 });
    expect(report.priority).toBe("critical");
  });

  it("accepts every value in REPORT_PRIORITIES verbatim", () => {
    REPORT_PRIORITIES.forEach((priority) => {
      const report = buildReport({ category: "navigation", priority, title: "t", body: "b", currentMinute: 0 });
      expect(report.priority).toBe(priority);
    });
  });

  it("falls back to the category label when title is missing or not a string", () => {
    const missing = buildReport({ category: "economy", body: "b", currentMinute: 0 });
    expect(missing.title).toBe("계약 · 거래");
    const wrongType = buildReport({ category: "economy", title: 42, body: "b", currentMinute: 0 });
    expect(wrongType.title).toBe("계약 · 거래");
  });

  it("coerces a missing/non-string body to an empty string", () => {
    const missing = buildReport({ category: "work", title: "t", currentMinute: 0 });
    expect(missing.body).toBe("");
    const wrongType = buildReport({ category: "work", title: "t", body: 12, currentMinute: 0 });
    expect(wrongType.body).toBe("");
  });

  it("coerces a missing/invalid currentMinute to 0", () => {
    expect(buildReport({ category: "work", title: "t", body: "b" }).createdAtMinute).toBe(0);
    expect(buildReport({ category: "work", title: "t", body: "b", currentMinute: Number.NaN }).createdAtMinute).toBe(0);
    expect(buildReport({ category: "work", title: "t", body: "b", currentMinute: "120" }).createdAtMinute).toBe(0);
  });

  it("defaults meta to null when omitted or not an object", () => {
    expect(buildReport({ category: "work", title: "t", body: "b", currentMinute: 0 }).meta).toBeNull();
    expect(buildReport({ category: "work", title: "t", body: "b", currentMinute: 0, meta: "nope" }).meta).toBeNull();
  });

  it("never throws on completely empty input", () => {
    expect(() => buildReport()).not.toThrow();
    expect(() => buildReport({})).not.toThrow();
  });
});

// Domain builder contracts (20-B pins these against real gameClock callers —
// this PR only fixes the signature/shape so 20-B doesn't need to redesign
// them). Not wired to gameClock in this PR.
describe("buildPolicyReport contract", () => {
  it("produces a 'policy' category report with policyId threaded into meta, not the title/body", () => {
    const report = buildPolicyReport({ policyId: "auto-hull-repair", summary: "선체 수리 예약됨.", currentMinute: 100 });
    expect(report.category).toBe("policy");
    expect(report.body).toBe("선체 수리 예약됨.");
    expect(report.meta).toEqual({ policyId: "auto-hull-repair" });
    expect(report.createdAtMinute).toBe(100);
  });

  it("accepts an explicit priority override", () => {
    const report = buildPolicyReport({ policyId: "fuel-reserve", summary: "s", currentMinute: 0, priority: "high" });
    expect(report.priority).toBe("high");
  });

  it("defaults meta.policyId to null when policyId is omitted", () => {
    const report = buildPolicyReport({ summary: "s", currentMinute: 0 });
    expect(report.meta).toEqual({ policyId: null });
  });
});

describe("buildCombatReport contract", () => {
  it("produces a 'combat' category report with outcome threaded into meta", () => {
    const report = buildCombatReport({ title: "해적 격퇴", summary: "적함 파괴, 부품 회수.", outcome: "victory", currentMinute: 500 });
    expect(report.category).toBe("combat");
    expect(report.title).toBe("해적 격퇴");
    expect(report.meta).toEqual({ outcome: "victory" });
    expect(report.createdAtMinute).toBe(500);
  });

  it("defaults meta.outcome to null when outcome is omitted", () => {
    const report = buildCombatReport({ title: "t", summary: "s", currentMinute: 0 });
    expect(report.meta).toEqual({ outcome: null });
  });
});

// Phase 20-B domain builder contracts — pinned against the real gameClock.js
// (crisis/work) and Combat.jsx/Exploration.jsx (combat/navigation) callers
// wired in this PR.
describe("buildCrisisReport contract", () => {
  it("produces a 'crisis' category report with crisisKind threaded into meta", () => {
    const report = buildCrisisReport({ title: "함내 위기 발생", summary: "화재 발생 — 기관실.", crisisKind: "spawned", currentMinute: 200, priority: "critical" });
    expect(report.category).toBe("crisis");
    expect(report.title).toBe("함내 위기 발생");
    expect(report.priority).toBe("critical");
    expect(report.meta).toEqual({ crisisKind: "spawned" });
    expect(report.createdAtMinute).toBe(200);
  });

  it("defaults meta.crisisKind to null when omitted", () => {
    const report = buildCrisisReport({ title: "t", summary: "s", currentMinute: 0 });
    expect(report.meta).toEqual({ crisisKind: null });
  });

  it("falls back to the category default priority ('critical') when priority is omitted", () => {
    const report = buildCrisisReport({ title: "t", summary: "s", currentMinute: 0 });
    expect(report.priority).toBe("critical");
  });
});

describe("buildWorkReport contract", () => {
  it("produces a 'work' category report with jobType threaded into meta", () => {
    const report = buildWorkReport({ title: "훈련 완료", summary: "포수 김 사격 +1 훈련 완료.", jobType: "training", currentMinute: 300 });
    expect(report.category).toBe("work");
    expect(report.meta).toEqual({ jobType: "training" });
    expect(report.createdAtMinute).toBe(300);
  });

  it("defaults meta.jobType to null when omitted", () => {
    const report = buildWorkReport({ title: "t", summary: "s", currentMinute: 0 });
    expect(report.meta).toEqual({ jobType: null });
  });

  it("falls back to the category default priority ('info') when priority is omitted", () => {
    const report = buildWorkReport({ title: "t", summary: "s", currentMinute: 0 });
    expect(report.priority).toBe("info");
  });
});

describe("buildNavigationReport contract", () => {
  it("produces a 'navigation' category report with navKind threaded into meta", () => {
    const report = buildNavigationReport({ title: "임무 완료", summary: "정찰 임무 완료. 보상: ₢200.", navKind: "missionComplete", currentMinute: 400, priority: "medium" });
    expect(report.category).toBe("navigation");
    expect(report.meta).toEqual({ navKind: "missionComplete" });
    expect(report.priority).toBe("medium");
    expect(report.createdAtMinute).toBe(400);
  });

  it("defaults meta.navKind to null when omitted", () => {
    const report = buildNavigationReport({ title: "t", summary: "s", currentMinute: 0 });
    expect(report.meta).toEqual({ navKind: null });
  });
});
