import { Limits } from '../util/Constants.js';
import { checkCount, checkLength, checkURL, fail, isValidationEnabled, resolveColor } from './validation.js';

const normalizeField = (field) => ({
  name: checkLength(field.name, Limits.EmbedFieldName, 'Embed field name', 1),
  value: checkLength(field.value, Limits.EmbedFieldValue, 'Embed field value', 1),
  inline: Boolean(field.inline),
});

/**
 * An embed card. Same method names as discord.js:
 *
 *   new EmbedBuilder().setTitle('Score').setColor('Green').addFields({ name: 'Kills', value: '12', inline: true })
 *
 * Limits: title 256, description 4096, 10 fields (name 256, value 1024), footer 2048, 6000 characters in all.
 * Pictures must be https links to Yapin’ uploads or an allowed host (see AllowedMediaHosts).
 */
export class EmbedBuilder {
  constructor(data = {}) {
    this.data = { ...data };
    if (data.fields) this.data.fields = data.fields.map((f) => ({ ...f }));
    if (data.color !== undefined && typeof data.color !== 'number') this.data.color = resolveColor(data.color);
  }

  static from(other) {
    return new EmbedBuilder(typeof other?.toJSON === 'function' ? other.toJSON() : other);
  }

  setTitle(title) {
    if (title == null) delete this.data.title;
    else this.data.title = checkLength(title, Limits.EmbedTitle, 'Embed title');
    return this;
  }

  setDescription(description) {
    if (description == null) delete this.data.description;
    else this.data.description = checkLength(description, Limits.EmbedDescription, 'Embed description');
    return this;
  }

  setURL(url) {
    if (url == null) delete this.data.url;
    else this.data.url = checkLength(checkURL(url, 'Embed URL'), Limits.EmbedURL, 'Embed URL');
    return this;
  }

  /** 0x5865f2, '#5865f2', a name from Colors ('Blurple', 'Red'…), 'Random', or [r, g, b]. */
  setColor(color) {
    if (color == null) delete this.data.color;
    else this.data.color = resolveColor(color);
    return this;
  }

  /** setAuthor({ name, url, iconURL }) or setAuthor(name). */
  setAuthor(author) {
    if (author == null) {
      delete this.data.author;
      return this;
    }
    const { name, url, iconURL, icon_url } = typeof author === 'string' ? { name: author } : author;
    const icon = iconURL ?? icon_url;
    this.data.author = {
      name: checkLength(name, Limits.EmbedAuthorName, 'Embed author name', 1),
      url: url ? checkURL(url, 'Embed author URL') : undefined,
      icon_url: icon ? checkURL(icon, 'Embed author icon', { httpsOnly: true }) : undefined,
    };
    return this;
  }

  /** setFooter({ text, iconURL }) or setFooter(text). */
  setFooter(footer) {
    if (footer == null) {
      delete this.data.footer;
      return this;
    }
    const { text, iconURL, icon_url } = typeof footer === 'string' ? { text: footer } : footer;
    const icon = iconURL ?? icon_url;
    this.data.footer = {
      text: checkLength(text, Limits.EmbedFooterText, 'Embed footer', 1),
      icon_url: icon ? checkURL(icon, 'Embed footer icon', { httpsOnly: true }) : undefined,
    };
    return this;
  }

  setThumbnail(url) {
    if (url == null) delete this.data.thumbnail;
    else this.data.thumbnail = { url: checkURL(url, 'Embed thumbnail', { httpsOnly: true }) };
    return this;
  }

  setImage(url) {
    if (url == null) delete this.data.image;
    else this.data.image = { url: checkURL(url, 'Embed image', { httpsOnly: true }) };
    return this;
  }

  /** Now, a Date, or a timestamp in ms. `null` removes it. */
  setTimestamp(timestamp = Date.now()) {
    if (timestamp === null) delete this.data.timestamp;
    else this.data.timestamp = new Date(timestamp).toISOString();
    return this;
  }

  /** addFields({ name, value, inline? }, ...) */
  addFields(...fields) {
    const flat = fields.flat().map(normalizeField);
    checkCount((this.data.fields?.length ?? 0) + flat.length, Limits.EmbedFields, 'embed fields');
    (this.data.fields ??= []).push(...flat);
    return this;
  }

  /** Shorthand for one field. */
  addField(name, value, inline = false) {
    return this.addFields({ name, value, inline });
  }

  setFields(...fields) {
    this.data.fields = [];
    return this.addFields(...fields);
  }

  spliceFields(index, deleteCount, ...fields) {
    const flat = fields.flat().map(normalizeField);
    (this.data.fields ??= []).splice(index, deleteCount, ...flat);
    checkCount(this.data.fields.length, Limits.EmbedFields, 'embed fields');
    return this;
  }

  /** Characters counted towards the 6000 total. */
  get length() {
    const d = this.data;
    return (d.title?.length ?? 0) + (d.description?.length ?? 0) + (d.author?.name.length ?? 0) +
      (d.footer?.text.length ?? 0) + (d.fields ?? []).reduce((n, f) => n + f.name.length + f.value.length, 0);
  }

  toJSON() {
    if (isValidationEnabled()) {
      const d = this.data;
      if (!d.title && !d.description && !d.fields?.length && !d.image && !d.thumbnail && !d.author && !d.footer) {
        fail('An embed needs something in it: a title, description, field, image, author or footer');
      }
      if (this.length > Limits.EmbedTotal) fail(`Embed has ${this.length} characters; the limit is ${Limits.EmbedTotal}`);
    }
    return structuredClone(this.data);
  }
}
