import { FilesURL, SiteURL } from './Constants.js';
import { resolveId } from './util.js';

export const userMention = (user) => `<@${resolveId(user)}>`;
export const channelMention = (channel) => `<#${resolveId(channel)}>`;
/** A server emoji, as used in buttons and messages: `<:name:id>`. */
export const formatEmoji = (name, id) => `<:${name}:${id}>`;

export const bold = (text) => `**${text}**`;
export const italic = (text) => `*${text}*`;
export const strikethrough = (text) => `~~${text}~~`;
export const inlineCode = (text) => `\`${text}\``;
export const codeBlock = (language, code) =>
  code === undefined ? `\`\`\`\n${language}\n\`\`\`` : `\`\`\`${language}\n${code}\n\`\`\``;
export const quote = (text) => String(text).split('\n').map((line) => `> ${line}`).join('\n');
export const hyperlink = (text, url) => `[${text}](${url})`;
/** `# text` to `### text`. Headings render in Components V2 text displays and embed descriptions. */
export const heading = (text, level = 1) => `${'#'.repeat(Math.min(Math.max(level, 1), 3))} ${text}`;
export const unorderedList = (items) => items.map((item) => `- ${item}`).join('\n');
export const orderedList = (items, start = 1) => items.map((item, i) => `${start + i}. ${item}`).join('\n');

/** Escapes markdown so user text shows literally. */
export function escapeMarkdown(text) {
  return String(text).replace(/([\\`*_~|>#\[\]()-])/g, '\\$1');
}

/** Picks every `<@id>` out of text. */
export const MentionPatterns = Object.freeze({
  User: /<@!?([\w-]+)>/g,
  Channel: /<#([\w-]+)>/g,
  Emoji: /<a?:(\w+):([\w-]+)>/g,
});

/**
 * A file link from an API path. The API gives pictures as paths: `avatar_path`, `banner_path`,
 * `icon_path`, `attachment_path`. Paths starting with `/` (built-in pictures) live on the site.
 */
export function cdn(bucket, path) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith('/')) return SiteURL + path;
  return `${FilesURL}/${bucket}/${path}`;
}

export const CDN = Object.freeze({
  avatar: (path) => cdn('avatars', path),
  banner: (path) => cdn('banners', path),
  icon: (path) => cdn('icons', path),
  attachment: (path) => cdn('attachments', path),
});
