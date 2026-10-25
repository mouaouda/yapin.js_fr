import { ArgumentError } from '../errors/index.js';

const QUOTES = { '"': '"', "'": "'", '“': '”', '‘': '’', '«': '»' };

/**
 * Splits a command line into words. Quotes group words ("two words"), a backslash escapes the
 * next character. Each token keeps where it started, so a `rest` option can take the raw remainder.
 */
export function tokenize(input) {
  const tokens = [];
  let i = 0;
  const text = String(input ?? '');
  while (i < text.length) {
    while (i < text.length && /\s/.test(text[i])) i++;
    if (i >= text.length) break;
    const start = i;
    let value = '';
    const close = QUOTES[text[i]];
    if (close) {
      i++;
      while (i < text.length && text[i] !== close) {
        if (text[i] === '\\' && i + 1 < text.length) i++;
        value += text[i++];
      }
      if (i < text.length) i++;
      tokens.push({ value, start, end: i, quoted: true });
      continue;
    }
    while (i < text.length && !/\s/.test(text[i])) {
      if (text[i] === '\\' && i + 1 < text.length) i++;
      value += text[i++];
    }
    tokens.push({ value, start, end: i, quoted: false });
  }
  return tokens;
}

/** `ctx.options`: the parsed values, read with get(name) or the discord.js-style getters. */
export class OptionResolver {
  constructor(values = {}) {
    this.values = values;
  }

  get(name, required = false) {
    const value = this.values[name];
    if (required && (value === undefined || value === null)) {
      throw new ArgumentError(`\`${name}\` is required`, { option: name, reason: 'missing' });
    }
    return value ?? null;
  }

  has(name) {
    return this.values[name] !== undefined && this.values[name] !== null;
  }

  getString(name, required) { return this.get(name, required); }
  getInteger(name, required) { return this.get(name, required); }
  getNumber(name, required) { return this.get(name, required); }
  getBoolean(name, required) { return this.get(name, required); }
  getUser(name, required) { return this.get(name, required); }
  getMember(name, required) { return this.get(name, required); }
  getChannel(name, required) { return this.get(name, required); }
  getRole(name, required) { return this.get(name, required); }
  getDuration(name, required) { return this.get(name, required); }

  toJSON() {
    return { ...this.values };
  }
}

function matchChoice(option, value) {
  const choices = option.choices.map((c) => (typeof c === 'object' ? c : { name: String(c), value: c }));
  const wanted = String(value).toLowerCase();
  const hit = choices.find((c) => c.name.toLowerCase() === wanted || String(c.value).toLowerCase() === wanted);
  if (!hit) {
    throw new ArgumentError(`\`${option.name}\` must be one of: ${choices.map((c) => `\`${c.name}\``).join(', ')}`, { option: option.name, value });
  }
  return hit.value;
}

/**
 * Reads `args` against a command's options, in order. Missing required options, bad values and
 * unknown choices throw ArgumentErrors that tell the person what's wrong.
 */
export async function parseArguments(ctx, command, types) {
  const tokens = tokenize(ctx.args);
  ctx.argv = tokens.map((t) => t.value);
  const values = {};
  let index = 0;
  for (const option of command.options) {
    const type = types.get(option.type);
    if (!type) throw new Error(`Command /${command.name}: option "${option.name}" has an unknown type "${option.type}"`);
    if (option.rest) {
      const restTokens = tokens.slice(index);
      index = tokens.length;
      if (!restTokens.length) {
        values[option.name] = await missing(ctx, command, option);
        continue;
      }
      if (option.type === 'string') {
        const raw = ctx.args.slice(restTokens[0].start).trim();
        values[option.name] = option.choices ? matchChoice(option, raw) : await type.resolve(raw, ctx, option);
      } else {
        values[option.name] = [];
        for (const t of restTokens) values[option.name].push(await type.resolve(t.value, ctx, option));
      }
      continue;
    }
    const token = tokens[index];
    if (!token) {
      values[option.name] = await missing(ctx, command, option);
      continue;
    }
    index++;
    let value = await type.resolve(token.value, ctx, option);
    if (option.choices) value = matchChoice(option, value);
    if (option.validate) {
      const verdict = await option.validate(value, ctx);
      if (verdict !== true && verdict !== undefined) {
        throw new ArgumentError(typeof verdict === 'string' ? verdict : `\`${option.name}\` isn't valid`, { option: option.name, value: token.value });
      }
    }
    values[option.name] = value;
  }
  return values;
}

async function missing(ctx, command, option) {
  if (option.default !== undefined) return typeof option.default === 'function' ? option.default(ctx) : option.default;
  if (option.required) {
    throw new ArgumentError(`Missing \`${option.name}\`. Usage: \`${command.usage(ctx.prefix)}\``, { option: option.name, reason: 'missing' });
  }
  return null;
}
