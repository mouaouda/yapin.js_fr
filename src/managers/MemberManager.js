import { Routes } from '../rest/Routes.js';
import { ServerMember } from '../structures/ServerMember.js';
import { Collection } from '../util/Collection.js';
import { Limits } from '../util/Constants.js';
import { checkLength } from '../builders/validation.js';
import { parseDuration, resolveId } from '../util/util.js';
import { CachedManager } from './CachedManager.js';

/** `server.members`. */
export class MemberManager extends CachedManager {
  constructor(server) {
    super(server.client, ServerMember, { limit: server.client.options.cache.members });
    Object.defineProperty(this, 'server', { value: server });
  }

  _add(data, cache = true) {
    const id = String(data.id ?? data.user_id ?? data.user?.id);
    return super._add({ ...data, id }, cache, this.server);
  }

  _ensure(id) {
    return this.cache.get(String(id)) ?? this._add({ id: String(id) });
  }

  /** The bot's own member, once fetched. */
  get me() {
    return this.client.user ? this.cache.get(this.client.user.id) ?? null : null;
  }

  fetchMe(options) {
    return this.fetch(this.client.user.id, options);
  }

  /**
   * fetch(user) → one member (with roles, nickname, timeout).
   * fetch() → every member (pages through the whole list, 500 at a time).
   * fetch({ limit, after }) → one page.
   */
  async fetch(user, { force = false } = {}) {
    if (user === undefined) return this.#fetchAll();
    if (typeof user === 'object' && user !== null && !('id' in user) && ('limit' in user || 'after' in user)) return this.list(user);
    const id = resolveId(user);
    const cached = this.cache.get(id);
    if (!force && cached && !cached.partial) return cached;
    const out = await this.client.rest.get(Routes.serverMember(this.server.id, id));
    return this._add(out.member ?? out);
  }

  /** One page, sorted by user id. `after`: the last user id of the previous page. */
  async list({ limit = 200, after } = {}) {
    const out = await this.client.rest.get(Routes.serverMembers(this.server.id), {
      query: { limit: Math.min(limit, Limits.MembersPage), after: resolveId(after) ?? undefined },
    });
    return new Collection((out.members ?? []).map((m) => {
      const member = this._add(m);
      return [member.id, member];
    }));
  }

  /** Every member, a page at a time: `for await (const member of server.members.iterate()) …` */
  async *iterate({ pageSize = Limits.MembersPage } = {}) {
    let after;
    for (;;) {
      const page = await this.list({ limit: pageSize, after });
      yield* page.values();
      if (page.size < pageSize) return;
      after = page.lastKey();
    }
  }

  async #fetchAll() {
    const all = new Collection();
    for await (const member of this.iterate()) all.set(member.id, member);
    return all;
  }

  /** Needs Kick members. */
  async kick(user) {
    const id = resolveId(user);
    await this.client.rest.post(Routes.serverKick(this.server.id), { body: { user_id: id } });
    this.cache.delete(id);
  }

  ban(user) {
    return this.server.bans.create(user);
  }

  unban(user) {
    return this.server.bans.remove(user);
  }

  /**
   * Needs Timeout members. `duration`: milliseconds or a string like '10m', '1h', '7d' (up to 28 days,
   * rounded up to whole minutes). 0 / null clears an active timeout.
   */
  async timeout(user, duration, reason) {
    const ms = duration ? parseDuration(duration) : 0;
    if (ms === null) throw new TypeError(`Can't read "${duration}" as a duration (try '10m', '2h' or a number of ms)`);
    const minutes = Math.ceil(ms / 60_000);
    if (minutes > Limits.TimeoutMinutes) throw new RangeError('Timeouts last up to 28 days');
    const body = { user_id: resolveId(user), minutes };
    if (reason) body.reason = checkLength(reason, Limits.TimeoutReason, 'Timeout reason');
    return this.client.rest.post(Routes.serverTimeouts(this.server.id), { body });
  }

  /** Needs Manage nicknames. '' or null clears it. */
  async setNickname(user, nickname) {
    const nick = nickname ? checkLength(nickname, Limits.Nickname, 'Nickname') : '';
    await this.client.rest.patch(Routes.serverMember(this.server.id, resolveId(user)), { body: { nickname: nick } });
    const member = this.cache.get(resolveId(user));
    if (member) member.nickname = nick || null;
  }

  /** Needs Manage roles. */
  async addRole(user, role) {
    const id = resolveId(user);
    const roleId = resolveId(role);
    await this.client.rest.put(Routes.serverMemberRole(this.server.id, id, roleId));
    const member = this.cache.get(id);
    if (member && !member.roleIds.includes(roleId)) member.roleIds.push(roleId);
  }

  async removeRole(user, role) {
    const id = resolveId(user);
    const roleId = resolveId(role);
    await this.client.rest.delete(Routes.serverMemberRole(this.server.id, id, roleId));
    const member = this.cache.get(id);
    if (member) member.roleIds = member.roleIds.filter((r) => r !== roleId);
  }

  /** Cached members whose username, display name or nickname matches (case-insensitive). */
  search(query) {
    const q = String(query).toLowerCase().replace(/^@/, '');
    return this.cache.filter((m) =>
      [m.user.username, m.user.globalName, m.nickname].some((n) => n && n.toLowerCase() === q));
  }
}
