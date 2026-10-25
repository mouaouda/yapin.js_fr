import { ButtonStyle, Limits } from '../util/Constants.js';
import { checkLength, checkURL, fail, isValidationEnabled } from './validation.js';

const STYLE_NUMBERS = { 1: 'primary', 2: 'secondary', 3: 'success', 4: 'danger', 5: 'link' };
const STYLES = new Set(Object.values(ButtonStyle));

/**
 *   new ButtonBuilder().setCustomId('vote:yes').setLabel('Yes').setStyle(ButtonStyle.Success)
 *   ButtonBuilder.success('Yes', 'vote:yes')          // shortcut
 *   ButtonBuilder.link('Rules', 'https://example.com') // link buttons open a URL, nothing is sent to the bot
 *
 * Every button needs a label (80) or an emoji. Non-link buttons need a custom_id (1–100, unique in a message).
 */
export class ButtonBuilder {
  constructor(data = {}) {
    this.data = { type: 'button', style: ButtonStyle.Secondary, ...data };
    if (typeof this.data.style === 'number') this.data.style = STYLE_NUMBERS[this.data.style];
  }

  static primary(label, customId) {
    return new ButtonBuilder().setStyle(ButtonStyle.Primary).setLabel(label).setCustomId(customId);
  }

  static secondary(label, customId) {
    return new ButtonBuilder().setStyle(ButtonStyle.Secondary).setLabel(label).setCustomId(customId);
  }

  static success(label, customId) {
    return new ButtonBuilder().setStyle(ButtonStyle.Success).setLabel(label).setCustomId(customId);
  }

  static danger(label, customId) {
    return new ButtonBuilder().setStyle(ButtonStyle.Danger).setLabel(label).setCustomId(customId);
  }

  static link(label, url) {
    return new ButtonBuilder().setLabel(label).setURL(url);
  }

  static from(other) {
    return new ButtonBuilder(typeof other?.toJSON === 'function' ? other.toJSON() : other);
  }

  /** 'primary' | 'secondary' | 'success' | 'danger' | 'link', ButtonStyle.X, or 1–5. */
  setStyle(style) {
    const resolved = typeof style === 'number' ? STYLE_NUMBERS[style] : style;
    if (isValidationEnabled() && !STYLES.has(resolved)) fail(`Unknown button style "${style}"`);
    this.data.style = resolved;
    return this;
  }

  setLabel(label) {
    if (label == null) delete this.data.label;
    else this.data.label = checkLength(label, Limits.ButtonLabel, 'Button label');
    return this;
  }

  /** One emoji: '🔥', or a server emoji '<:name:id>'. */
  setEmoji(emoji) {
    if (emoji == null) delete this.data.emoji;
    else this.data.emoji = typeof emoji === 'object' ? (emoji.id ? `<:${emoji.name}:${emoji.id}>` : emoji.name) : String(emoji);
    return this;
  }

  setCustomId(customId) {
    this.data.custom_id = checkLength(customId, Limits.CustomId, 'Button custom_id', 1);
    delete this.data.url;
    return this;
  }

  /** Makes it a link button. https only. */
  setURL(url) {
    this.data.url = checkURL(url, 'Button URL', { httpsOnly: true });
    this.data.style = ButtonStyle.Link;
    delete this.data.custom_id;
    return this;
  }

  setDisabled(disabled = true) {
    this.data.disabled = Boolean(disabled);
    return this;
  }

  toJSON() {
    if (isValidationEnabled()) {
      const d = this.data;
      if (!d.label && !d.emoji) fail('A button needs a label or an emoji');
      if (d.style === ButtonStyle.Link) {
        if (!d.url) fail(`Link button "${d.label ?? d.emoji}" needs a URL (setURL)`);
      } else if (!d.custom_id) {
        fail(`Button "${d.label ?? d.emoji}" needs a custom_id (setCustomId), or make it a link with setURL`);
      }
    }
    return { ...this.data };
  }
}
