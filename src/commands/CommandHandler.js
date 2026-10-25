import { Routes } from '../rest/Routes.js';
import { Collection } from '../util/Collection.js';
import { Events, Limits } from '../util/Constants.js';
import { CooldownError, ErrorCodes, PreconditionError, UserError, YapinError, tagError } from '../errors/index.js';
import { importFile, listFiles, locate } from '../util/loader.js';
import { formatDuration } from '../util/util.js';
import { OptionResolver, parseArguments, tokenize } from './ArgumentParser.js';
import { ArgumentTypeRegistry } from './ArgumentTypes.js';
import { Command } from './Command.js';
import { CommandContext } from './CommandContext.js';
import { CooldownManager } from './Cooldowns.js';
import { createHelpCommand } from './HelpCommand.js';

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Command definitions out of a command file's exports. */
function definitionsFrom(mod) {
  const picked = mod.default ?? mod.command ?? mod.commands ?? (mod.data || mod.name ? mod : null);
  if (!picked) return [];
  if (Array.isArray(picked)) return picked;
  if (picked.data && (picked.execute || picked.run)) return [{ ...picked.data, ...picked, data: undefined }];
  if (mod.data && !mod.default && (mod.execute || mod.run)) return [{ ...mod.data, run: mod.run ?? mod.execute }];
  return [picked];
}

/**
 * `client.commands`: registers commands with Yapin’ (they show up in the "/" menu), matches messages
 * to them, checks preconditions and cooldowns, parses arguments, and runs them.
 *
 *   client.commands.register({ name: 'ping', description: 'Pong!', run: (ctx) => ctx.reply('pong') });
 *   await client.commands.load('./commands');
 *   client.commands.use(async (ctx, next) => { const t = Date.now(); await next(); console.log(ctx.command.name, Date.now() - t); });
 */
export class CommandHandler {
  #version = 0;

  constructor(client) {
    Object.defineProperty(this, 'client', { value: client });
    this.registry = new Collection();
    /** alias → command name */
    this.aliases = new Map();
    /** Option types: add your own with types.register(name, resolve). */
    this.types = new ArgumentTypeRegistry();
    this.cooldowns = new CooldownManager();
    this.middleware = [];
    /** file path → { version } for hot reload. */
    this.files = new Map();
    this._synced = null;
    this._syncTimer = null;
    const help = this.options.help;
    if (help) this.register(createHelpCommand(this, typeof help === 'object' ? help : {}));
  }

  get options() {
    return this.client.options.commands;
  }

  get size() {
    return this.registry.size;
  }

  /** register(definition) or register([definitions]). Returns the Command (or Commands). */
  register(definition, { owner = null, file = null } = {}) {
    if (Array.isArray(definition)) return definition.map((d) => this.register(d, { owner, file }));
    const command = definition instanceof Command ? definition : new Command(definition, { owner, file });
    if (definition instanceof Command) {
      command.owner ??= owner;
      command.file ??= file;
    }
    const conflict = (message) => new YapinError(ErrorCodes.CommandConflict, message);
    const where = (c) => c.owner?.label ?? c.file ?? 'your main file';
    // Registering the same name again from the same place (main file, module or file) replaces it.
    const existing = this.registry.get(command.name);
    if (existing && (existing.owner !== command.owner || existing.file !== command.file)) {
      throw conflict(`/${command.name} is in both ${where(existing)} and ${where(command)}. Rename one of them.`);
    }
    const aliasOf = this.aliases.get(command.name);
    if (aliasOf && aliasOf !== command.name) throw conflict(`/${command.name} is already an alias of /${aliasOf}`);
    for (const alias of command.aliases) {
      const holder = this.registry.has(alias) ? alias : this.aliases.get(alias);
      if (holder && holder !== command.name) throw conflict(`Alias "${alias}" of /${command.name} is already taken by /${holder}`);
    }
    if (existing) this.unregister(existing.name, { sync: false });
    const registered = [...this.registry.values()].filter((c) => c.register).length + (command.register ? 1 : 0);
    if (registered > Limits.Commands) {
      throw new YapinError(ErrorCodes.CommandLimit, `Up to ${Limits.Commands} commands per bot; /${command.name} is one too many (use register: false for prefix-only commands)`);
    }
    this.registry.set(command.name, command);
    for (const alias of command.aliases) this.aliases.set(alias, command.name);
    this.scheduleSync();
    return command;
  }

  /** A command by name or alias. */
  get(name) {
    const n = String(name ?? '').toLowerCase().replace(/^[/!]/, '');
    return this.registry.get(n) ?? this.registry.get(this.aliases.get(n)) ?? null;
  }

  has(name) {
    return this.get(name) !== null;
  }

  unregister(name, { sync = true } = {}) {
    const command = this.get(name);
    if (!command) return false;
    this.registry.delete(command.name);
    for (const alias of command.aliases) if (this.aliases.get(alias) === command.name) this.aliases.delete(alias);
    if (sync) this.scheduleSync();
    return true;
  }

  /** Removes every command a module (or file) added. */
  _removeWhere(fn) {
    for (const command of [...this.registry.values()]) if (fn(command)) this.unregister(command.name, { sync: false });
    this.scheduleSync();
  }

  /** Middleware around every command: `use(async (ctx, next) => { …; await next(); … })`. */
  use(fn) {
    if (typeof fn !== 'function') throw new TypeError('use() takes a function (ctx, next) => …');
    this.middleware.push(fn);
    return this;
  }

  /**
   * Loads command files: one file, or a folder (subfolders too; names starting with _ are skipped).
   * A file exports a definition: `export default { name, description, run }` (or an array of them,
   * or discord.js-style `export const data = {…}; export function execute(ctx) {}`).
   */
  load(target, { recursive = true } = {}) {
    return this.client._track((async () => {
      const found = await locate(target);
      const files = found.isDirectory ? await listFiles(found.path, { recursive }) : [found.path];
      const names = [];
      for (const file of files) names.push(...(await this.#loadFile(file, 0)));
      return names;
    })());
  }

  async #loadFile(file, version) {
    const { url, label, path } = await locate(file);
    let mod;
    try {
      mod = await importFile(url, version);
    } catch (cause) {
      throw new YapinError(ErrorCodes.ModuleLoadFailed, `Couldn't load ${label}: ${cause.message}`, { cause });
    }
    const definitions = definitionsFrom(mod);
    if (!definitions.length) throw new YapinError(ErrorCodes.ModuleLoadFailed, `${label} doesn't export a command (export default { name, run })`);
    const names = [];
    for (const def of definitions) names.push(this.register(def, { file: path }).name);
    this.files.set(path, { version, label, url });
    return names;
  }

  /** Reads a command's file again: edit it, then `await client.commands.reload('ping')`. */
  async reload(name) {
    const command = this.get(name);
    if (!command?.file) throw new YapinError(ErrorCodes.ModuleNotFound, `/${name} wasn't loaded from a file`);
    const file = command.file;
    const previous = [...this.registry.values()].filter((c) => c.file === file);
    this._removeWhere((c) => c.file === file);
    try {
      return await this.#loadFile(file, ++this.#version);
    } catch (error) {
      for (const c of previous) this.register(c);
      throw error;
    }
  }

  /** What Yapin’ gets for the "/" menu. */
  toJSON() {
    const list = [];
    for (const command of this.registry.values()) {
      if (!command.register) continue;
      list.push(command.toJSON());
      if (this.options.registerAliases) {
        for (const alias of command.aliases) list.push({ name: alias, description: `Same as /${command.name}` });
      }
    }
    return list.slice(0, Limits.Commands);
  }

  /** Sends the command list to Yapin’ if it changed (login does this for you). */
  async sync({ force = false } = {}) {
    clearTimeout(this._syncTimer);
    this._syncTimer = null;
    const commands = this.toJSON();
    const json = JSON.stringify(commands);
    if (!force && json === this._synced) return commands;
    await this.client.rest.put(Routes.commands(), { body: { commands } });
    this._synced = json;
    this.client.emit(Events.CommandsSynced, commands);
    this.client.emit(Events.Debug, `[commands] synced ${commands.length} command${commands.length === 1 ? '' : 's'}`);
    return commands;
  }

  /** Commands changed while running: send the new list once things settle. */
  scheduleSync() {
    if (!this.client.isReady() || this.options.autoSync === false) return;
    clearTimeout(this._syncTimer);
    this._syncTimer = setTimeout(() => {
      this.sync().catch((e) => this.client._reportError(e, { where: 'command sync' }));
    }, 1000);
    this._syncTimer.unref?.();
  }

  /** The list Yapin’ has right now. */
  async fetchRemote() {
    const out = await this.client.rest.get(Routes.commands());
    return out.commands ?? [];
  }

  async #prefixes(message) {
    const option = this.client.options.prefixes;
    const list = typeof option === 'function' ? await option(message) : option;
    return [].concat(list ?? []).filter(Boolean).sort((a, b) => b.length - a.length);
  }

  #byName(text, prefix) {
    const m = /^(\S+)(?:\s+([\s\S]*))?$/.exec(text);
    if (!m) return null;
    const name = this.options.caseSensitive ? m[1] : m[1].toLowerCase();
    const command = this.options.caseSensitive ? this.registry.get(name) ?? this.registry.get(this.aliases.get(name)) : this.get(name);
    return command ? { command, name, args: (m[2] ?? '').trim(), prefix } : null;
  }

  async #match(message, data) {
    // "/fish @OtherBot": the person picked another bot's /fish, not ours.
    if (Array.isArray(data.command_for) && this.client.user && !data.command_for.includes(this.client.user.id)) return null;
    const content = message.content ?? '';
    if (data.command) {
      const command = this.get(data.command);
      if (command) return { command, name: String(data.command).toLowerCase(), args: String(data.args ?? '').trim(), prefix: /^[/!]/.test(content) ? content[0] : '/' };
    }
    if (this.options.mentionPrefix !== false && this.client.user) {
      const mention = new RegExp(`^<@!?${escapeRegExp(this.client.user.id)}>\\s*`).exec(content);
      if (mention) return this.#byName(content.slice(mention[0].length), mention[0]);
    }
    for (const prefix of await this.#prefixes(message)) {
      if (content.startsWith(prefix)) {
        const hit = this.#byName(content.slice(prefix.length), prefix);
        if (hit) return hit;
      }
    }
    return null;
  }

  /** Called for every message; runs the command it invokes, if any. */
  async _handleMessage(message, data) {
    if (!this.registry.size) return;
    let match;
    try {
      match = await this.#match(message, data);
    } catch (error) {
      this.client._reportError(error, { where: 'prefix resolver' });
      return;
    }
    if (!match) return;
    let { command, args } = match;
    while (command.subcommands.size) {
      const [first] = tokenize(args);
      const sub = first && command.findSubcommand(first.value);
      if (!sub) break;
      command = sub;
      args = args.slice(first.end).trim();
    }
    const ctx = new CommandContext({
      client: this.client,
      message,
      command,
      prefix: match.prefix.startsWith('<@') ? '/' : match.prefix,
      commandName: match.name,
      args,
    });
    try {
      await this.#compose(ctx, () => this.#execute(ctx));
    } catch (error) {
      await this.#handleError(ctx, error);
    }
  }

  async #compose(ctx, last) {
    let index = -1;
    const dispatch = async (i) => {
      if (i <= index) throw new Error('next() called twice in command middleware');
      index = i;
      const fn = i === this.middleware.length ? last : this.middleware[i];
      if (!fn) return;
      await fn(ctx, () => dispatch(i + 1));
    };
    await dispatch(0);
  }

  async #execute(ctx) {
    const { command } = ctx;
    if (!command.run) {
      throw new UserError(`Pick a subcommand: \`${command.usage(ctx.prefix)}\``, { identifier: 'MissingSubcommand' });
    }
    await this.#checkPreconditions(ctx);
    ctx.options = new OptionResolver(await parseArguments(ctx, command, this.types));
    if (command.cooldown && !(this.options.ownersBypassCooldowns !== false && this.#isOwner(ctx.authorId))) {
      const remaining = this.cooldowns.take(command, ctx);
      if (remaining > 0) {
        throw new CooldownError(`Slow down! You can use \`${ctx.prefix}${command.path}\` again in ${formatDuration(Math.max(remaining, 1000))}.`, { remaining });
      }
    }
    this.client.emit(Events.CommandRun, ctx);
    await command.run.call(command.definition, ctx);
    this.client.emit(Events.CommandSuccess, ctx, Date.now() - ctx.startedAt);
  }

  #isOwner(userId) {
    return userId === this.client.application?.ownerId || (this.options.owners ?? []).includes(userId);
  }

  async #checkPreconditions(ctx) {
    const commands = [];
    for (let c = ctx.command; c; c = c.parent) commands.unshift(c);
    for (const command of commands) {
      if (command.serverOnly && !ctx.inServer()) throw new PreconditionError('This command only works in a server.', { precondition: 'serverOnly' });
      if (command.dmOnly && ctx.inServer()) throw new PreconditionError('This command only works in DMs.', { precondition: 'dmOnly' });
      if (command.ownerOnly && !this.#isOwner(ctx.authorId)) throw new PreconditionError('Only the bot owner can use this command.', { precondition: 'ownerOnly' });
      if (command.roles.length || command.permissions.length) {
        if (!ctx.inServer()) throw new PreconditionError('This command only works in a server.', { precondition: 'serverOnly' });
        const [member] = await Promise.all([ctx.fetchMember(), ctx.server.roles.ensure()]);
        if (command.roles.length && !command.roles.some((r) => member.roles.has(r))) {
          const names = command.roles.map((r) => ctx.server.roles.resolve(r)?.name ?? r);
          throw new PreconditionError(`You need one of these roles: ${names.join(', ')}.`, { precondition: 'roles' });
        }
        const missing = member.permissions.missing(command.permissions);
        if (missing.length) {
          throw new PreconditionError(`You need the ${missing.map((p) => `\`${p}\``).join(', ')} permission${missing.length === 1 ? '' : 's'}.`, { precondition: 'permissions' });
        }
      }
      const checks = [...(command.owner?.check ? [command.owner.check] : []), ...command.checks];
      for (const check of checks) {
        const verdict = await check(ctx);
        if (verdict === false) throw new PreconditionError("You can't use this command here.", { precondition: 'check' });
        if (typeof verdict === 'string') throw new PreconditionError(verdict, { precondition: 'check' });
      }
    }
  }

  async #handleError(ctx, error) {
    const client = this.client;
    const userFacing = error instanceof UserError;
    if (userFacing) client.emit(Events.CommandDenied, error, ctx);
    else {
      tagError(error, { command: ctx.command.path, module: ctx.command.owner?.name });
      if (client.listenerCount(Events.CommandError)) client.emit(Events.CommandError, error, ctx);
      else client._reportError(error, { where: `/${ctx.command.path}` });
    }
    if (this.options.replyOnError === false || error?.silent) return;
    let reply;
    if (typeof this.options.formatError === 'function') reply = await this.options.formatError(error, ctx);
    else if (userFacing) reply = error.message;
    else if (error?.status === 403) reply = "I don't have permission to do that here.";
    else if (error?.status === 429) reply = "I'm being rate limited, try again in a moment.";
    else reply = this.options.errorMessage;
    if (!reply) return;
    try {
      await ctx.reply(reply);
    } catch (e) {
      client.emit(Events.Debug, `[commands] couldn't send the error reply: ${e.message}`);
    }
  }

  get names() {
    return [...this.registry.keys()];
  }
}
