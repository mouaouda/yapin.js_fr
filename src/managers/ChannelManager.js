import { Routes } from '../rest/Routes.js';
import { BaseChannel, createChannel } from '../structures/Channel.js';
import { Collection } from '../util/Collection.js';
import { resolvePayload } from '../util/MessagePayload.js';
import { resolveId, softPromise } from '../util/util.js';
import { CachedManager } from './CachedManager.js';

/** `client.channels`: every channel the bot has seen, across servers and DMs. */
export class ChannelManager extends CachedManager {
  constructor(client) {
    super(client, BaseChannel);
  }

  _make(data) {
    return createChannel(this.client, data);
  }

  _add(data, cache = true) {
    const id = String(data.id);
    const type = data.type ?? data.kind;
    const existing = this.cache.get(id);
    // A partial made from just an id may have guessed the wrong kind; swap it for the real one.
    if (existing && existing.partial && type && existing.type !== type) this.cache.delete(id);
    const channel = super._add(data, cache);
    if (cache && channel.serverId) this.client.servers._ensure(channel.serverId).channels.cache.set(id, channel);
    return channel;
  }

  _remove(id) {
    const channel = this.cache.get(String(id));
    if (channel?.serverId) this.client.servers.cache.get(channel.serverId)?.channels.cache.delete(String(id));
    super._remove(id);
  }

  /** One channel by id. Throws a 404 YapinAPIError if the bot can't see it. */
  async fetch(channel, { force = false } = {}) {
    const id = resolveId(channel);
    const cached = this.cache.get(id);
    if (!force && cached && !cached.partial) return cached;
    const out = await this.client.rest.get(Routes.channel(id));
    return this._add(out.channel ?? out);
  }

  /** Every channel the bot can see in every server. `fetchAll({ type: 'text' })` for one kind. */
  async fetchAll({ type } = {}) {
    const out = await this.client.rest.get(Routes.channels(), { query: { type } });
    return new Collection((out.channels ?? []).map((c) => [String(c.id), this._add(c)]));
  }

  /**
   * Sends to a channel by id, without fetching it first. `send(id, 'hi')` or
   * `send(id, { content, embeds, components, replyTo })`. Returns the sent Message.
   */
  send(channel, payload, { serverId } = {}) {
    const run = async () => {
      const resolved = await channel;
      const id = resolveId(resolved);
      const body = resolvePayload(payload);
      const out = await this.client.rest.post(Routes.channelMessages(id), { body });
      const target = this._ensure(id, serverId ? { server_id: serverId } : {});
      const data = { ...(out.message ?? out), author_id: (out.message ?? out).author_id ?? this.client.user?.id };
      return target.messages ? target.messages._add(data) : data;
    };
    return softPromise(run(), (e) => this.client._reportError(e, { where: 'send' }));
  }
}
