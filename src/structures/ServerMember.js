import { Collection } from '../util/Collection.js';
import { userMention } from '../util/Formatters.js';
import { resolveId } from '../util/util.js';
import { Base } from './Base.js';
import { Permissions } from './Permissions.js';

/** `member.roles`: the member's roles, plus add / remove. */
export class MemberRoleManager {
  constructor(member) {
    Object.defineProperty(this, 'member', { value: member });
  }

  get ids() {
    return this.member.roleIds;
  }

  /** The member's roles that are cached on the server (fetch them with `server.roles.fetch()`). */
  get cache() {
    const roles = this.member.server?.roles.cache ?? new Collection();
    return roles.filter((role) => this.member.roleIds.includes(role.id));
  }

  get highest() {
    return this.cache.reduce((top, role) => (!top || role.position > top.position ? role : top), null);
  }

  /** A role id, a Role, or a role name. */
  has(role) {
    const id = this.#resolve(role);
    return id !== null && this.member.roleIds.includes(id);
  }

  async add(role) {
    const id = this.#resolve(role, true);
    await this.member.server.members.addRole(this.member, id);
    if (!this.member.roleIds.includes(id)) this.member.roleIds.push(id);
    return this.member;
  }

  async remove(role) {
    const id = this.#resolve(role, true);
    await this.member.server.members.removeRole(this.member, id);
    this.member.roleIds = this.member.roleIds.filter((r) => r !== id);
    return this.member;
  }

  #resolve(role, strict = false) {
    const server = this.member.server;
    if (typeof role === 'string' && server) {
      const byName = server.roles.cache.find((r) => r.name.toLowerCase() === role.toLowerCase());
      if (byName && !server.roles.cache.has(role)) return byName.id;
    }
    const id = resolveId(role);
    if (strict && !id) throw new TypeError(`Not a role: ${role}`);
    return id;
  }
}

/** Someone in a server: their user, nickname, roles and timeout. */
export class ServerMember extends Base {
  constructor(client, data, server) {
    super(client);
    this.serverId = server.id;
    this.roleIds = [];
    this.nickname = null;
    this.joinedAt = null;
    this.activeTimeout = null;
    this.partial = true;
    this.roles = new MemberRoleManager(this);
    this._patch(data);
  }

  _patch(data) {
    const id = data.id ?? data.user_id ?? data.user?.id;
    const userData = data.user ?? { ...data, id };
    this.user = this.client.users._add(userData);
    if ('nickname' in data) this.nickname = data.nickname || null;
    if ('joined_at' in data) this.joinedAt = data.joined_at ? new Date(data.joined_at) : this.joinedAt;
    if ('roles' in data && Array.isArray(data.roles)) {
      this.roleIds = data.roles.map((r) => (typeof r === 'object' ? String(r.id) : String(r)));
      this.partial = false;
    }
    if ('timeout' in data) this.activeTimeout = data.timeout ?? null;
    return data;
  }

  get id() {
    return this.user.id;
  }

  get server() {
    return this.client.servers.cache.get(this.serverId) ?? null;
  }

  /** Nickname, else display name, else username. */
  get displayName() {
    return this.nickname || this.user.displayName;
  }

  /** From the member's cached roles; the server owner has everything. */
  get permissions() {
    return Permissions.fromRoles(this.roles.cache.values(), { owner: this.server?.ownerId === this.id });
  }

  /** When an active timeout ends, if Yapin’ said. */
  get communicationDisabledUntil() {
    const t = this.activeTimeout;
    if (!t) return null;
    const end = t.until ?? t.expires_at ?? t.ends_at ?? t.end ?? null;
    return end ? new Date(end) : null;
  }

  isTimedOut() {
    if (!this.activeTimeout) return false;
    const until = this.communicationDisabledUntil;
    return until ? until.getTime() > Date.now() : true;
  }

  /** The voice channel they are in, as last seen through events or `server.voice.fetch()`. */
  get voice() {
    const server = this.server;
    const channelId = server?.voice.states.get(this.id)?.channelId ?? null;
    const member = this;
    return {
      channelId,
      get channel() {
        return channelId ? member.client.channels.cache.get(channelId) ?? null : null;
      },
      move: (channel) => server.voice.move(member, channel),
      disconnect: () => server.voice.disconnect(member),
    };
  }

  kick() {
    return this.server.members.kick(this);
  }

  ban() {
    return this.server.bans.create(this);
  }

  /**
   * Times them out. `duration`: milliseconds, or a string like '10m', '2h', '7d' (up to 28 days,
   * rounded up to whole minutes). 0 or null clears it.
   */
  timeout(duration, reason) {
    return this.server.members.timeout(this, duration, reason);
  }

  removeTimeout() {
    return this.server.members.timeout(this, 0);
  }

  disableCommunicationUntil(date, reason) {
    return this.timeout(date ? new Date(date).getTime() - Date.now() : 0, reason);
  }

  /** '' or null clears it. */
  async setNickname(nickname) {
    await this.server.members.setNickname(this, nickname);
    this.nickname = nickname || null;
    return this;
  }

  send(payload) {
    return this.user.send(payload);
  }

  createDM() {
    return this.user.createDM();
  }

  fetch(force = true) {
    return this.server.members.fetch(this.id, { force });
  }

  toString() {
    return userMention(this.id);
  }
}
