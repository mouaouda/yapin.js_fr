import { Collection } from '../util/Collection.js';
import { CDN, MentionPatterns } from '../util/Formatters.js';
import { isComponentsV2, toPayloadOptions } from '../util/MessagePayload.js';
import { resolveId } from '../util/util.js';
import { InteractionCollector } from '../collectors/InteractionCollector.js';
import { ReactionCollector } from '../collectors/ReactionCollector.js';
import { Base } from './Base.js';

/** Who and what a message mentions, parsed from its content. */
export class MessageMentions {
  constructor(message) {
    Object.defineProperty(this, 'message', { value: message });
    const content = message.content ?? '';
    this.userIds = [...new Set([...content.matchAll(MentionPatterns.User)].map((m) => m[1]))];
    this.channelIds = [...new Set([...content.matchAll(MentionPatterns.Channel)].map((m) => m[1]))];
    /** True when the bot was mentioned (Yapin’ tells us). */
    this.me = Boolean(message._mentioned) || (message.client.user ? this.userIds.includes(message.client.user.id) : false);
  }

  /** Mentioned users (cached ones in full, others as partials you can `fetch()`). */
  get users() {
    return new Collection(this.userIds.map((id) => [id, this.message.client.users._ensure(id)]));
  }

  get members() {
    const server = this.message.server;
    if (!server) return null;
    return new Collection(this.userIds.filter((id) => server.members.cache.has(id)).map((id) => [id, server.members.cache.get(id)]));
  }

  get channels() {
    return new Collection(this.channelIds.map((id) => [id, this.message.client.channels._ensure(id)]));
  }

  has(target) {
    const id = resolveId(target);
    return this.userIds.includes(id) || this.channelIds.includes(id);
  }
}

export class Message extends Base {
  constructor(client, data, channel) {
    super(client);
    this.id = String(data.id);
    this.channelId = String(data.channel_id ?? channel?.id);
    this.serverId = data.server_id ?? channel?.serverId ?? null;
    this.content = '';
    this.embeds = [];
    this.components = [];
    this.attachmentPath = null;
    this.replyToId = null;
    this.pinnedAt = null;
    this.editedAt = null;
    this.partial = !('content' in data);
    this._patch(data);
  }

  _patch(data) {
    if ('content' in data) {
      this.content = data.content ?? '';
      this.partial = false;
      this._mentions = null;
    }
    if ('author_id' in data || 'author' in data) {
      const author = data.author && typeof data.author === 'object' ? data.author : null;
      const authorId = String(data.author_id ?? author?.id);
      const userData = author ? { ...author, id: author.id ?? authorId } : { id: authorId };
      if (typeof data.author === 'string') userData.username = data.author;
      if ('author_bot' in data) userData.bot = Boolean(data.author_bot);
      this.author = this.client.users._add(userData);
    }
    if ('embeds' in data) this.embeds = data.embeds ?? [];
    if ('components' in data) this.components = data.components ?? [];
    if ('created_at' in data) this.createdTimestamp = data.created_at ? Date.parse(data.created_at) : null;
    if ('edited_at' in data) this.editedAt = data.edited_at ? new Date(data.edited_at) : null;
    if ('attachment_path' in data) this.attachmentPath = data.attachment_path ?? null;
    else if ('attachment' in data) this.attachmentPath = typeof data.attachment === 'object' && data.attachment ? data.attachment.path ?? data.attachment.url ?? null : data.attachment ?? null;
    if ('reply_to_id' in data) this.replyToId = data.reply_to_id ?? null;
    if ('pinned_at' in data) this.pinnedAt = data.pinned_at ? new Date(data.pinned_at) : null;
    if ('mentioned' in data) this._mentioned = Boolean(data.mentioned);
    if ('author_bot' in data) this.authorBot = Boolean(data.author_bot);
    if ('flags' in data) this.flags = data.flags ?? 0;
    return data;
  }

  get authorId() {
    return this.author?.id ?? null;
  }

  get createdAt() {
    return this.createdTimestamp ? new Date(this.createdTimestamp) : null;
  }

  get editedTimestamp() {
    return this.editedAt?.getTime() ?? null;
  }

  get channel() {
    return this.client.channels._ensure(this.channelId, { server_id: this.serverId });
  }

  get server() {
    return this.serverId ? this.client.servers._ensure(this.serverId) : null;
  }

  /** The author's member in the server, if cached. `await message.fetchMember()` to be sure. */
  get member() {
    return this.server?.members.cache.get(this.authorId) ?? null;
  }

  fetchMember() {
    if (!this.server) return Promise.resolve(null);
    return this.server.members.fetch(this.authorId);
  }

  get mentions() {
    return (this._mentions ??= new MessageMentions(this));
  }

  /** True when the bot was @mentioned. */
  get mentioned() {
    return this.mentions.me;
  }

  get attachmentURL() {
    return CDN.attachment(this.attachmentPath);
  }

  get pinned() {
    return Boolean(this.pinnedAt);
  }

  get reference() {
    return this.replyToId ? { messageId: this.replyToId, channelId: this.channelId, serverId: this.serverId } : null;
  }

  get isComponentsV2() {
    return isComponentsV2(this.components);
  }

  /** Sent by the bot itself, so it can be edited. */
  get editable() {
    return Boolean(this.client.user) && this.authorId === this.client.user.id;
  }

  inServer() {
    return Boolean(this.serverId);
  }

  /** Reply quoting this message. */
  reply(payload) {
    return this.client.channels.send(this.channelId, { ...toPayloadOptions(payload), replyTo: this.id }, { serverId: this.serverId });
  }

  /** Edit the bot's own message: edit('new text') or edit({ content, embeds, components }); null removes a part. */
  edit(payload) {
    return this.channel.messages.edit(this, payload);
  }

  delete() {
    return this.channel.messages.delete(this);
  }

  react(emoji) {
    return this.channel.messages.react(this, emoji);
  }

  /** Remove the bot's own reaction. */
  unreact(emoji) {
    return this.channel.messages.unreact(this, emoji);
  }

  /** Every reaction on the message: Collection<emoji, { emoji, count, userIds, me }>. */
  fetchReactions() {
    return this.channel.messages.fetchReactions(this);
  }

  pin() {
    return this.channel.messages.pin(this);
  }

  unpin() {
    return this.channel.messages.unpin(this);
  }

  fetch() {
    return this.channel.messages.fetch(this.id, { force: true });
  }

  /** The message this one replies to. */
  fetchReference() {
    if (!this.replyToId) return Promise.resolve(null);
    return this.channel.messages.fetch(this.replyToId);
  }

  createReactionCollector(options = {}) {
    return new ReactionCollector(this, options);
  }

  awaitReactions(options = {}) {
    return new Promise((resolve, reject) => {
      this.createReactionCollector(options).once('end', (collected, reason) => {
        if (options.errors?.includes(reason)) reject(collected);
        else resolve(collected);
      });
    });
  }

  /** Clicks on this message's buttons. */
  createMessageComponentCollector(options = {}) {
    return new InteractionCollector(this.client, { ...options, message: this });
  }

  /** The next click on this message's buttons (that passes `filter`). Rejects after `time` ms. */
  awaitMessageComponent({ filter, time = 60_000 } = {}) {
    return new Promise((resolve, reject) => {
      const collector = this.createMessageComponentCollector({ filter, time, max: 1 });
      collector.once('end', (collected, reason) => {
        const interaction = collected.first();
        if (interaction) resolve(interaction);
        else reject(Object.assign(new Error(`No click within ${time}ms`), { code: 'CollectorTimeout', reason }));
      });
    });
  }

  equals(other) {
    return Boolean(other) && this.id === other.id && this.content === other.content && this.editedTimestamp === other.editedTimestamp;
  }

  toString() {
    return this.content;
  }
}
