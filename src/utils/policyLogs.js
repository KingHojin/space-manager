// Phase 19-E: pure helper for the policy settings UI. gameStore.logs is a
// single flat feed (newest entry at index 0 — see gameStore.js's addLog,
// `[message, ...state.logs]`) shared by every system, so the policy panel
// needs to pick out just the policy-authored entries. policyEngine.js
// prefixes every log line it produces with the literal string "정책:" (see
// e.g. "정책: 자동 수리 대기 — ..."), so that prefix is the only signal this
// function needs — it does not know or care about policy ids/kinds.
export function filterPolicyLogs(logs = [], limit = 8) {
  if (!Array.isArray(logs)) return [];
  return logs.filter((log) => typeof log === "string" && log.startsWith("정책:")).slice(0, Math.max(0, limit));
}
