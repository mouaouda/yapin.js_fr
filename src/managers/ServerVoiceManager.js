import { Routes } from '../rest/Routes.js';
import { VoiceState } from '../structures/MessageReaction.js';
import { Collection } from '../util/Collection.js';
import { resolveId } from '../util/util.js';

/**
 * `server.voice`: who is in voice, moving and dropping people, and the bot's own calls.
 * Moving and dropping need Move Members and a higher role than the person (30 a minute per bot).
 */
export class ServerVoiceManager {
  constructor(server) {
    Object.defineProperty(this, 'server', { value: server });
    Object.defineProperty(this, 'client', { value: server.client });
    /** user id → VoiceState, kept up to date from voiceJoin / voiceLeave and fetch(). */
    this.states = new Collection();
  }

  _join(data) {
    const state = new VoiceState(this.client, data, true);
    this.states.set(state.userId, state);
    return state;
  }

  _leave(data) {
    const state = new VoiceState(this.client, data, false);
    // A move can arrive as join-then-leave; only forget them if they were still in the channel they left.
    if (this.states.get(state.userId)?.channelId === state.channelId) this.states.delete(state.userId);
    return state;
  }

  /**
   * Who is in every voice channel the bot can see (60 lookups a minute):
   * Collection<channelId, userId[]>, empty channels included. Also refreshes `states`.
   */
  async fetch() {
    const out = await this.client.rest.get(Routes.serverVoice(this.server.id));
    const channels = new Collection();
    this.states.clear();
    for (const { channel_id: channelId, user_ids: userIds } of out.voice ?? []) {
      channels.set(channelId, userIds);
      this.client.channels._ensure(channelId, { server_id: this.server.id, type: 'voice' });
      for (const userId of userIds) this._join({ user_id: userId, channel_id: channelId, server_id: this.server.id });
    }
    return channels;
  }

  /** The voice channel id someone is in right now (fresh lookup), or null. */
  async channelOf(user) {
    const id = resolveId(user);
    const channels = await this.fetch();
    return channels.findKey((ids) => ids.includes(id)) ?? null;
  }

  /** Moves someone who is in voice to another voice channel. 409 if they aren't in voice. */
  async move(user, channel) {
    await this.client.rest.post(Routes.serverVoiceMove(this.server.id), { body: { user_id: resolveId(user), channel_id: resolveId(channel) } });
  }

  async disconnect(user) {
    await this.client.rest.post(Routes.serverVoiceDisconnect(this.server.id), { body: { user_id: resolveId(user) } });
  }

  /**
   * A raw LiveKit ticket for the bot: { url, token, e2ee, voice_muted, channel_id, server_id, expires_in }.
   * Most bots want `connect()`, which does the whole join including encryption.
   */
  join(channel) {
    return this.client.rest.post(Routes.serverVoiceJoin(this.server.id), { body: { channel_id: resolveId(channel) } });
  }

  /** The bot joins a voice channel and gets a VoiceConnection to play audio into. See docs/voice.md. */
  connect(channel, options) {
    return this.client.voice.connect(this.server, channel, options);
  }

  /** Takes the bot out of voice here (works even if its own code lost track of the call). */
  async leave() {
    const connection = this.client.voice.connections.get(this.server.id);
    if (connection) return connection.leave();
    await this.client.rest.post(Routes.serverVoiceLeave(this.server.id));
  }

  /** The bot's active connection in this server. */
  get connection() {
    return this.client.voice.connections.get(this.server.id) ?? null;
  }
}
