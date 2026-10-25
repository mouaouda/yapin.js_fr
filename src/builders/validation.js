import { Colors } from '../util/Constants.js';
import { ErrorCodes, YapinError } from '../errors/index.js';

let enabled = true;

/** Builders check Yapin’s limits as you set things, so mistakes surface at the line that made them. */
export const enableValidators = () => { enabled = true; };
export const disableValidators = () => { enabled = false; };
export const isValidationEnabled = () => enabled;

export function fail(message) {
  throw new YapinError(ErrorCodes.ValidationError, message);
}

export function checkLength(value, max, what, min = 0) {
  if (!enabled) return value;
  const text = String(value);
  if (text.length > max) fail(`${what} is ${text.length} characters; the limit is ${max}`);
  if (text.length < min) fail(`${what} needs at least ${min} character${min === 1 ? '' : 's'}`);
  return text;
}

export function checkCount(count, max, what) {
  if (enabled && count > max) fail(`Too many ${what}: ${count} (the limit is ${max})`);
}

export function checkURL(value, what, { httpsOnly = false } = {}) {
  const text = String(value);
  if (!enabled) return text;
  let url;
  try {
    url = new URL(text);
  } catch {
    fail(`${what} must be a full URL, got "${text}"`);
  }
  if (httpsOnly ? url.protocol !== 'https:' : !/^https?:$/.test(url.protocol)) {
    fail(`${what} must be an ${httpsOnly ? 'https' : 'http(s)'} link, got "${text}"`);
  }
  return text;
}

const NAMED_COLORS = Object.fromEntries(Object.entries(Colors).map(([k, v]) => [k.toLowerCase(), v]));

/** 0x5865f2, '#5865f2', '5865f2', 'Blurple', 'red' or [r, g, b] → a number. */
export function resolveColor(color) {
  if (color === null || color === undefined) return null;
  let value;
  if (typeof color === 'number') value = color;
  else if (Array.isArray(color)) value = (color[0] << 16) + (color[1] << 8) + color[2];
  else if (typeof color === 'string') {
    const named = NAMED_COLORS[color.toLowerCase()];
    if (named !== undefined) value = named;
    else if (color.toLowerCase() === 'random') value = Math.floor(Math.random() * 0xffffff);
    else value = /^#?[0-9a-f]{6}$/i.test(color) ? parseInt(color.replace('#', ''), 16) : NaN;
  }
  if (!Number.isInteger(value) || value < 0 || value > 0xffffff) {
    fail(`"${color}" isn't a color: use 0xRRGGBB, '#rrggbb', a name like 'Blurple', or [r, g, b]`);
  }
  return value;
}
