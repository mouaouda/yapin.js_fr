import { EmbedBuilder } from '../builders/EmbedBuilder.js';
import { validateLayout } from '../builders/components.js';
import { checkCount, checkLength, fail } from '../builders/validation.js';
import { ComponentType, Limits, MessageFlags } from './Constants.js';
import { resolveId, toJSON } from './util.js';

const isV2Component = (c) => typeof c?.type === 'number' && c.type !== ComponentType.ActionRow && c.type !== ComponentType.Button;

/**
 * Turns whatever was passed to send / reply / edit into an API body.
 *
 * - `'hi'` → `{ content: 'hi' }`
 * - an EmbedBuilder (or array of them) → `{ embeds: [...] }`
 * - `{ content, embeds, components, replyTo, flags }`
 *
 * Components V2 is detected: a top-level container, section, text display… sets the IS_COMPONENTS_V2 flag,
 * and `content` is moved into a leading text display (V2 messages can't have content).
 * `null` for content / embeds / components (edits only) removes them.
 */
export function resolvePayload(input, { edit = false } = {}) {
  const options = toPayloadOptions(input);
  const body = {};
  if (options.content !== undefined) {
    body.content = options.content === null ? null : checkLength(options.content, Limits.MessageContent, 'Message content');
  }
  if (options.embeds !== undefined) {
    body.embeds = options.embeds === null ? null : [].concat(options.embeds).map(toJSON);
    if (body.embeds) checkCount(body.embeds.length, Limits.EmbedsPerMessage, 'embeds in a message');
  }
  if (options.components !== undefined) {
    body.components = options.components === null ? null : [].concat(options.components).map(toJSON);
  }

  let flags = options.flags ?? 0;
  if (body.components?.some(isV2Component)) flags |= MessageFlags.IsComponentsV2;
  if (flags & MessageFlags.IsComponentsV2) {
    if (body.embeds?.length) fail('Components V2 messages cannot have embeds: put the content in containers and text displays');
    if (typeof body.content === 'string' && body.content.length) {
      body.components = [{ type: ComponentType.TextDisplay, content: body.content }, ...(body.components ?? [])];
    }
    delete body.content;
    delete body.embeds;
    if (body.components) validateLayout(body.components);
  } else if (body.components) {
    checkCount(body.components.length, Limits.ActionRowsPerMessage, 'button rows in a message');
  }
  if (flags) body.flags = flags;

  if (!edit) {
    const replyTo = resolveId(options.replyTo ?? options.reply?.messageReference ?? options.reply_to);
    if (replyTo) body.reply_to = replyTo;
  }
  return body;
}

/** 'hi' / an embed / [embeds] / { … } → an options object (a copy, safe to add to). */
export function toPayloadOptions(input) {
  if (input === undefined || input === null) fail('Nothing to send: pass text or { content, embeds, components }');
  if (typeof input === 'string' || typeof input === 'number') return { content: String(input) };
  if (input instanceof EmbedBuilder) return { embeds: [input] };
  if (Array.isArray(input)) return { embeds: input };
  if (typeof input.toJSON === 'function') return { components: [input] };
  return { ...input };
}

/** The IS_COMPONENTS_V2 check for a message body or a message's components. */
export const isComponentsV2 = (components) => Array.isArray(components) && components.some(isV2Component);
