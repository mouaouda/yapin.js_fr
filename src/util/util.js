export const noop = () => {};

/** Resolves after `ms`, or early (without throwing) when `signal` aborts. */
export function sleep(ms, signal) {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal?.removeEventListener('abort', done);
      resolve();
    }
    signal?.addEventListener('abort', done, { once: true });
  });
}

/** Exponential backoff with jitter so many bots don't reconnect in lockstep: 1s, 2s, 4s ... capped. */
export function backoff(attempt, { base = 1000, max = 30_000 } = {}) {
  return Math.min(max, base * 2 ** Math.max(0, attempt - 1)) * (0.75 + Math.random() * 0.5);
}

export const toJSON = (value) => (value && typeof value.toJSON === 'function' ? value.toJSON() : value);

export const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;

/** An id from a string, a number or anything with an `id`. */
export function resolveId(value) {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  if (typeof value === 'object' && 'id' in value) return value.id == null ? null : String(value.id);
  return null;
}

export function mergeDefault(defaults, given) {
  if (!given) return { ...defaults };
  const out = { ...defaults };
  for (const [key, value] of Object.entries(given)) {
    if (value === undefined) continue;
    out[key] = isPlainObject(value) && isPlainObject(defaults[key]) ? mergeDefault(defaults[key], value) : value;
  }
  return out;
}

const OBSERVED = Symbol('observed');

/**
 * A Promise that reports its rejection through `report` when nobody awaited or caught it, instead of
 * crashing the process. `msg.reply('hi')` without `await` is common in bots; a failed send then lands
 * on `client.on('error')` rather than becoming an unhandled rejection.
 */
class SoftPromise extends Promise {
  static get [Symbol.species]() {
    return Promise;
  }

  then(onFulfilled, onRejected) {
    this[OBSERVED] = true;
    return super.then(onFulfilled, onRejected);
  }
}

export function softPromise(inner, report) {
  const promise = new SoftPromise((resolve, reject) => {
    inner.then(resolve, reject);
  });
  promise[OBSERVED] = false;
  Promise.prototype.then.call(promise, undefined, (error) => {
    if (!promise[OBSERVED]) report(error);
  });
  return promise;
}

const DURATION_UNITS = {
  ms: 1, millisecond: 1, milliseconds: 1,
  s: 1000, sec: 1000, secs: 1000, second: 1000, seconds: 1000,
  m: 60_000, min: 60_000, mins: 60_000, minute: 60_000, minutes: 60_000,
  h: 3_600_000, hr: 3_600_000, hrs: 3_600_000, hour: 3_600_000, hours: 3_600_000,
  d: 86_400_000, day: 86_400_000, days: 86_400_000,
  w: 604_800_000, week: 604_800_000, weeks: 604_800_000,
};

/** '1h30m', '10 minutes', '2d', '500ms' → milliseconds. A bare number is milliseconds. Null when it can't be read. */
export function parseDuration(input) {
  if (typeof input === 'number') return Number.isFinite(input) && input >= 0 ? input : null;
  const text = String(input ?? '').trim().toLowerCase();
  if (!text) return null;
  if (/^\d+(\.\d+)?$/.test(text)) return Number(text);
  if (!/^(\d+(\.\d+)?\s*[a-z]+[\s,]*)+$/.test(text)) return null;
  let total = 0;
  for (const [, amount, unit] of text.matchAll(/(\d+(?:\.\d+)?)\s*([a-z]+)/g)) {
    const factor = DURATION_UNITS[unit];
    if (!factor) return null;
    total += Number(amount) * factor;
  }
  return total;
}

/** 5400000 → '1h 30m'. */
export function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '0s';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const parts = [];
  for (const [unit, size] of [['d', 86_400_000], ['h', 3_600_000], ['m', 60_000], ['s', 1000]]) {
    const n = Math.floor(ms / size);
    if (n) {
      parts.push(`${n}${unit}`);
      ms -= n * size;
    }
  }
  return parts.join(' ');
}

const MAGIC = [
  ['image/png', [0x89, 0x50, 0x4e, 0x47]],
  ['image/jpeg', [0xff, 0xd8, 0xff]],
  ['image/gif', [0x47, 0x49, 0x46, 0x38]],
];

/** The image type from a file's first bytes: png, jpeg, gif or webp. */
export function sniffImageType(bytes) {
  for (const [type, sig] of MAGIC) if (sig.every((b, i) => bytes[i] === b)) return type;
  const ascii = (from, to) => String.fromCharCode(...bytes.subarray(from, to));
  if (bytes.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  return null;
}

const EXTENSION_TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };

/**
 * Anything image-like → { data: Uint8Array, contentType }. Takes a file path, a file:// or http(s) URL,
 * a Buffer / Uint8Array / ArrayBuffer, or a Blob / File.
 */
export async function resolveImage(input, contentType) {
  let data;
  let type = contentType;
  if (typeof input === 'string' || input instanceof URL) {
    const ref = String(input);
    if (/^https?:\/\//i.test(ref)) {
      const res = await fetch(ref);
      if (!res.ok) throw new Error(`Couldn't download ${ref} (${res.status})`);
      type ||= res.headers.get('content-type')?.split(';')[0];
      data = new Uint8Array(await res.arrayBuffer());
    } else {
      const { readFile } = await import('node:fs/promises');
      const path = ref.startsWith('file:') ? (await import('node:url')).fileURLToPath(ref) : ref;
      data = new Uint8Array(await readFile(path));
      type ||= EXTENSION_TYPES[path.split('.').pop().toLowerCase()];
    }
  } else if (typeof Blob !== 'undefined' && input instanceof Blob) {
    type ||= input.type;
    data = new Uint8Array(await input.arrayBuffer());
  } else if (input instanceof ArrayBuffer) {
    data = new Uint8Array(input);
  } else if (ArrayBuffer.isView(input)) {
    data = new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  } else {
    throw new TypeError('Pass an image as a file path, URL, Buffer, Uint8Array, ArrayBuffer or Blob');
  }
  type ||= sniffImageType(data);
  if (!type) throw new TypeError('Could not tell the image type; pass it too, like "image/png"');
  return { data, contentType: type };
}

/** Splits text into pieces of at most `max` characters, preferring to break on newlines, then spaces. */
export function splitMessage(text, { max = 2000, char = ['\n', ' '] } = {}) {
  const out = [];
  let rest = String(text);
  while (rest.length > max) {
    let cut = -1;
    for (const c of [].concat(char)) {
      cut = rest.lastIndexOf(c, max);
      if (cut > 0) break;
    }
    if (cut <= 0) cut = max;
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^[\n ]/, '');
  }
  if (rest.length) out.push(rest);
  return out;
}
