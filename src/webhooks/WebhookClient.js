import { DefaultWebhookBaseURL, Limits } from '../util/Constants.js';
import { ErrorCodes, YapinAPIError, YapinError } from '../errors/index.js';
import { checkCount, checkLength } from '../builders/validation.js';
import { sleep, toJSON } from '../util/util.js';

/** Webhook error codes, as Yapin’ sends them in `{ message, code }`. */
export const WebhookErrorCodes = Object.freeze({
  UnknownWebhook: 10015,
  InvalidToken: 50027,
  EmptyMessage: 50006,
  InvalidFormBody: 50035,
  InvalidJSON: 50109,
  MissingAccess: 50001,
  PayloadTooLarge: 40005,
});

/**
 * Posts into one text channel through its webhook URL. No bot needed: good for CI, alerts and feeds.
 *
 *   const hook = new WebhookClient({ url: process.env.WEBHOOK_URL });
 *   await hook.send({ content: 'Deploy finished', username: 'CI', embeds: [embed] });
 *
 * Up to 5 posts per 2 seconds per webhook and 30 a minute per channel; 429s are waited out.
 */
export class WebhookClient {
  constructor(options, { baseURL = DefaultWebhookBaseURL, retries = 3, fetch: fetchImpl } = {}) {
    if (options?.url) {
      const m = /\/webhooks\/([^/]+)\/([^/?#]+)/.exec(options.url);
      if (!m) throw new YapinError(ErrorCodes.InvalidPayload, `Not a webhook URL: ${options.url}`);
      [, this.id, this.token] = m;
      this.baseURL = options.url.slice(0, options.url.indexOf('/webhooks/') + '/webhooks'.length);
    } else if (options?.id && options?.token) {
      this.id = String(options.id);
      this.token = String(options.token);
      this.baseURL = baseURL.replace(/\/$/, '');
    } else {
      throw new TypeError('new WebhookClient({ url }) or new WebhookClient({ id, token })');
    }
    Object.defineProperty(this, 'token', { value: this.token, enumerable: false });
    this.retries = retries;
    this.fetch = fetchImpl ?? ((...args) => globalThis.fetch(...args));
  }

  get url() {
    return `${this.baseURL}/${this.id}/${this.token}`;
  }

  async #request(method, { body, query } = {}) {
    const url = `${this.url}${query ? `?${new URLSearchParams(query)}` : ''}`;
    for (let attempt = 0; ; attempt++) {
      const res = await this.fetch(url, {
        method,
        headers: body ? { 'content-type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined,
      });
      if (res.status === 204) return null;
      const text = await res.text();
      let data;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = { message: text };
      }
      if (res.ok) return data;
      const retryAfter = Number(res.headers.get('retry-after')) || data?.retry_after || null;
      if (res.status === 429 && retryAfter && attempt < this.retries) {
        await sleep(retryAfter * 1000 * (1 + Math.random() * 0.25));
        continue;
      }
      throw new YapinAPIError({ status: res.status, method, path: `/webhooks/${this.id}`, url: url.replace(this.token, '<token>'), body: data, retryAfter });
    }
  }

  /**
   * send('text') or send({ content, username, avatarURL, embeds, allowedMentions, wait }).
   * Up to 10 embeds (25 fields each). By default only users are pinged. With `wait: true` (the
   * default) the posted message comes back; `wait: false` returns null.
   */
  async send(payload) {
    const options = typeof payload === 'string' ? { content: payload } : payload;
    const body = {};
    if (options.content !== undefined) body.content = checkLength(options.content, Limits.MessageContent, 'Webhook content');
    if (options.username) body.username = checkLength(options.username, Limits.WebhookUsername, 'Webhook username');
    if (options.avatarURL ?? options.avatar_url) body.avatar_url = options.avatarURL ?? options.avatar_url;
    if (options.embeds) {
      body.embeds = [].concat(options.embeds).map(toJSON);
      checkCount(body.embeds.length, Limits.WebhookEmbeds, 'webhook embeds');
    }
    const mentions = options.allowedMentions ?? options.allowed_mentions;
    if (mentions) body.allowed_mentions = mentions;
    const wait = options.wait !== false;
    return this.#request('POST', { body, query: wait ? { wait: 'true' } : undefined });
  }

  /** The webhook itself (name, channel, …). */
  fetchWebhook() {
    return this.#request('GET');
  }
}
