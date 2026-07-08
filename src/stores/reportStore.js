import { create } from "zustand";
import { persist } from "zustand/middleware";
import { FALLBACK_REPORT_CATEGORY, getReportCategory, REPORT_PRIORITIES } from "../data/reports";
import { passthroughMigrate, PERSIST_VERSION } from "./persistVersion";

// Phase 20-A: reportStore holds ONLY the report inbox — a flat, newest-first
// `reports` array. It has no store-to-store imports (architecture rule) and
// no report-authoring logic of its own: deciding WHEN/WHY a report gets
// created lives in the pure systems/reportSystem.js (buildReport and the
// domain builders on top of it); this store only ever accepts an
// already-built report object via addReport() and manages its lifecycle
// (read/acknowledged/retention). This mirrors policyStore.js holding only
// { enabled, params } while systems/policyEngine.js owns the "what should
// fire" logic.
//
// IMPORTANT — this store is additive, not a replacement. gameStore.logs and
// gameStore.addLog are completely untouched by this phase and keep working
// exactly as before; reports are a parallel, higher-level layer for
// "what happened while you weren't watching," not a migration off the flat
// log feed. See docs/PHASE_20_REPORT_SYSTEM.md.
//
// --- retention policy (revisited in Phase 20-D) ---
// MAX_REPORTS caps the array at 120 entries, oldest dropped first — same
// shape gameStore.addLog already uses for `logs` at a cap of 80. Phase 20-A
// shipped this as a plain `.slice(0, MAX_REPORTS)` with no priority
// awareness, explicitly calling that out as acceptable for a foundation PR
// that didn't generate any reports yet.
//
// 20-D revisited this now that real generators exist (20-B/20-C): measured
// volume in the 20-B PR's own 60-tick heavy-pressure scenario was 8 reports
// (4 policy / 4 work) — hitting the 120 cap under sustained multi-category
// pressure like that would take roughly 900 ticks (60 * 120/8), i.e. many
// hours of continuous, unattended real-time play with every policy firing
// repeatedly. That is a legitimate, if rare, long-session scenario, and a
// dropped report in this system is not merely cosmetic the way an evicted
// log line is: `crisis` reports default to `critical` priority and exist
// specifically to flag a live, unresolved emergency the player has NOT yet
// acknowledged (see `docs/PHASE_20_REPORT_SYSTEM.md`'s crisis-report
// rationale) — silently losing one is a real information-loss bug, not an
// aesthetic one, so this got a minimal, targeted fix rather than "document
// and move on":
//
// capReports() below still drops oldest-first up to MAX_REPORTS, but any
// unacknowledged `critical`-priority report that would otherwise be dropped
// is preserved past the cap instead, up to a hard ceiling of
// MAX_REPORTS_WITH_PRESERVED_CRITICAL (140) total — so a determined player
// who never opens the inbox still can't grow the array unboundedly (an
// unbounded critical carve-out would just move the "silently unbounded
// growth" problem from "any report" to "critical reports", not eliminate
// it). Once a preserved critical report is acknowledged, it becomes a normal
// old entry again and ages out on the next cap pass like everything else.
// This is intentionally NOT full priority-aware retention (e.g. reordering
// by priority, or protecting `high` too) — see this PR's report for why a
// broader scheme would be over-engineering for what is still a rare edge
// case; only the one case with real information-loss consequences
// (unacknowledged critical) gets special handling.
const MAX_REPORTS = 120;
const MAX_REPORTS_WITH_PRESERVED_CRITICAL = 140;

// Applies the retention policy described above to a newest-first `reports`
// array. Used by both addReport() and the persist `merge` (mergeReports())
// so the two call sites can't drift — a persisted save that somehow exceeds
// the cap (e.g. a hand-edited save, or a future lower cap) gets exactly the
// same preserved-critical treatment a live addReport() overflow would.
function capReports(reports) {
  if (reports.length <= MAX_REPORTS) return reports;
  const kept = reports.slice(0, MAX_REPORTS);
  const overflow = reports.slice(MAX_REPORTS);
  const preservedCritical = overflow.filter((entry) => entry.priority === "critical" && !entry.acknowledged);
  if (preservedCritical.length === 0) return kept;
  const budget = MAX_REPORTS_WITH_PRESERVED_CRITICAL - kept.length;
  return budget > 0 ? [...kept, ...preservedCritical.slice(0, budget)] : kept;
}

let idCounter = 0;
function createReportId() {
  idCounter += 1;
  return globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `report-${Date.now()}-${idCounter}`;
}

// Normalizes any report-shaped object (either systems/reportSystem.js's
// buildReport() output, a hand-built object passed straight to addReport(),
// or a persisted entry loaded from localStorage) into the store's canonical
// shape. Never throws — an invalid/missing field falls back to a safe
// default, the same defensive posture policyStore.js's mergePolicies takes
// toward a possibly-stale/corrupt save.
//
// `forceUnseen`: addReport() always passes true (a newly-added report is
// always unread/unacknowledged, even if the caller's object happened to
// carry `read`/`acknowledged` fields — e.g. a re-added report should not
// silently inherit a previous session's seen state). Persist-merge passes
// false so a reload preserves the player's actual read/acknowledged
// progress on old reports.
function normalizeReport(entry, { forceUnseen = false } = {}) {
  if (!entry || typeof entry !== "object") return null;
  const definition = getReportCategory(entry.category) ?? FALLBACK_REPORT_CATEGORY;
  const priority = REPORT_PRIORITIES.includes(entry.priority) ? entry.priority : definition.defaultPriority;
  const id = typeof entry.id === "string" && entry.id.length > 0 ? entry.id : createReportId();
  return {
    id,
    category: definition.id,
    priority,
    title: typeof entry.title === "string" && entry.title.length > 0 ? entry.title : definition.label,
    body: typeof entry.body === "string" ? entry.body : "",
    createdAtMinute: typeof entry.createdAtMinute === "number" && Number.isFinite(entry.createdAtMinute) ? entry.createdAtMinute : 0,
    read: forceUnseen ? false : typeof entry.read === "boolean" ? entry.read : false,
    acknowledged: forceUnseen ? false : typeof entry.acknowledged === "boolean" ? entry.acknowledged : false,
    meta: entry.meta && typeof entry.meta === "object" ? entry.meta : null,
  };
}

// Walks a persisted `reports` array defensively: drops anything that isn't a
// plain object, normalizes every surviving entry's fields, and re-applies
// the MAX_REPORTS cap (in case a future change lowers the cap, or a
// hand-edited save has more than the current limit).
function mergeReports(savedReports) {
  if (!Array.isArray(savedReports)) return [];
  return capReports(savedReports.map((entry) => normalizeReport(entry)).filter((entry) => entry !== null));
}

export const useReportStore = create(
  persist(
    (set) => ({
      reports: [],

      // addReport(report): report is normally systems/reportSystem.js's
      // buildReport() (or a domain builder built on top of it) output —
      // { category, priority, title, body, createdAtMinute, meta } — but any
      // report-shaped object is accepted defensively. `id` is auto-generated
      // if the caller doesn't supply one. Newest report is always unshifted
      // to the front (index 0), matching gameStore.logs's newest-first
      // ordering, then the array is capped at MAX_REPORTS.
      addReport: (report = {}) =>
        set((state) => ({
          reports: capReports([normalizeReport(report, { forceUnseen: true }), ...state.reports]),
        })),

      markRead: (id) =>
        set((state) => {
          const index = state.reports.findIndex((entry) => entry.id === id);
          if (index === -1 || state.reports[index].read) return state;
          const next = [...state.reports];
          next[index] = { ...next[index], read: true };
          return { reports: next };
        }),

      markAllRead: () =>
        set((state) => {
          if (state.reports.every((entry) => entry.read)) return state;
          return { reports: state.reports.map((entry) => (entry.read ? entry : { ...entry, read: true })) };
        }),

      // Acknowledging implies having read the report (mirrors a captain
      // signing off on something they've already opened) — acknowledge()
      // sets both `acknowledged` and `read` to true in one step, so a caller
      // never has to remember to markRead() first.
      acknowledge: (id) =>
        set((state) => {
          const index = state.reports.findIndex((entry) => entry.id === id);
          if (index === -1) return state;
          const current = state.reports[index];
          if (current.acknowledged && current.read) return state;
          const next = [...state.reports];
          next[index] = { ...current, acknowledged: true, read: true };
          return { reports: next };
        }),

      clearAcknowledged: () =>
        set((state) => {
          const next = state.reports.filter((entry) => !entry.acknowledged);
          if (next.length === state.reports.length) return state;
          return { reports: next };
        }),
    }),
    {
      name: "space-manager-reports",
      version: PERSIST_VERSION,
      migrate: passthroughMigrate,
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...(persistedState ?? {}),
        reports: mergeReports(persistedState?.reports),
      }),
    },
  ),
);

// --- derived selectors ---
// Phase 20-C (UI) is expected to read `reports` out of useReportStore with a
// plain field selector (`useReportStore((state) => state.reports)`) and pass
// the result into these plain functions, rather than defining new store
// actions for every derived value. Two render-stability notes for that
// future call site:
//   - getUnreadCount / getUnacknowledgedCount return a primitive number, so
//     calling them straight inside a component body (or even inline in a
//     store selector) is safe — no new-array-identity-per-render issue.
//   - getReportsByCategory returns a NEW array every call (Array#filter). Do
//     NOT call it directly inside a zustand selector — that recreates the
//     array every render and defeats zustand's reference-equality check
//     (the same footgun documented for any derived-array selector). Wrap it
//     in useMemo keyed on `reports` (and the category id) at the call site
//     instead.
export function getUnreadCount(reports) {
  return (reports ?? []).reduce((count, entry) => count + (entry.read ? 0 : 1), 0);
}

export function getUnacknowledgedCount(reports) {
  return (reports ?? []).reduce((count, entry) => count + (entry.acknowledged ? 0 : 1), 0);
}

export function getReportsByCategory(reports, categoryId) {
  return (reports ?? []).filter((entry) => entry.category === categoryId);
}
