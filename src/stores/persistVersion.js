// Phase 18-E: shared persist-version helpers for zustand `persist` stores.
//
// This module is a plain, side-effect-free utility (no zustand `create`, no
// store state) — importing it from any store file does NOT violate the
// "no store-to-store imports" architecture rule. It exists purely so the
// ~13 persisted stores don't each hand-roll the same version/migrate
// boilerplate.
//
// --- Two different "version" concepts in this codebase — do not confuse them ---
// 1. This file's PERSIST_VERSION is the zustand `persist` **per-store schema
//    version** (see the `version`/`migrate` options below). It versions the
//    shape of a single store's own persisted slice (e.g. "space-manager-crew"
//    in localStorage).
// 2. SaveLoadModal.jsx's export payload `version: 4` is a completely separate
//    concept: the **export "key bundle" format version** — i.e. which set of
//    localStorage keys get bundled together and how the bundle JSON itself is
//    shaped when the user exports/imports a save file. Bumping one does NOT
//    imply bumping the other. See the comment in SaveLoadModal.jsx for details.
//
// --- zustand v5 persist execution order (verified against
//     node_modules/zustand/esm/middleware.mjs, persistImpl/hydrate) ---
// On hydrate, zustand reads `{ state, version }` from storage and compares
// `version` to the store's configured `options.version` (which defaults to 0
// when not set). If they differ, it calls `options.migrate(state, version)`
// and takes ITS return value as the new `state`; if they already match, the
// raw persisted `state` is used unchanged (migrate is skipped entirely).
// Either way, the result is then passed as `persistedState` into
// `options.merge(persistedState, currentState)` — merge always runs, and it
// always runs AFTER migrate, never before. (See middleware.mjs: `[migrated,
// migratedState] = migrationResult; stateFromStorage = options.merge(
// migratedState, currentState)`.)
//
// Practical upshot for save compatibility: zustand's persist middleware
// itself always writes `{ state, version: options.version }` to storage —
// even before this phase, when no store specified a `version` option, that
// option defaulted to 0, so every save written before Phase 18-E already has
// an explicit `version: 0` on disk. Introducing `version: PERSIST_VERSION`
// (1) below means those old saves are now treated as "version 0, needs
// migration" and will run through `migrate` once, then through the store's
// existing `merge`. Since every store's `merge` was already written to
// defensively normalize/default a possibly-partial `persistedState` (that's
// how pre-18-E saves loaded safely in the first place), the safest possible
// `migrate` is a pure passthrough that changes nothing and lets `merge` do
// what it already does. That is what `passthroughMigrate` below is.
//
// This intentionally does NOT switch on the incoming `version` number. If a
// *future* version ever appears in storage (newer than PERSIST_VERSION —
// e.g. a save written by a later build, then loaded by this one), zustand
// still calls this same migrate function (any mismatch triggers migrate, not
// just downgrades), and the passthrough + defensive `merge` combination means
// we still don't crash — we just load whatever fields merge recognizes and
// silently ignore the rest. There is no reliable way to *upgrade* a schema
// we've never seen, so "don't crash" is the achievable goal here, not "fully
// understand the future format".

export const PERSIST_VERSION = 1;

export function passthroughMigrate(persistedState) {
  return persistedState;
}
