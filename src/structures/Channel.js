import { ChannelType, Limits } from '../util/Constants.js';
import { Routes } from '../rest/Routes.js';
import { channelMention } from '../util/Formatters.js';
import { checkLength } from '../builders/validation.js';
import { resolveId } from '../util/util.js';
import { MessageManager } from '../managers/MessageManager.js';
import { MessageCollector } from '../collectors/MessageCollector.js';
import { Base } from './Base.js';

export class BaseChannel extends Base {
  constructor(client, data) {
    super(client);
    this.id = String(data.id);
    this.type = data.type ?? data.kind ?? null;
    this.name = null;
    this.partial = true;
    this._patch(data);
  }

  _patch(data) {
    if (data.name != null) this.name = data.name;
    else if (data.channel_name != null) this.name = data.channel_name;
    if (this.name !== null || data.kind || data.type) this.partial = false;
    return data;
  }

  isText() {
    return this.type === ChannelType.Text;
  }

  isVoice() {
    return this.type === ChannelType.Voice;
  }

  isDM() {
    return this.type === ChannelType.DM;
  }

  isCategory() {
    return this.type === ChannelType.Category;
  }

  /** Text channels and DMs: things you can send to. */
  isTextBased() {
    return this.type === ChannelType.Text || this.type === ChannelType.DM;
  }

  inServer() {
    return Boolean(this.serverId);
  }

  fetch(force = true) {
    return this.client.channels.fetch(this.id, { force });
  }

  async delete() {
    await this.client.rest.delete(Routes.channel(this.id));
    this.client.channels._remove(this.id);
    return this;
  }

  toString() {
    return channelMention(this.id);
  }
}

/** Sending, fetching and collecting messages: shared by text channels and DMs. */
const TextBased = {
  /** send('hi') or send({ content, embeds, components, replyTo }). Returns the Message. */
  send(payload) {
    return this.client.channels.send(this, payload);
  },

  /** Deletes messages: an array / Collection of messages or ids, or a number to delete the latest n. */
  async bulkDelete(messages) {
    return this.messages.bulkDelete(messages);
  },

  createMessageCollector(options = {}) {
    return new MessageCollector(this, options);
  },

  /** Resolves with the collected messages when the collector ends. */
  awaitMessages(options = {}) {
    return new Promise((resolve, reject) => {
      const collector = this.createMessageCollector(options);
      collector.once('end', (collected, reason) => {
        if (options.errors?.includes(reason)) reject(collected);
        else resolve(collected);
      });
    });
  },
};

/** A text or voice channel in a server. */
export class ServerChannel extends BaseChannel {
  _patch(data) {
    super._patch(data);
    if ('server_id' in data && data.server_id) this.serverId = String(data.server_id);
    if ('position' in data) this.position = data.position ?? 0;
    if ('category_id' in data) this.categoryId = data.category_id ?? null;
    else if ('category' in data) this.categoryId = data.category?.id ?? null;
    if ('private' in data) this.private = Boolean(data.private);
    if ('read_only' in data) this.readOnly = Boolean(data.read_only);
    if ('slowmode' in data) this.slowmode = data.slowmode ?? 0;
    this.serverId ??= null;
    return data;
  }

  get server() {
    return this.serverId ? this.client.servers.cache.get(this.serverId) ?? null : null;
  }

  /** The category it sits in (discord.js calls it the parent). */
  get category() {
    return this.categoryId ? this.server?.channels.cache.get(this.categoryId) ?? null : null;
  }

  get parent() {
    return this.category;
  }

  get parentId() {
    return this.categoryId;
  }

  /**
   * Manage channels. edit({ name, category, private, roles, readOnly, postRoles, slowmode }).
   * `private: true` + `roles`: only those roles see it. `readOnly: true` + `postRoles`: only those can post.
   */
  async edit(changes = {}) {
    const body = {};
    if (changes.name !== undefined) body.name = changes.name;
    const category = changes.category ?? changes.parent ?? changes.categoryId;
    if (category !== undefined) body.category_id = category === null ? null : resolveId(category);
    if (changes.private !== undefined) body.private = Boolean(changes.private);
    if (changes.roles ?? changes.roleIds) body.role_ids = (changes.roles ?? changes.roleIds).map(resolveId);
    if (changes.readOnly !== undefined) body.read_only = Boolean(changes.readOnly);
    if (changes.postRoles ?? changes.postRoleIds) body.post_role_ids = (changes.postRoles ?? changes.postRoleIds).map(resolveId);
    if (changes.slowmode !== undefined) {
      body.slowmode = changes.slowmode;
      if (changes.slowmode > Limits.Slowmode) throw new RangeError(`Slowmode is up to ${Limits.Slowmode} seconds`);
    }
    const out = await this.client.rest.patch(Routes.channel(this.id), { body });
    this._patch({ ...out.channel, server_id: this.serverId });
    return this;
  }

  setName(name) {
    return this.edit({ name });
  }

  setCategory(category) {
    return this.edit({ category });
  }

  setParent(category) {
    return this.edit({ category });
  }

  /** Seconds between messages per person, 0 to 21600. */
  setSlowmode(seconds) {
    return this.edit({ slowmode: seconds });
  }

  setPrivate(isPrivate = true, roles) {
    return this.edit({ private: isPrivate, roles });
  }

  setReadOnly(readOnly = true, postRoles) {
    return this.edit({ readOnly, postRoles });
  }
}

export class TextChannel extends ServerChannel {
  constructor(client, data) {
    super(client, data);
    this.type = ChannelType.Text;
    this.messages = new MessageManager(this);
  }
}
Object.assign(TextChannel.prototype, TextBased);

export class VoiceChannel extends ServerChannel {
  constructor(client, data) {
    super(client, data);
    this.type = ChannelType.Voice;
  }

  /** Ids of the people in it, as last seen (refresh with `server.voice.fetch()`). */
  get memberIds() {
    return this.server ? this.server.voice.states.filter((s) => s.channelId === this.id).map((s) => s.userId) : [];
  }

  /** Cached members in it. */
  get members() {
    const server = this.server;
    return server ? server.members.cache.filter((m) => this.memberIds.includes(m.id)) : null;
  }

  /** The bot joins and gets a VoiceConnection to play audio. See docs/voice.md. */
  join(options) {
    return this.server.voice.connect(this, options);
  }
}

export class DMChannel extends BaseChannel {
  constructor(client, data) {
    super(client, data);
    this.type = ChannelType.DM;
    this.serverId = null;
    this.recipientId = data.recipient_id ?? null;
    this.messages = new MessageManager(this);
  }

  get recipient() {
    return this.recipientId ? this.client.users.cache.get(this.recipientId) ?? null : null;
  }
}
Object.assign(DMChannel.prototype, TextBased);

/** A channel category. Yapin’ lists them next to channels; yapin.js keeps them in `server.channels` too. */
export class CategoryChannel extends BaseChannel {
  constructor(client, data) {
    super(client, { ...data, type: ChannelType.Category });
    this.type = ChannelType.Category;
  }

  _patch(data) {
    super._patch(data);
    if ('server_id' in data && data.server_id) this.serverId = String(data.server_id);
    if ('position' in data) this.position = data.position ?? 0;
    return data;
  }

  get server() {
    return this.client.servers.cache.get(this.serverId) ?? null;
  }

  /** The channels in this category. */
  get children() {
    return this.server?.channels.cache.filter((c) => c.categoryId === this.id);
  }

  async edit({ name } = {}) {
    await this.client.rest.patch(Routes.serverCategory(this.serverId, this.id), { body: { name: checkLength(name, 100, 'Category name', 1) } });
    this.name = name;
    return this;
  }

  setName(name) {
    return this.edit({ name });
  }

  async delete() {
    await this.client.rest.delete(Routes.serverCategory(this.serverId, this.id));
    this.server?.channels.cache.delete(this.id);
    return this;
  }

  fetch() {
    return this.server.channels.fetch().then(() => this);
  }

  toString() {
    return this.name ?? this.id;
  }
}

/** The right class for some channel data. */
export function createChannel(client, data) {
  const type = data.type ?? data.kind ?? (data.server_id ? ChannelType.Text : null);
  switch (type) {
    case ChannelType.Voice:
      return new VoiceChannel(client, data);
    case ChannelType.Category:
      return new CategoryChannel(client, data);
    case ChannelType.DM:
      return new DMChannel(client, data);
    case ChannelType.Text:
      return new TextChannel(client, data);
    default:
      return data.server_id === null ? new DMChannel(client, data) : new TextChannel(client, data);
  }
}
