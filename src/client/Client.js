import { EventEmitter } from 'node:events';
import { REST } from '../rest/REST.js';
import { Routes } from '../rest/Routes.js';
import { EventStream } from '../gateway/EventStream.js';
import { resolveSequenceStore } from '../gateway/SequenceStore.js';
import { CommandHandler } from '../commands/CommandHandler.js';
import { ComponentRouter } from '../interactions/ComponentRouter.js';
import { ModuleManager } from '../modules/ModuleManager.js';
import { ClientVoiceManager } from '../voice/ClientVoiceManager.js';
import { createWebhookHandler } from '../webhooks/EventWebhook.js';
import { ChannelManager } from '../managers/ChannelManager.js';
import { ServerManager } from '../managers/ServerManager.js';
import { UserManager } from '../managers/UserManager.js';
import { ClientUser } from '../structures/ClientUser.js';
import { ButtonInteraction } from '../structures/Interaction.js';
import { Message } from '../structures/Message.js';
import { MessageReaction } from '../structures/MessageReaction.js';
import { ServerMember } from '../structures/ServerMember.js';
import { ErrorCodes, YapinError, tagError } from '../errors/index.js';
import { DefaultBaseURL, DefaultGatewayURL, Events, GatewayEventTypes } from '../util/Constants.js';
import { resolveLogger } from '../util/Logger.js';
import { backoff, mergeDefault, sleep } from '../util/util.js';

export const DefaultClientOptions = Object.freeze({
  token: undefined,
  baseURL: DefaultBaseURL,
  gatewayURL: DefaultGatewayURL,
  /** 'auto' (gateway when possible, else long polling), 'gateway' or 'polling'. */
  transport: 'auto',
  /** Event types to receive (see Intents). null: all of them. */
  intents: null,
  /** Command prefixes, or a function (message) => prefixes for per-server ones. */
  prefixes: ['/', '!'],
  /** Skip messages from other bots and webhooks, so two bots can't answer each other forever. */
  ignoreBots: true,
  /** Skip events older than this many seconds when catching up after a restart. */
  maxEventAge: null,
  /** Where to keep the event cursor between restarts: a file path or { get, set }. */
  sequenceStore: null,
  /** Set at login: { status: 'online' | 'idle' | 'dnd', activity }. */
  presence: null,
  rest: { timeout: 30_000, retries: 3, maxRetryAfter: 60 },
  /** Cache sizes. Messages are per channel. */
  cache: { messages: 100, users: Infinity, members: Infinity },
  commands: {
    autoSync: true,
    registerAliases: false,
    replyOnError: true,
    errorMessage: 'Something went wrong running that command.',
    formatError: null,
    caseSensitive: false,
    mentionPrefix: true,
    help: false,
    owners: [],
    ownersBypassCooldowns: true,
  },
  components: { autoAck: true, autoAckAfter: 2500 },
  voice: { rtc: null },
  logger: undefined,
  WebSocket: undefined,
  fetch: undefined,
});

function resolveOptions(options) {
  const merged = mergeDefault(DefaultClientOptions, options);
  if (options.gateway === false) merged.transport = 'polling';
  if (typeof options.gateway === 'string') merged.gatewayURL = options.gateway;
  if (merged.intents) merged.intents = [...new Set([merged.intents].flat(Infinity))];
  if (typeof merged.prefixes === 'string') merged.prefixes = [merged.prefixes];
  if (options.prefix) merged.prefixes = [].concat(options.prefix);
  return merged;
}

const RECENT_EVENTS = 5000;

/**
 * The bot. Connects to Yapin’, keeps caches, and turns events into structures and Client events.
 *
 *   import { Client, Events } from 'yapin.js';
 *   const client = new Client();
 *   client.on(Events.MessageCreate, (message) => { if (message.mentioned) message.reply('hi!'); });
 *   client.commands.register({ name: 'ping', description: 'Pong!', run: (ctx) => ctx.reply('pong') });
 *   await client.login(process.env.YAPIN_TOKEN);
 */
export class Client extends EventEmitter {
  #loggingIn = null;

  constructor(options = {}) {
    super({ captureRejections: true });
    this.setMaxListeners(100);
    this.options = resolveOptions(options);
    this.logger = resolveLogger(this.options.logger);
    Object.defineProperty(this, 'token', { value: null, writable: true, enumerable: false });
    this.rest = new REST({ ...this.options.rest, baseURL: this.options.baseURL, fetch: this.options.fetch });
    this.rest.on('rateLimited', (info) => this.emit(Events.RateLimited, info));

    /** The bot's own account, after login. */
    this.user = null;
    /** { id, name, public, ownerId }, after login. */
    this.application = null;
    this.readyAt = null;

    this.users = new UserManager(this);
    this.servers = new ServerManager(this);
    this.channels = new ChannelManager(this);
    this.commands = new CommandHandler(this);
    this.components = new ComponentRouter(this);
    this.modules = new ModuleManager(this);
    this.voice = new ClientVoiceManager(this);
    this.stream = new EventStream(this);
    this.sequenceStore = resolveSequenceStore(this.options.sequenceStore);

    this._pending = new Set();
    this._recent = new Set();
    this._recentOrder = [];
  }

  /** discord.js name for `servers`. */
  get guilds() {
    return this.servers;
  }

  isReady() {
    return this.readyAt !== null;
  }

  get readyTimestamp() {
    return this.readyAt?.getTime() ?? null;
  }

  get uptime() {
    return this.readyAt ? Date.now() - this.readyAt.getTime() : null;
  }

  /** Heartbeat round trip over the gateway in ms (null while polling). */
  get ping() {
    return this.stream.ping;
  }

  /** 'gateway' or 'polling' (null when not connected). */
  get transport() {
    return this.stream.transport;
  }

  emit(event, ...args) {
    if (event === Events.Error && this.listenerCount(Events.Error) === 0) {
      const [error] = args;
      const where = [error?.module && `module ${error.module}`, error?.command && `/${error.command}`, error?.where].filter(Boolean).join(' ');
      this.logger.error(...(where ? [`[${where}]`] : []), error);
      return false;
    }
    if (event === Events.Warn && this.listenerCount(Events.Warn) === 0) this.logger.warn(args[0]);
    if (event === Events.Debug) this.logger.debug(args[0]);
    return super.emit(event, ...args);
  }

  /** Async listeners that reject land here (EventEmitter captureRejections) and go to 'error'. */
  [Symbol.for('nodejs.rejection')](error, event) {
    if (event === Events.Error) {
      this.logger.error('An error listener threw:', error);
      return;
    }
    this._reportError(error, { where: event });
  }

  _reportError(error, tags = {}) {
    const err = tagError(error, tags);
    try {
      this.emit(Events.Error, err);
    } catch (listenerError) {
      this.logger.error('An error listener threw:', listenerError);
    }
  }

  /** Waits for loads started without await (modules.load, commands.load) before login syncs commands. */
  _track(promise) {
    this._pending.add(promise);
    const done = () => this._pending.delete(promise);
    promise.then(done, done);
    return promise;
  }

  /**
   * Connects. Resolves once the bot is ready (commands registered, events flowing); the bot then
   * keeps running until `destroy()`. The token defaults to YAPIN_TOKEN or YAPPER_BOT_TOKEN (Yapin’
   * bot hosting sets the latter for you).
   */
  login(token = this.options.token ?? process.env.YAPIN_TOKEN ?? process.env.YAPPER_BOT_TOKEN) {
    if (this.#loggingIn) return Promise.reject(new YapinError(ErrorCodes.AlreadyLoggedIn, 'login() was already called'));
    this.#loggingIn = this.#login(token).catch((error) => {
      this.#loggingIn = null;
      throw error;
    });
    return this.#loggingIn;
  }

  async #login(rawToken) {
    const token = String(rawToken ?? '').trim();
    if (!token) throw new YapinError(ErrorCodes.TokenMissing, 'No token: pass it to login() or set YAPIN_TOKEN. Get one in Settings → Developer.');
    if (!token.startsWith('yb_')) throw new YapinError(ErrorCodes.TokenInvalid, 'Bot tokens start with yb_. Get one in Settings → Developer → your bot → Token.');
    this.token = token;
    this.rest.setToken(token);

    if (this._pending.size) await Promise.all([...this._pending]);
    this.emit(Events.Debug, '[client] logging in');

    // Network blips and server hiccups are retried; a bad token or bad command list stops right away.
    const fatal = (error) => error.status >= 400 && error.status < 500 && error.status !== 429;
    for (let attempt = 1; ; attempt++) {
      try {
        const me = await this.rest.get(Routes.me());
        this.user = new ClientUser(this, me);
        this.users.cache.set(this.user.id, this.user);
        this.application = {
          id: me.id,
          name: me.bot?.name ?? me.username,
          public: Boolean(me.bot?.public),
          ownerId: me.bot?.owner_id ?? null,
        };
        if (this.options.commands.autoSync !== false) await this.commands.sync({ force: true });
        break;
      } catch (error) {
        if (error.status === 401) {
          this.token = null;
          throw new YapinError(ErrorCodes.TokenInvalid, 'Token rejected: check it, or make a new one in Settings → Developer', { cause: error });
        }
        if (fatal(error) || attempt >= 8) throw error;
        this.emit(Events.Warn, `Login failed (${error.message}), retrying`);
        await sleep(backoff(attempt));
      }
    }

    let seq = 0;
    try {
      seq = Number(await this.sequenceStore?.get()) || 0;
    } catch (error) {
      this.emit(Events.Warn, `Couldn't read the event cursor: ${error.message}`);
    }
    if (!seq) {
      const out = await this.rest.get(Routes.events(), { query: { after: 0, wait: 0 } });
      seq = out.last ?? 0;
    } else {
      this.emit(Events.Debug, `[client] catching up from event ${seq}`);
    }

    if (this.options.presence) {
      this.user.setPresence(this.options.presence).catch((e) => this.emit(Events.Warn, `Couldn't set presence: ${e.message}`));
    }
    this.readyAt = new Date();
    this.stream.start(seq);
    this.logger.info(`${this.user.displayName} is online${this.commands.size ? ` with ${this.commands.size} command${this.commands.size === 1 ? '' : 's'}` : ''}`);
    this.emit(Events.ClientReady, this);
    return token;
  }

  /** Disconnects, leaves voice, and saves the event cursor. */
  async destroy() {
    this.readyAt = null;
    await this.stream.stop();
    clearTimeout(this.commands._syncTimer);
    await this.voice.destroy();
    await this.sequenceStore?.flush?.();
    this.#loggingIn = null;
    this.token = null;
    this.rest.setToken(null);
  }

  /** Shorthand: client.send(channelId, 'hi'). */
  send(channel, payload) {
    return this.channels.send(channel, payload);
  }

  /** Shorthand for commands.register: client.command('ping', 'Pong!', (ctx) => ctx.reply('pong')). */
  command(name, description, run) {
    if (typeof name === 'object') return this.commands.register(name);
    if (typeof description === 'function') return this.commands.register({ name, run: description });
    return this.commands.register({ name, description, run });
  }

  /** Shorthand for components.button. */
  button(pattern, handler) {
    return this.components.button(pattern, handler);
  }

  /** A Node (req, res) handler for event webhooks. See docs/webhooks.md. */
  webhookHandler(options) {
    return createWebhookHandler(this, options);
  }

  #seen(id) {
    if (id === undefined || id === null) return false;
    if (this._recent.has(id)) return true;
    this._recent.add(id);
    this._recentOrder.push(id);
    if (this._recentOrder.length > RECENT_EVENTS) this._recent.delete(this._recentOrder.shift());
    return false;
  }

  _ingestWebhook(event) {
    if (!event?.type || !(event.id > this.stream.seq)) return;
    this._dispatch(event);
  }

  /** One raw event → structures and Client events. Synchronous, so events keep their order. */
  _dispatch(event) {
    const { type } = event;
    const data = event.data ?? {};
    if (this.#seen(event.id)) return;
    if (this.options.intents && !this.options.intents.includes(type)) return;
    try {
      this.emit(Events.Raw, event);
      switch (type) {
        case GatewayEventTypes.Message:
          return this.#onMessage(data);
        case GatewayEventTypes.MemberJoin:
          return this.#onMemberJoin(data);
        case GatewayEventTypes.MemberLeave:
          return this.#onMemberLeave(data);
        case GatewayEventTypes.ReactionAdd:
        case GatewayEventTypes.ReactionRemove: {
          const reaction = new MessageReaction(this, data);
          const user = this.users._add({ id: data.user_id, username: data.username });
          return this.emit(type === GatewayEventTypes.ReactionAdd ? Events.MessageReactionAdd : Events.MessageReactionRemove, reaction, user);
        }
        case GatewayEventTypes.Interaction: {
          const interaction = new ButtonInteraction(this, data);
          this.components._handle(interaction);
          return this.emit(Events.InteractionCreate, interaction);
        }
        case GatewayEventTypes.VoiceJoin:
          return this.emit(Events.VoiceJoin, this.servers._ensure(data.server_id).voice._join(data));
        case GatewayEventTypes.VoiceLeave:
          return this.emit(Events.VoiceLeave, this.servers._ensure(data.server_id).voice._leave(data));
        case GatewayEventTypes.Test:
          return this.emit(Events.Test, data);
        default:
          this.emit(Events.Debug, `[client] unhandled event type "${type}" (see the raw event)`);
      }
    } catch (error) {
      this._reportError(error, { where: type });
    }
  }

  #onMessage(data) {
    if (this.options.ignoreBots && data.author_bot) return;
    if (this.user && data.author_id === this.user.id) return;
    const serverId = data.server_id ?? null;
    const channel = this.channels._ensure(data.channel_id, serverId ? { server_id: serverId } : { server_id: null, type: 'dm' });
    if (data.channel_name && !channel.name) channel.name = data.channel_name;
    const message = channel.messages ? channel.messages._add(data) : new Message(this, data, channel);
    this.emit(Events.MessageCreate, message);
    this.commands._handleMessage(message, data).catch((error) => this._reportError(error, { where: 'commands' }));
  }

  #onMemberJoin(data) {
    const server = this.servers._ensure(data.server_id);
    if (typeof data.member_count === 'number') server.memberCount = data.member_count;
    const member = server.members._add({ id: data.user_id, username: data.username, joined_at: data.joined_at });
    this.emit(Events.ServerMemberAdd, member);
  }

  #onMemberLeave(data) {
    const server = this.servers._ensure(data.server_id);
    if (typeof data.member_count === 'number') server.memberCount = data.member_count;
    const member = server.members.cache.get(data.user_id) ?? new ServerMember(this, { id: data.user_id, username: data.username }, server);
    server.members.cache.delete(data.user_id);
    server.voice.states.delete(data.user_id);
    this.emit(Events.ServerMemberRemove, member);
  }
}
