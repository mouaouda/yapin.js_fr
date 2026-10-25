import { Routes } from '../rest/Routes.js';
import { Ban } from '../structures/Ban.js';
import { Collection } from '../util/Collection.js';
import { resolveId } from '../util/util.js';

/** `server.bans`. Needs Ban members. */
export class BanManager {
  constructor(server) {
    Object.defineProperty(this, 'server', { value: server });
    Object.defineProperty(this, 'client', { value: server.client });
    this.cache = new Collection();
  }

  async fetch() {
    const out = await this.client.rest.get(Routes.serverBans(this.server.id));
    this.cache.clear();
    for (const data of out.bans ?? []) {
      const ban = new Ban(this.client, data, this.server);
      this.cache.set(ban.userId, ban);
    }
    return this.cache.clone();
  }

  async create(user) {
    const id = resolveId(user);
    await this.client.rest.post(Routes.serverBans(this.server.id), { body: { user_id: id } });
    this.server.members.cache.delete(id);
  }

  async remove(user) {
    const id = resolveId(user);
    await this.client.rest.delete(Routes.serverBan(this.server.id, id));
    this.cache.delete(id);
  }
}
