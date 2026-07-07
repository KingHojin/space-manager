// Minimal in-memory localStorage stub for zustand's `persist` middleware, which
// expects `window.localStorage` (or `globalThis.localStorage`) to exist even
// though these tests run in a plain Node environment with no DOM/browser APIs.
class MemoryStorage {
  constructor() {
    this._store = new Map();
  }

  get length() {
    return this._store.size;
  }

  key(index) {
    return Array.from(this._store.keys())[index] ?? null;
  }

  getItem(key) {
    return this._store.has(key) ? this._store.get(key) : null;
  }

  setItem(key, value) {
    this._store.set(key, String(value));
  }

  removeItem(key) {
    this._store.delete(key);
  }

  clear() {
    this._store.clear();
  }
}

if (!globalThis.localStorage) {
  globalThis.localStorage = new MemoryStorage();
}

// zustand's persist middleware resolves its default storage via
// `window.localStorage` (not `globalThis.localStorage`) at store-creation
// time; wrapped in a try/catch that silently swallows the ReferenceError and
// leaves `storage` undefined when `window` doesn't exist. In that state the
// middleware early-returns before ever assigning `api.persist`, so
// `useXStore.persist` (getOptions/merge/partialize/etc.) is unavailable —
// this is otherwise invisible because normal app code never touches
// `.persist` directly. Aliasing `window` to `globalThis` here (Node has no
// browser `window`) lets `window.localStorage` resolve to the stub above so
// persist-merge/migration tests can exercise the real `.persist` API.
if (!globalThis.window) {
  globalThis.window = globalThis;
}
