import { ErrorCodes, YapinError } from '../errors/index.js';
import { InteractionResponseType, Limits, MessageFlags } from '../util/Constants.js';
import { userMention } from '../util/Formatters.js';
import { resolvePayload, toPayloadOptions } from '../util/MessagePayload.js';
import { Routes } from '../rest/Routes.js';
import { softPromise } from '../util/util.js';
import { Base } from './Base.js';

/**
 * A button click. Answer within 3 seconds or the person sees "This interaction failed"; yapin.js
 * acknowledges for you if a handler hasn't answered by then (see `components.autoAck`). The interaction
 * then stays open for 15 minutes and takes up to 10 answers.
 */
export class ButtonInteraction extends Base {
  constructor(client, data) {
    super(client);
    this.id = String(data.id);
    Object.defineProperty(this, 'token', { value: data.token, enumerable: false });
    this.type = data.type ?? 'button';
    this.customId = data.custom_id;
    this.messageId = data.message_id ?? null;
    this.channelId = data.channel_id ?? null;
    this.serverId = data.server_id ?? null;
    this.user = client.users._add({ id: data.user_id, ...(data.username ? { username: data.username } : {}) });
    this.expiresAt = data.expires_at ? new Date(data.expires_at) : new Date(Date.now() + Limits.InteractionTTL);
    this.createdAt = new Date();
    /** Named parts of the custom_id, from a router pattern like 'vote:{choice}'. */
    this.params = {};
    this.replied = false;
    this.deferred = false;
    this.responses = 0;
  }

  get userId() {
    return this.user.id;
  }

  get customID() {
    return this.customId;
  }

  get channel() {
    return this.channelId ? this.client.channels._ensure(this.channelId, { server_id: this.serverId }) : null;
  }

  get server() {
    return this.serverId ? this.client.servers._ensure(this.serverId) : null;
  }

  get member() {
    return this.server?.members.cache.get(this.userId) ?? null;
  }

  /** The message the button is on (cached, or a partial you can `fetch()`). */
  get message() {
    if (!this.messageId || !this.channel?.messages) return null;
    return this.channel.messages._ensure(this.messageId);
  }

  fetchMessage() {
    return this.channel.messages.fetch(this.messageId);
  }

  fetchMember() {
    return this.server ? this.server.members.fetch(this.userId) : Promise.resolve(null);
  }

  /** True once an answer was sent (or is being sent). */
  get responded() {
    return this.responses > 0;
  }

  isButton() {
    return this.type === 'button';
  }

  isExpired() {
    return Date.now() >= this.expiresAt.getTime();
  }

  inServer() {
    return Boolean(this.serverId);
  }

  /** A new message in the channel. `reply({ content, ephemeral: true })` shows it only to the clicker. */
  reply(payload) {
    const options = toPayloadOptions(payload);
    const type = options.ephemeral ? InteractionResponseType.Ephemeral : InteractionResponseType.Reply;
    delete options.ephemeral;
    return this.#respond(type, options, () => { this.replied = true; });
  }

  /** A message only the clicker sees (text and embeds, no buttons). Shows until they reload or dismiss it. */
  ephemeral(payload) {
    return this.reply({ ...toPayloadOptions(payload), ephemeral: true });
  }

  /** Change the message the button is on. Left-out parts are kept, `null` removes them. */
  update(payload) {
    return this.#respond(InteractionResponseType.Update, toPayloadOptions(payload));
  }

  /** Just "got it": no visible answer, no error for the person. */
  deferUpdate() {
    return this.#respond(InteractionResponseType.Ack, null, () => { this.deferred = true; });
  }

  ack() {
    return this.deferUpdate();
  }

  /** Another answer after the first (up to 10 in all, within 15 minutes). */
  followUp(payload) {
    return this.reply(payload);
  }

  #respond(type, options, onSuccess) {
    // Counted before the request goes out, so the auto-ack sees a handler is already answering.
    this.responses++;
    const run = async () => {
      try {
        if (this.isExpired()) throw new YapinError(ErrorCodes.InteractionExpired, 'This interaction expired (15 minutes after the click)');
        if (this.responses > Limits.InteractionResponses) {
          throw new YapinError(ErrorCodes.InteractionTooManyResponses, `An interaction takes up to ${Limits.InteractionResponses} answers`);
        }
        const body = { type, ...(options ? resolvePayload(options, { edit: true }) : {}) };
        if (type === InteractionResponseType.Ephemeral) {
          if (body.flags & MessageFlags.IsComponentsV2) throw new YapinError(ErrorCodes.InvalidPayload, 'Ephemeral replies cannot be Components V2 yet');
          if (body.components?.length) throw new YapinError(ErrorCodes.InvalidPayload, 'Ephemeral replies take text and embeds, not buttons');
        }
        const out = await this.client.rest.post(Routes.interactionCallback(this.id, this.token), { body });
        onSuccess?.();
        return out;
      } catch (error) {
        this.responses--;
        throw error;
      }
    };
    return softPromise(run(), (e) => this.client._reportError(e, { where: `interaction ${this.customId}` }));
  }

  toString() {
    return `${userMention(this.userId)} clicked ${this.customId}`;
  }
}

export { ButtonInteraction as Interaction };
