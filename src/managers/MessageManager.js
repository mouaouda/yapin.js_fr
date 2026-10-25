import { Routes } from '../rest/Routes.js';
import { Message } from '../structures/Message.js';
import { Collection } from '../util/Collection.js';
import { Limits } from '../util/Constants.js';
import { resolvePayload } from '../util/MessagePayload.js';
import { resolveId, softPromise } from '../util/util.js';
import { CachedManager } from './CachedManager.js';

const toTime = (value) => {
  if (value === undefined || value === null) return undefined;
  if (value instanceof Message) return value.createdAt?.toISOString();
  return new Date(value).toISOString();
};

/** `channel.messages`. Keeps the last `cache.messages` messages per channel (100 by default). */
export class MessageManager extends CachedManager {
  constructor(channel) {
    super(channel.client, Message, { limit: channel.client.options.cache.messages });
    Object.defineProperty(this, 'channel', { value: channel });
  }

  _add(data, cache = true) {
    return super._add(data, cache, this.channel);
  }

  #addList(out) {
    for (const author of out.authors ?? []) this.client.users._add(author);
    const found = new Collection();
    for (const data of out.messages ?? []) {
      const message = this._add({ ...data, server_id: data.server_id ?? this.channel.serverId ?? null });
      found.set(message.id, message);
    }
    return found;
  }

  /**
   * fetch(id) → one Message.
   * fetch({ limit, before, after }) → a Collection, oldest first (50 by default, up to 100).
   * `before` / `after` are times: a Date, an ISO string, or a Message.
   */
  async fetch(options, { force = false } = {}) {
    if (typeof options === 'string' || options instanceof Message) {
      const id = resolveId(options);
      const cached = this.cache.get(id);
      if (!force && cached && !cached.partial) return cached;
      const out = await this.client.rest.get(Routes.channelMessage(this.channel.id, id));
      if (out.author) this.client.users._add(out.author);
      return this._add({ ...(out.message ?? out), server_id: this.channel.serverId ?? null });
    }
    const { limit = 50, before, after } = options ?? {};
    const out = await this.client.rest.get(Routes.channelMessages(this.channel.id), {
      query: { limit: Math.min(limit, Limits.MessagesFetch), before: toTime(before), after: toTime(after) },
    });
    return this.#addList(out);
  }

  /** Edit one of the bot's own messages. */
  edit(message, payload) {
    const run = async () => {
      const body = resolvePayload(payload, { edit: true });
      const out = await this.client.rest.patch(Routes.channelMessage(this.channel.id, resolveId(message)), { body });
      return this._add(out.message ?? out);
    };
    return softPromise(run(), (e) => this.client._reportError(e, { where: 'edit' }));
  }

  /** The bot's own messages, or anyone's with Manage messages. */
  async delete(message) {
    const id = resolveId(message);
    await this.client.rest.delete(Routes.channelMessage(this.channel.id, id));
    this.cache.delete(id);
  }

  /**
   * Deletes many at once: messages / ids (any number; sent 100 at a time), or a number to delete the
   * latest n. Returns { deleted, skipped } id lists. Other people's messages need Manage messages.
   */
  async bulkDelete(messages) {
    let ids;
    if (typeof messages === 'number') {
      const latest = await this.fetch({ limit: Math.min(messages, Limits.MessagesFetch) });
      ids = [...latest.keys()];
    } else {
      ids = [...(messages instanceof Map ? messages.keys() : messages)].map(resolveId);
    }
    const result = { deleted: [], skipped: [] };
    for (let i = 0; i < ids.length; i += Limits.BulkDelete) {
      const out = await this.client.rest.post(Routes.channelBulkDelete(this.channel.id), { body: { ids: ids.slice(i, i + Limits.BulkDelete) } });
      result.deleted.push(...(out.deleted ?? []));
      result.skipped.push(...(out.skipped ?? []));
    }
    for (const id of result.deleted) this.cache.delete(id);
    return result;
  }

  /** React with a unicode emoji. */
  react(message, emoji) {
    const request = this.client.rest.put(Routes.channelMessageReaction(this.channel.id, resolveId(message), emoji));
    return softPromise(request, (e) => this.client._reportError(e, { where: 'react' }));
  }

  unreact(message, emoji) {
    return this.client.rest.delete(Routes.channelMessageReaction(this.channel.id, resolveId(message), emoji));
  }

  /** Collection<emoji, { emoji, count, userIds, me }>. */
  async fetchReactions(message) {
    const out = await this.client.rest.get(Routes.channelMessageReactions(this.channel.id, resolveId(message)));
    const grouped = new Collection();
    for (const r of out.reactions ?? []) {
      const entry = grouped.ensure(r.emoji, () => ({ emoji: r.emoji, count: 0, userIds: [], me: false }));
      entry.count++;
      entry.userIds.push(r.user_id);
      if (r.user_id === this.client.user?.id) entry.me = true;
    }
    return grouped;
  }

  /** Needs Manage messages. */
  pin(message) {
    return this.client.rest.put(Routes.channelMessagePin(this.channel.id, resolveId(message)));
  }

  unpin(message) {
    return this.client.rest.delete(Routes.channelMessagePin(this.channel.id, resolveId(message)));
  }
}
