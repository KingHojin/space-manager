// Phase 20-A: report category catalog (pure data, no store/system imports).
//
// A "report" is a captain-facing digest entry — "what happened while you
// weren't watching," grouped by category, distinct from the flat
// gameStore.logs feed. This file only defines WHAT categories exist and
// their label/icon/default priority — it does not decide when a report is
// created. That is systems/reportSystem.js's job (pure builder), and
// stores/reportStore.js only ever holds the resulting report objects. Same
// three-way split as data/policies.js + stores/policyStore.js +
// systems/policyEngine.js (see docs/PHASE_19_POLICY_SYSTEM.md) and
// ROOM_JOB_CATALOG/CRISIS_CATALOG before it.
//
// --- priority vocabulary: reused, not reinvented ---
// `defaultPriority` below (and every report's `priority` field produced by
// systems/reportSystem.js) uses systems/commandCenter.js's card-priority
// vocabulary verbatim: "critical" | "high" | "medium" | "low" | "info". That
// module's Phase 18-E boundary comment already draws the line between this
// vocabulary and systems/priorities.js's *activity*-priority vocabulary
// ("emergency"/"high"/"normal"/"low") — reports are a UI/situation concept
// (like a command-center card), not a crew activity, so they belong on the
// card-priority side of that boundary. This file does not import
// commandCenter.js (data files stay dependency-free, matching
// data/policies.js's own note on this), so the mapping is documented here
// instead: whichever code renders a report's priority (20-C) should reuse
// commandCenter.js's PRIORITY_LABEL/PRIORITY_TONE tables rather than
// re-deriving new ones, to keep a single "critical"/"high"/etc. → label/tone
// mapping across command-center cards AND reports.

export const REPORT_PRIORITIES = ["critical", "high", "medium", "low", "info"];

export const REPORT_CATEGORIES = [
  {
    id: "policy",
    label: "정책 자동 집행",
    icon: "🛡️",
    defaultPriority: "info",
  },
  {
    id: "combat",
    label: "전투 결과",
    icon: "☠️",
    defaultPriority: "high",
  },
  {
    id: "navigation",
    label: "항해 · 조우",
    icon: "🧭",
    defaultPriority: "medium",
  },
  {
    id: "crisis",
    label: "함내 위기",
    icon: "🚨",
    defaultPriority: "critical",
  },
  {
    id: "work",
    label: "작업 완료",
    icon: "🔧",
    defaultPriority: "info",
  },
  {
    id: "economy",
    label: "계약 · 거래",
    icon: "💰",
    defaultPriority: "medium",
  },
  { id: "incident", label: "항해 사건", icon: "⚠️", defaultPriority: "medium" },
];

// Fallback used by systems/reportSystem.js when a report is built with an
// unknown/missing category id — keeps buildReport total (never throws on bad
// input) while still being visually distinct enough that a stray unknown
// category is easy to spot during 20-B integration.
export const FALLBACK_REPORT_CATEGORY = {
  id: "general",
  label: "일반",
  icon: "📋",
  defaultPriority: "info",
};

export function getReportCategory(categoryId) {
  return REPORT_CATEGORIES.find((category) => category.id === categoryId) ?? null;
}
