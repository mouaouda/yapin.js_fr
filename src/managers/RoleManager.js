import { Routes } from '../rest/Routes.js';
import { Role } from '../structures/Role.js';
import { Collection } from '../util/Collection.js';
import { resolveId } from '../util/util.js';
import { CachedManager } from './CachedManager.js';

/** `server.roles`. */
export class RoleManager extends CachedManager {
  constructor(server) {
    super(server.client, Role);
    Object.defineProperty(this, 'server', { value: server });
    this.fetchedAt = 0;
  }

  _add(data, cache = true) {
    return super._add(data, cache, this.server);
  }

  /** fetch() → every role, highest first. fetch(id) → one role (fetching all if it isn't cached). */
  async fetch(role, { force = false } = {}) {
    if (role !== undefined && typeof role !== 'object') {
      const id = resolveId(role);
      if (!force && this.cache.has(id)) return this.cache.get(id);
      return (await this.fetch()).get(id) ?? null;
    }
    const out = await this.client.rest.get(Routes.serverRoles(this.server.id));
    const found = new Collection();
    for (const data of out.roles ?? []) found.set(String(data.id), this._add(data));
    for (const id of this.cache.keys()) if (!found.has(id)) this.cache.delete(id);
    this.fetchedAt = Date.now();
    this.cache.sort((a, b) => b.position - a.position);
    return found.sort((a, b) => b.position - a.position);
  }

  /** Fetches roles unless they were fetched in the last `maxAge` ms. */
  async ensure(maxAge = 60_000) {
    if (Date.now() - this.fetchedAt > maxAge) await this.fetch();
    return this.cache;
  }

  /** An id, a Role, or a role name (case-insensitive, '@' optional), from cache. */
  resolve(role) {
    const byId = super.resolve(role);
    if (byId || typeof role !== 'string') return byId;
    const name = role.replace(/^@/, '').toLowerCase();
    return this.cache.find((r) => r.name.toLowerCase() === name) ?? null;
  }

  get highest() {
    return this.cache.reduce((top, r) => (!top || r.position > top.position ? r : top), null);
  }
}
