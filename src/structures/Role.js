import { Base } from './Base.js';
import { Permissions } from './Permissions.js';

export class Role extends Base {
  constructor(client, data, server) {
    super(client);
    this.id = String(data.id);
    this.serverId = server.id;
    this._patch(data);
  }

  _patch(data) {
    if ('name' in data) this.name = data.name;
    if ('color' in data) this.color = data.color ?? null;
    if ('position' in data) this.position = data.position ?? 0;
    if ('manage_server' in data) this.manageServer = Boolean(data.manage_server);
    if ('manage_messages' in data) this.manageMessages = Boolean(data.manage_messages);
    if ('perms' in data) this.perms = data.perms ?? {};
    /** Set for roles Yapin’ manages itself (like a bot's own role). */
    if ('auto' in data) this.auto = data.auto ?? null;
    return data;
  }

  get server() {
    return this.client.servers.cache.get(this.serverId) ?? null;
  }

  get permissions() {
    return Permissions.fromRole(this);
  }

  get hexColor() {
    if (!this.color) return null;
    return this.color.startsWith('#') ? this.color : `#${this.color}`;
  }

  /** Cached members with this role. */
  get members() {
    return this.server?.members.cache.filter((m) => m.roleIds.includes(this.id));
  }

  /** Positive when this role is higher than the other. */
  comparePositionTo(other) {
    const role = typeof other === 'string' ? this.server?.roles.cache.get(other) : other;
    return this.position - (role?.position ?? 0);
  }

  toString() {
    return `@${this.name}`;
  }
}
