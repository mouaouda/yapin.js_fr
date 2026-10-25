import { Collection, LimitedCollection } from '../util/Collection.js';
import { resolveId } from '../util/util.js';

/**
 * Holds one kind of structure in `cache` and knows how to fetch more. Every manager in yapin.js
 * (client.users, server.members, channel.messages…) works this way.
 */
export class CachedManager {
  constructor(client, holds, { limit = Infinity } = {}) {
    Object.defineProperty(this, 'client', { value: client });
    Object.defineProperty(this, 'holds', { value: holds });
    this.cache = Number.isFinite(limit) ? new LimitedCollection(limit) : new Collection();
  }

  /** Construct or update a structure from API data and cache it. */
  _add(data, cache = true, ...extras) {
    const id = String(data.id);
    const existing = this.cache.get(id);
    if (existing) {
      existing._patch(data);
      return existing;
    }
    const made = this._make(data, ...extras);
    if (cache) this.cache.set(id, made);
    return made;
  }

  _make(data, ...extras) {
    return new this.holds(this.client, data, ...extras);
  }

  /** The cached structure, or a partial one with just its id (and any hints) that you can `fetch()`. */
  _ensure(id, hints = {}) {
    return this.cache.get(String(id)) ?? this._add({ ...hints, id: String(id) });
  }

  _remove(id) {
    this.cache.delete(String(id));
  }

  /** An id or structure → the cached structure, or null. */
  resolve(idOrInstance) {
    if (idOrInstance instanceof this.holds) return idOrInstance;
    const id = resolveId(idOrInstance);
    return id ? this.cache.get(id) ?? null : null;
  }

  resolveId(idOrInstance) {
    return resolveId(idOrInstance);
  }

  valueOf() {
    return this.cache;
  }
}
