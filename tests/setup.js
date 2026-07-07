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
