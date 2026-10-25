import { Base } from './Base.js';

/** A reaction someone added or removed (the `messageReactionAdd` / `messageReactionRemove` events). */
export class MessageReaction extends Base {
  constructor(client, data) {
    super(client);
    this.emoji = data.emoji;
    this.messageId = data.message_id;
    this.channelId = data.channel_id;
    this.serverId = data.server_id ?? null;
    this.messageAuthorId = data.message_author_id ?? null;
    this.userId = data.user_id;
  }

  get channel() {
    return this.client.channels._ensure(this.channelId, { server_id: this.serverId });
  }

  get server() {
    return this.serverId ? this.client.servers._ensure(this.serverId) : null;
  }

  get message() {
    return this.channel.messages._ensure(this.messageId, { author_id: this.messageAuthorId ?? undefined });
  }

  get user() {
    return this.client.users._ensure(this.userId);
  }

  get member() {
    return this.server?.members.cache.get(this.userId) ?? null;
  }

  /** True when it's on one of the bot's own messages. */
  get onOwnMessage() {
    return Boolean(this.client.user) && this.messageAuthorId === this.client.user.id;
  }

  fetchMessage() {
    return this.channel.messages.fetch(this.messageId);
  }

  /** Adds the bot's reaction with the same emoji. */
  react() {
    return this.channel.messages.react(this.messageId, this.emoji);
  }

  toString() {
    return this.emoji;
  }
}

/** Someone joined or left a voice channel (`voiceJoin` / `voiceLeave`). A move is a leave plus a join. */
export class VoiceState extends Base {
  constructor(client, data, joined) {
    super(client);
    this.userId = data.user_id;
    this.channelId = data.channel_id;
    this.serverId = data.server_id;
    this.joined = joined;
  }

  get user() {
    return this.client.users._ensure(this.userId);
  }

  get member() {
    return this.server?.members.cache.get(this.userId) ?? null;
  }

  get channel() {
    return this.client.channels._ensure(this.channelId, { server_id: this.serverId, type: 'voice' });
  }

  get server() {
    return this.serverId ? this.client.servers._ensure(this.serverId) : null;
  }

  /** True when this is about the bot itself (like a moderator disconnecting it). */
  get isMe() {
    return this.userId === this.client.user?.id;
  }
}
