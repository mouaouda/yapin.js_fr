import { Base } from './Base.js';

export class Ban extends Base {
  constructor(client, data, server) {
    super(client);
    this.serverId = server.id;
    this.userId = String(data.user_id);
    this.user = data.user ? client.users._add(data.user) : client.users._ensure(this.userId);
    this.bannedById = data.banned_by ?? null;
    this.createdAt = data.created_at ? new Date(data.created_at) : null;
  }

  get server() {
    return this.client.servers.cache.get(this.serverId) ?? null;
  }

  get bannedBy() {
    return this.bannedById ? this.client.users.cache.get(this.bannedById) ?? null : null;
  }

  /** Unban. */
  remove() {
    return this.server.bans.remove(this.userId);
  }
}
