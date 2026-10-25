import { Routes } from '../rest/Routes.js';
import { User } from '../structures/User.js';
import { resolveId } from '../util/util.js';
import { CachedManager } from './CachedManager.js';

/** `client.users`: every user the bot has seen. */
export class UserManager extends CachedManager {
  constructor(client) {
    super(client, User, { limit: client.options.cache.users });
    /** user id → DM channel id */
    this.dmChannels = new Map();
  }

  _add(data, cache = true) {
    if (this.client.user && String(data.id) === this.client.user.id) {
      this.client.user._patch(data);
      return this.client.user;
    }
    return super._add(data, cache);
  }

  /** Someone's public profile. Served from cache unless `force` or the cached one is partial. */
  async fetch(user, { force = false, cache = true } = {}) {
    const id = resolveId(user);
    const cached = this.cache.get(id);
    if (!force && cached && !cached.partial) return cached;
    const out = await this.client.rest.get(Routes.user(id));
    return this._add(out.user ?? out, cache);
  }

  /** Opens (or finds) a DM. Their DM setting applies: they may need to be a friend or share a server. */
  async createDM(user) {
    const id = resolveId(user);
    const known = this.dmChannels.get(id);
    if (known) return this.client.channels._ensure(known, { server_id: null, type: 'dm', recipient_id: id });
    const out = await this.client.rest.post(Routes.userDM(id));
    this.dmChannels.set(id, out.channel_id);
    return this.client.channels._add({ id: out.channel_id, type: 'dm', server_id: null, recipient_id: id });
  }

  /** DMs someone in one call. */
  send(user, payload) {
    return this.client.channels.send(this.createDM(user), payload);
  }
}
