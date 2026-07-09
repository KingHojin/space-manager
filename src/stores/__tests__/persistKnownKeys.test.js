import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Bug-fix round 21: architecture rule 5 (docs/NEXT_CHAT_HANDOFF.md) requires
// every zustand-persist store's storage key to be listed in BOTH
// SaveLoadModal.jsx's knownSaveKeys and Menu.jsx's KNOWN_STORAGE_KEYS.
// "space-manager-combat" (combatStore, Phase 15) was missing from both, and
// "space-manager-factions" was additionally missing from Menu.jsx. Both
// components do a runtime localStorage prefix scan that usually papers over
// the omission, but the static lists are the only fallback when enumeration
// is unavailable and they document the full save surface — so this test pins
// the invariant structurally: it discovers every `name: "space-manager-*"`
// in src/stores/*.js and asserts each appears verbatim in both component
// files, so adding a new persist store without updating the lists fails CI.

const ROOT = join(__dirname, "..", "..");

function collectPersistKeys() {
  const storesDir = join(ROOT, "stores");
  const keys = new Set();
  readdirSync(storesDir)
    .filter((file) => file.endsWith(".js"))
    .forEach((file) => {
      const source = readFileSync(join(storesDir, file), "utf8");
      const matches = source.matchAll(/name:\s*"(space-manager-[a-z-]+)"/g);
      for (const match of matches) keys.add(match[1]);
    });
  return [...keys].sort();
}

function readComponent(relativePath) {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

describe("persist storage keys vs known-keys lists (architecture rule 5)", () => {
  const persistKeys = collectPersistKeys();

  it("discovers the full persist store surface (sanity: includes combat and factions)", () => {
    expect(persistKeys.length).toBeGreaterThanOrEqual(16);
    expect(persistKeys).toContain("space-manager-combat");
    expect(persistKeys).toContain("space-manager-factions");
  });

  it("lists every persist key in SaveLoadModal.jsx's knownSaveKeys", () => {
    const source = readComponent("components/modals/SaveLoadModal.jsx");
    const missing = persistKeys.filter((key) => !source.includes(`"${key}"`));
    expect(missing).toEqual([]);
  });

  it("lists every persist key in Menu.jsx's KNOWN_STORAGE_KEYS", () => {
    const source = readComponent("components/panels/Menu.jsx");
    const missing = persistKeys.filter((key) => !source.includes(`"${key}"`));
    expect(missing).toEqual([]);
  });
});
