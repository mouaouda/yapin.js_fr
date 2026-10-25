import { EventEmitter } from 'node:events';
import { DefaultBaseURL, version } from '../util/Constants.js';
import { ErrorCodes, RateLimitError, YapinAPIError, YapinError } from '../errors/index.js';
import { backoff, sleep } from '../util/util.js';

const IDEMPOTENT = new Set(['GET', 'HEAD', 'PUT', 'DELETE', 'OPTIONS']);
const MESSAGE_SEND = /^POST \/channels\/[^/]+\/messages$/;

/** Seconds from a Retry-After header: a number of seconds or an HTTP date. */
function parseRetryAfter(header) {
  if (header == null || header === '') return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds);
  const date = Date.parse(header);
  return Number.isNaN(date) ? null : Math.max(0, (date - Date.now()) / 1000);
}

/**
 * The bucket a request is rate limited in: its route with every id but the first ("major")
 * one replaced, so sends to one channel queue behind each other but not behind other channels.
 */
function bucketKey(method, path) {
  let major = true;
  const route = path.split('?')[0].replace(/\/([0-9a-f]{8}-[0-9a-f-]{27,}|[^/]{20,})/gi, (whole) => {
    if (major) {
      major = false;
      return whole;
    }
    return '/:id';
  });
  return `${method} ${route}`;
}

function buildQuery(query) {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    params.append(key, value instanceof Date ? value.toISOString() : String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : '';
}

function isRawBody(body) {
  return (
    body instanceof ArrayBuffer ||
    ArrayBuffer.isView(body) ||
    (typeof Blob !== 'undefined' && body instanceof Blob) ||
    (typeof FormData !== 'undefined' && body instanceof FormData) ||
    typeof body === 'string'
  );
}

/**
 * Talks to the Bot API. Retries what's safe to retry (429 and 503 with Retry-After, network
 * blips on idempotent calls), waits out rate limits per route so a burst of sends queues instead
 * of failing, and turns every other failure into a YapinAPIError.
 *
 * Events: `rateLimited` ({ method, path, retryAfter, global, message }), `request`, `response`.
 */
export class REST extends EventEmitter {
  #token = null;

  constructor(options = {}) {
    super();
    this.options = {
      baseURL: DefaultBaseURL,
      timeout: 30_000,
      retries: 3,
      maxRetryAfter: 60,
      userAgent: `yapin.js/${version} (+https://www.yapin.gg/developers)`,
      authPrefix: 'Bot',
      ...options,
    };
    this.options.baseURL = this.options.baseURL.replace(/\/$/, '');
    this.fetch = options.fetch ?? ((...args) => globalThis.fetch(...args));
    /** bucket → timestamp until which requests in it wait. */
    this.buckets = new Map();
    /** Until when message sends wait because the bot-wide ("overall") message limit was hit. */
    this.globalResetAt = 0;
    if (options.token) this.setToken(options.token);
  }

  setToken(token) {
    this.#token = token ? String(token).trim() : null;
    return this;
  }

  get hasToken() {
    return Boolean(this.#token);
  }

  get(path, options) {
    return this.request({ ...options, method: 'GET', path });
  }

  post(path, options) {
    return this.request({ ...options, method: 'POST', path });
  }

  put(path, options) {
    return this.request({ ...options, method: 'PUT', path });
  }

  patch(path, options) {
    return this.request({ ...options, method: 'PATCH', path });
  }

  delete(path, options) {
    return this.request({ ...options, method: 'DELETE', path });
  }

  /**
   * @param {object} req
   * @param {string} req.method
   * @param {string} req.path       e.g. Routes.channelMessages(id)
   * @param {object} [req.query]
   * @param {*} [req.body]          JSON-able value, or raw bytes / Blob / FormData
   * @param {string} [req.contentType] for raw bodies
   * @param {boolean} [req.auth=true]
   * @param {number} [req.retries]
   * @param {number} [req.timeout]
   * @param {AbortSignal} [req.signal]
   */
  async request(req) {
    const method = (req.method ?? 'GET').toUpperCase();
    const path = req.path;
    const url = `${req.baseURL ?? this.options.baseURL}${path}${buildQuery(req.query)}`;
    const retries = req.retries ?? this.options.retries;
    const timeout = req.timeout ?? this.options.timeout;
    const bucket = bucketKey(method, path);
    const isMessageSend = MESSAGE_SEND.test(`${method} ${path.split('?')[0]}`);

    const headers = { 'user-agent': this.options.userAgent, ...req.headers };
    if (req.auth !== false) {
      if (!this.#token) throw new YapinError(ErrorCodes.TokenMissing, 'No token set: call client.login(token) first');
      headers.authorization = `${this.options.authPrefix} ${this.#token}`;
    }
    let body;
    if (req.body !== undefined) {
      if (isRawBody(req.body)) {
        body = req.body;
        if (req.contentType) headers['content-type'] = req.contentType;
      } else {
        body = JSON.stringify(req.body);
        headers['content-type'] = 'application/json';
      }
    }

    for (let attempt = 0; ; attempt++) {
      await this.#waitForBucket(bucket, isMessageSend, req.signal);
      if (req.signal?.aborted) throw req.signal.reason ?? new Error('Aborted');

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(new YapinError(ErrorCodes.RequestTimeout, `${method} ${path} timed out after ${timeout}ms`)), timeout);
      const onAbort = () => controller.abort(req.signal.reason);
      req.signal?.addEventListener('abort', onAbort, { once: true });

      let res;
      let text;
      this.emit('request', { method, path, attempt });
      try {
        res = await this.fetch(url, { method, headers, body, signal: controller.signal });
        text = await res.text();
      } catch (cause) {
        if (req.signal?.aborted) throw req.signal.reason ?? cause;
        const timedOut = controller.signal.reason instanceof YapinError;
        if (IDEMPOTENT.has(method) && attempt < retries) {
          await sleep(backoff(attempt + 1), req.signal);
          continue;
        }
        if (timedOut) throw controller.signal.reason;
        throw new YapinError(ErrorCodes.NetworkError, `${method} ${path} failed: ${cause?.message ?? cause}`, { cause });
      } finally {
        clearTimeout(timer);
        req.signal?.removeEventListener('abort', onAbort);
      }

      let data;
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { raw: text };
      }
      this.emit('response', { method, path, status: res.status, attempt });
      if (res.ok) return data;

      const retryAfter = parseRetryAfter(res.headers.get('retry-after')) ?? (typeof data?.retry_after === 'number' ? data.retry_after : null);
      const error = res.status === 429
        ? new RateLimitError({ method, path, url, body: data, retryAfter })
        : new YapinAPIError({ status: res.status, method, path, url, body: data, retryAfter });

      const retryable = retryAfter !== null && (res.status === 429 || res.status === 503);
      if (res.status === 429) {
        this.emit('rateLimited', { method, path, retryAfter, global: error.global, message: error.message });
      }
      if (retryable && retryAfter <= this.options.maxRetryAfter) {
        const until = Date.now() + retryAfter * 1000 * (1 + Math.random() * 0.25);
        if (res.status === 429) {
          this.buckets.set(bucket, Math.max(this.buckets.get(bucket) ?? 0, until));
          if (error.global && isMessageSend) this.globalResetAt = Math.max(this.globalResetAt, until);
        }
        if (attempt < retries) {
          if (res.status === 503) await sleep(until - Date.now(), req.signal);
          continue;
        }
      }
      throw error;
    }
  }

  async #waitForBucket(bucket, isMessageSend, signal) {
    for (;;) {
      const until = Math.max(this.buckets.get(bucket) ?? 0, isMessageSend ? this.globalResetAt : 0);
      const wait = until - Date.now();
      if (wait <= 0) {
        if (this.buckets.get(bucket) <= Date.now()) this.buckets.delete(bucket);
        return;
      }
      await sleep(wait, signal);
      if (signal?.aborted) return;
    }
  }
}
