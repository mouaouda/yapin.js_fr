import { Routes } from '../rest/Routes.js';
import { Server } from '../structures/Server.js';
import { Collection } from '../util/Collection.js';
import { resolveId } from '../util/util.js';
import { CachedManager } from './CachedManager.js';

/** `client.servers` (also `client.guilds`): the servers the bot is in. */
export class ServerManager extends CachedManager {
  constructor(client) {
    super(client, Server);
  }

  /**
   * fetch() → every server the bot is in (Collection). fetch(id) → one server.
   */
  async fetch(server, { force = false } = {}) {
    if (server === undefined || (typeof server === 'object' && server !== null && !('id' in server))) {
      const out = await this.client.rest.get(Routes.servers());
      const found = new Collection();
      for (const data of out.servers ?? []) found.set(String(data.id), this._add(data));
      for (const id of this.cache.keys()) if (!found.has(id) && !this.cache.get(id).partial) this.cache.delete(id);
      return found;
    }
    const id = resolveId(server);
    const cached = this.cache.get(id);
    if (!force && cached && !cached.partial) return cached;
    const out = await this.client.rest.get(Routes.server(id));
    return this._add(out.server ?? out);
  }
}
