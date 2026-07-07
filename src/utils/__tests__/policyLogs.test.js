import { describe, expect, it } from "vitest";
import { filterPolicyLogs } from "../policyLogs";

describe("filterPolicyLogs", () => {
  it("keeps only logs prefixed with 정책:, preserving newest-first order", () => {
    const logs = [
      "정책: 자동 정비 예약 — 선체 30% (임계값 40% 미만).",
      "승무원 김철수가 휴식을 취했습니다.",
      "정책: 연료 예비율 경고 — 연료 20%.",
      "새 항해 기록이 생성되었습니다.",
    ];
    expect(filterPolicyLogs(logs)).toEqual([
      "정책: 자동 정비 예약 — 선체 30% (임계값 40% 미만).",
      "정책: 연료 예비율 경고 — 연료 20%.",
    ]);
  });

  it("respects the limit", () => {
    const logs = Array.from({ length: 5 }, (_, i) => `정책: 로그 ${i}`);
    expect(filterPolicyLogs(logs, 2)).toEqual(["정책: 로그 0", "정책: 로그 1"]);
  });

  it("returns an empty array for non-array or empty input", () => {
    expect(filterPolicyLogs(undefined)).toEqual([]);
    expect(filterPolicyLogs([])).toEqual([]);
    expect(filterPolicyLogs(null)).toEqual([]);
  });

  it("ignores logs that merely contain the marker mid-string, not as a prefix", () => {
    expect(filterPolicyLogs(["이건 정책: 관련 아님 (접두사 아님)"])).toEqual([]);
  });
});
