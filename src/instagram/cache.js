export class TtlCache {
  #store = new Map();
  #ttlMs;
  #maxEntries;

  constructor(ttlMs = 60000, maxEntries = 500) {
    this.#ttlMs = ttlMs;
    this.#maxEntries = maxEntries;
  }

  get size() {
    return this.#store.size;
  }

  get(key) {
    const entry = this.#store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.#store.delete(key);
      return undefined;
    }
    // Refresh recency so the least recently used entry is evicted first.
    this.#store.delete(key);
    this.#store.set(key, entry);
    return entry.value;
  }

  set(key, value) {
    if (this.#ttlMs <= 0) return value;

    if (this.#store.size >= this.#maxEntries) {
      const oldestKey = this.#store.keys().next().value;
      if (oldestKey !== undefined) this.#store.delete(oldestKey);
    }

    this.#store.set(key, { value, expiresAt: Date.now() + this.#ttlMs });
    return value;
  }

  async wrap(key, factory) {
    const cached = this.get(key);
    if (cached !== undefined) return cached;
    const value = await factory();
    return this.set(key, value);
  }

  clear() {
    this.#store.clear();
  }
}
