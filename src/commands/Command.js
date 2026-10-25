import { Collection } from '../util/Collection.js';
import { Limits } from '../util/Constants.js';
import { fail } from '../builders/validation.js';

const NAME = /^[a-z0-9_-]{1,32}$/;

function normalizeOption(option, commandName) {
  if (typeof option === 'string') option = { name: option };
  const name = String(option.name ?? '');
  if (!name) fail(`Command /${commandName}: every option needs a name`);
  return {
    type: 'string',
    required: false,
    rest: false,
    ...option,
    name,
    description: option.description ?? '',
  };
}

function normalizeCooldown(cooldown) {
  if (!cooldown) return null;
  if (typeof cooldown === 'number') return { duration: cooldown * 1000, scope: 'user', uses: 1 };
  const duration = cooldown.ms ?? (cooldown.seconds ?? 0) * 1000;
  if (!(duration > 0)) fail('A cooldown needs `seconds` (or `ms`), like { seconds: 10, scope: "user", uses: 2 }');
  return { duration, scope: cooldown.scope ?? 'user', uses: cooldown.uses ?? 1 };
}

/**
 * A command, made from a plain definition:
 *
 *   {
 *     name: 'ban', description: 'Ban someone', aliases: ['b'], category: 'Moderation',
 *     options: [{ name: 'member', type: 'member', required: true }, { name: 'reason', rest: true }],
 *     serverOnly: true, permissions: ['ban_members'], cooldown: 5,
 *     async run(ctx) { … },
 *   }
 *
 * See docs/commands.md for every field.
 */
export class Command {
  constructor(definition, { owner = null, file = null, parent = null } = {}) {
    const def = definition.data && !definition.name ? { ...definition.data, ...definition, data: undefined } : definition;
    const name = String(def.name ?? '').toLowerCase().replace(/^[/!]/, '');
    if (!NAME.test(name)) fail(`Bad command name "${def.name}": 1 to 32 lowercase letters, numbers, - or _`);
    this.name = name;
    this.description = String(def.description ?? '').slice(0, Limits.CommandDescription);
    this.aliases = (def.aliases ?? []).map((a) => String(a).toLowerCase());
    for (const alias of this.aliases) if (!NAME.test(alias)) fail(`Command /${name}: bad alias "${alias}"`);
    this.category = def.category ?? owner?.name ?? null;
    this.options = (def.options ?? def.args ?? []).map((o) => normalizeOption(o, name));
    const restIndex = this.options.findIndex((o) => o.rest);
    if (restIndex !== -1 && restIndex !== this.options.length - 1) fail(`Command /${name}: only the last option can be "rest"`);
    this.examples = def.examples ?? [];
    this.serverOnly = Boolean(def.serverOnly ?? def.guildOnly);
    this.dmOnly = Boolean(def.dmOnly);
    this.ownerOnly = Boolean(def.ownerOnly);
    this.permissions = def.permissions ?? [];
    this.roles = def.roles ?? [];
    this.checks = [].concat(def.checks ?? def.check ?? []);
    this.cooldown = normalizeCooldown(def.cooldown);
    this.hidden = Boolean(def.hidden);
    /** false: answers to prefixes but isn't listed in the "/" menu. */
    this.register = def.register !== false && !this.hidden;
    this.run = def.run ?? def.execute ?? null;
    this.owner = owner;
    this.file = file;
    this.parent = parent;
    this.subcommands = new Collection();
    for (const sub of def.subcommands ?? []) {
      const command = sub instanceof Command ? sub : new Command(sub, { owner, file, parent: this });
      command.parent = this;
      this.subcommands.set(command.name, command);
    }
    if (!this.run && !this.subcommands.size) fail(`Command /${name} needs a run(ctx) function (or subcommands)`);
    this.definition = def;
  }

  /** 'config set' for a subcommand. */
  get path() {
    return this.parent ? `${this.parent.path} ${this.name}` : this.name;
  }

  findSubcommand(name) {
    const n = String(name).toLowerCase();
    return this.subcommands.get(n) ?? this.subcommands.find((c) => c.aliases.includes(n)) ?? null;
  }

  /** '/ban <member> [reason...]' */
  usage(prefix = '/') {
    const parts = [`${prefix}${this.path}`];
    if (this.subcommands.size && !this.options.length) parts.push(`<${this.subcommands.map((s) => s.name).join('|')}>`);
    for (const o of this.options) {
      const label = o.choices ? o.choices.map((c) => (typeof c === 'object' ? c.name : c)).join('|') : o.name;
      const text = `${label}${o.rest ? '...' : ''}`;
      parts.push(o.required ? `<${text}>` : `[${text}]`);
    }
    return parts.join(' ');
  }

  /** What's sent to Yapin’ for the "/" menu. */
  toJSON() {
    return { name: this.name, description: this.description };
  }
}
