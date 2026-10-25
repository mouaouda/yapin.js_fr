import { EventEmitter } from 'node:events';
import { Routes } from '../rest/Routes.js';
import { ErrorCodes, YapinError } from '../errors/index.js';
import { Events, GatewayCloseCodes, GatewayOpcodes, Limits } from '../util/Constants.js';
import { backoff, sleep } from '../util/util.js';

const MINUTE = 60_000;

/** What to do after a gateway socket closes. */
function classifyClose(code, uptime) {
  switch (code) {
    case GatewayCloseCodes.AuthenticationFailed:
      return { kind: 'fatal' };
    case GatewayCloseCodes.GatewayDisabled:
      return { kind: 'unavailable', retryIn: 10 * MINUTE, reason: 'the gateway is not on for this bot yet' };
    case GatewayCloseCodes.TooManySockets:
      return { kind: 'unavailable', retryIn: MINUTE, reason: 'two sockets are already open for this bot' };
    case GatewayCloseCodes.RateLimited:
      return { kind: 'unavailable', retryIn: MINUTE, reason: 'too many connects' };
    default:
      return uptime > 10_000 ? { kind: 'ok' } : { kind: 'failed' };
  }
}

async function resolveWebSocket(option) {
  if (option === false) return null;
  if (typeof option === 'function') return option;
  if (typeof globalThis.WebSocket === 'function') return globalThis.WebSocket;
  try {
    const mod = await import('ws');
    return mod.WebSocket ?? mod.default;
  } catch {
    return null;
  }
}

/**
 * Where events come from. Uses the WebSocket gateway when it's on for the bot and the runtime has
 * a WebSocket (Node 22+, Bun, Deno, or `ws` installed), and falls back to long polling `/events`
 * otherwise or while the gateway keeps failing. Both share one cursor (`seq`), so switching
 * never drops or repeats an event. Events are handed to the client one at a time, in order.
 */
export class EventStream extends EventEmitter {
  constructor(client) {
    super();
    Object.defineProperty(this, 'client', { value: client });
    this.seq = 0;
    this.running = false;
    /** 'gateway' | 'polling' | null */
    this.transport = null;
    this.ping = null;
    this.ws = null;
    this._abort = null;
    this._loop = null;
  }

  get options() {
    return this.client.options;
  }

  start(seq) {
    if (this.running) return;
    this.seq = seq;
    this.running = true;
    this._abort = new AbortController();
    this._loop = this.#run().catch((error) => this.client._reportError(error, { where: 'event stream' }));
  }

  async stop() {
    this.running = false;
    this._abort?.abort();
    try {
      this.ws?.close(GatewayCloseCodes.Normal);
    } catch {
      // already closed
    }
    await this._loop;
    this.#setTransport(null);
  }

  /** Hands one raw event ({ id, type, data, created_at }) to the client, once and in order. */
  ingest(event) {
    if (!(event.id > this.seq)) return false;
    this.seq = event.id;
    this.client._dispatch(event);
    this.#persist();
    return true;
  }

  #advance(last) {
    if (typeof last === 'number' && last > this.seq) {
      this.seq = last;
      this.#persist();
    }
  }

  #persist() {
    try {
      const out = this.client.sequenceStore?.set(this.seq);
      if (out && typeof out.catch === 'function') out.catch((e) => this.client.emit(Events.Warn, `Couldn't save the event cursor: ${e.message}`));
    } catch (e) {
      this.client.emit(Events.Warn, `Couldn't save the event cursor: ${e.message}`);
    }
  }

  #setTransport(transport, detail) {
    if (this.transport === transport) return;
    const previous = this.transport;
    this.transport = transport;
    if (transport) this.client.emit(Events.Connected, { transport, previous, ...detail });
    else if (previous) this.client.emit(Events.Disconnected, { transport: previous, ...detail });
  }

  #debug(message) {
    this.client.emit(Events.Debug, `[events] ${message}`);
  }

  async #run() {
    const mode = this.options.transport;
    const WebSocketImpl = mode === 'polling' ? null : await resolveWebSocket(this.options.WebSocket);
    if (mode === 'gateway' && !WebSocketImpl) {
      throw new YapinError(ErrorCodes.NotReady, 'transport is "gateway" but this runtime has no WebSocket: use Node 22+ or `npm i ws`');
    }
    if (!WebSocketImpl && mode !== 'polling') this.#debug('no WebSocket available, long polling');

    let gatewayRetryAt = 0;
    let gatewayFailures = 0;
    let pollFailures = 0;
    const signal = this._abort.signal;

    while (this.running) {
      if (WebSocketImpl && Date.now() >= gatewayRetryAt) {
        const result = await this.#gatewaySession(WebSocketImpl);
        if (!this.running) break;
        if (result.kind === 'fatal') {
          this.running = false;
          this.client._reportError(new YapinError(ErrorCodes.TokenInvalid, 'The gateway rejected the token: make a new one in Settings → Developer'));
          break;
        }
        if (result.kind === 'ok') {
          gatewayFailures = 0;
          this.#debug('gateway closed, resuming');
          await sleep(backoff(1, { base: 500 }), signal);
          continue;
        }
        if (result.kind === 'unavailable') {
          gatewayRetryAt = Date.now() + result.retryIn;
          this.#debug(`gateway unavailable (${result.reason}), polling for ${Math.round(result.retryIn / MINUTE)} min`);
        } else if (++gatewayFailures >= 3) {
          gatewayFailures = 0;
          gatewayRetryAt = Date.now() + 5 * MINUTE;
          this.client.emit(Events.Warn, 'The gateway keeps failing; long polling for 5 minutes');
        } else {
          await sleep(backoff(gatewayFailures), signal);
          continue;
        }
        if (mode === 'gateway') {
          await sleep(Math.max(0, gatewayRetryAt - Date.now()), signal);
          continue;
        }
      }

      this.#setTransport('polling');
      let out;
      try {
        out = await this.client.rest.get(Routes.events(), {
          query: { after: this.seq, wait: Limits.EventPollWait, max_age: this.options.maxEventAge ?? undefined },
          timeout: 45_000,
          retries: 0,
          signal,
        });
        pollFailures = 0;
      } catch (error) {
        if (!this.running) break;
        if (error.status === 401) {
          this.running = false;
          this.client._reportError(new YapinError(ErrorCodes.TokenInvalid, 'Token rejected: make a new one in Settings → Developer'));
          break;
        }
        pollFailures++;
        this.#debug(`poll failed (${error.message}), retrying`);
        if (pollFailures >= 3) this.client.emit(Events.Warn, `Polling for events keeps failing: ${error.message}`);
        await sleep(Math.max((error.retryAfter ?? 0) * 1000, backoff(pollFailures)), signal);
        continue;
      }
      for (const event of out.events ?? []) this.ingest(event);
      this.#advance(out.last);
    }
  }

  /** One socket, from connect to close. Resolves with what happened (see classifyClose). */
  #gatewaySession(WebSocketImpl) {
    return new Promise((resolve) => {
      let ws;
      try {
        ws = new WebSocketImpl(this.options.gatewayURL);
      } catch (error) {
        this.#debug(`gateway connect failed: ${error.message}`);
        resolve({ kind: 'failed' });
        return;
      }
      this.ws = ws;
      let readyAt = 0;
      let heartbeat = null;
      let acked = true;
      let sentAt = 0;
      let settled = false;

      const finish = (result, closeCode) => {
        if (settled) return;
        settled = true;
        ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null;
        clearInterval(heartbeat);
        clearTimeout(readyTimer);
        if (this.ws === ws) this.ws = null;
        if (closeCode !== undefined) {
          try {
            ws.close(closeCode);
          } catch {
            // already closed
          }
        }
        if (readyAt) this.client.emit(Events.Disconnected, { transport: 'gateway', code: result.code ?? closeCode });
        if (this.transport === 'gateway') this.transport = null;
        resolve(result);
      };

      // A socket that never gets to ready (or whose close never arrives) doesn't hold the bot up.
      const readyTimer = setTimeout(() => finish({ kind: 'failed' }, 4000), 15_000);

      const send = (payload) => ws.send(JSON.stringify(payload));

      ws.onmessage = (message) => {
        let packet;
        try {
          packet = JSON.parse(typeof message.data === 'string' ? message.data : String(message.data));
        } catch {
          return;
        }
        switch (packet.op) {
          case GatewayOpcodes.Hello: {
            const extra = {};
            if (this.options.intents) extra.events = this.options.intents;
            if (this.options.maxEventAge) extra.max_age = this.options.maxEventAge;
            const token = this.client.token;
            send(this.seq > 0 ? { op: GatewayOpcodes.Resume, token, seq: this.seq, ...extra } : { op: GatewayOpcodes.Identify, token, ...extra });
            const interval = packet.heartbeat_interval ?? 30_000;
            heartbeat = setInterval(() => {
              // No ack for the last beat: the connection is a zombie. Start over and resume.
              if (!acked) {
                this.#debug('no heartbeat ack, reconnecting');
                finish({ kind: 'ok' }, 4000);
                return;
              }
              acked = false;
              sentAt = Date.now();
              send({ op: GatewayOpcodes.Heartbeat });
            }, interval);
            break;
          }
          case GatewayOpcodes.Ready:
            readyAt = Date.now();
            clearTimeout(readyTimer);
            if (typeof packet.seq === 'number' && packet.seq > this.seq) this.#advance(packet.seq);
            this.#setTransport('gateway');
            this.#debug(`gateway ready (seq ${this.seq})`);
            break;
          case GatewayOpcodes.HeartbeatAck:
            acked = true;
            this.ping = Date.now() - sentAt;
            break;
          case GatewayOpcodes.Event:
            if (packet.d) this.ingest(packet.d);
            break;
          default:
            break;
        }
      };
      // Node's WebSocket only fires "error" (no "close") when it can't connect at all.
      ws.onerror = () => {
        if (!readyAt) finish({ kind: 'failed' });
      };
      ws.onclose = (event) => {
        const code = event?.code;
        this.#debug(`gateway closed (${code}${event?.reason ? `: ${event.reason}` : ''})`);
        finish({ ...classifyClose(code, readyAt ? Date.now() - readyAt : 0), code });
      };
    });
  }
}
