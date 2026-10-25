import { EventEmitter } from 'node:events';
import { Collection } from '../util/Collection.js';

/**
 * Collects things (messages, clicks, reactions) as they happen, until a limit or a timer ends it.
 *
 * Options: `filter(item)` (may be async), `time` (ms in all), `idle` (ms since the last one),
 * `max` (collected), `maxProcessed` (seen, passing or not).
 * Events: `collect` (item), `ignore` (item), `dispose` (item), `end` (collected, reason).
 * End reasons: 'time', 'idle', 'limit', 'processedLimit', 'user' (stop() without a reason), or your own.
 *
 * Also an async iterator: `for await (const msg of collector) …`
 */
export class Collector extends EventEmitter {
  constructor(client, options = {}) {
    super();
    Object.defineProperty(this, 'client', { value: client });
    this.options = options;
    this.filter = options.filter ?? (() => true);
    this.collected = new Collection();
    this.ended = false;
    this.endReason = null;
    this.processed = 0;
    this._timeout = options.time ? setTimeout(() => this.stop('time'), options.time) : null;
    this._idle = options.idle ? setTimeout(() => this.stop('idle'), options.idle) : null;
    this._listeners = [];
  }

  /** Subscribe to a client event for the collector's lifetime. */
  _listen(event, fn) {
    this.client.on(event, fn);
    this._listeners.push([event, fn]);
  }

  /** What the collected item is keyed by. Subclasses return a key, or null to skip. */
  collect() {
    return null;
  }

  dispose() {
    return null;
  }

  async handleCollect(...args) {
    if (this.ended) return;
    const key = this.collect(...args);
    if (key === null || key === undefined) return;
    let pass;
    try {
      pass = await this.filter(...args, this.collected);
    } catch (error) {
      this.client.emit('error', error);
      return;
    }
    if (this.ended) return;
    this.processed++;
    if (pass) {
      this.collected.set(key, args[0]);
      this.emit('collect', ...args);
      if (this._idle) this._idle.refresh();
    } else {
      this.emit('ignore', ...args);
    }
    this.checkEnd();
  }

  handleDispose(...args) {
    if (this.ended || !this.options.dispose) return;
    const key = this.dispose(...args);
    if (key === null || key === undefined || !this.collected.has(key)) return;
    this.collected.delete(key);
    this.emit('dispose', ...args);
  }

  get endReasonFromLimits() {
    if (this.options.max && this.collected.size >= this.options.max) return 'limit';
    if (this.options.maxProcessed && this.processed >= this.options.maxProcessed) return 'processedLimit';
    return null;
  }

  checkEnd() {
    const reason = this.endReasonFromLimits;
    if (reason) this.stop(reason);
    return Boolean(reason);
  }

  resetTimer({ time, idle } = {}) {
    if (this._timeout) {
      clearTimeout(this._timeout);
      this._timeout = setTimeout(() => this.stop('time'), time ?? this.options.time);
    }
    if (this._idle) {
      clearTimeout(this._idle);
      this._idle = setTimeout(() => this.stop('idle'), idle ?? this.options.idle);
    }
  }

  stop(reason = 'user') {
    if (this.ended) return;
    this.ended = true;
    this.endReason = reason;
    clearTimeout(this._timeout);
    clearTimeout(this._idle);
    for (const [event, fn] of this._listeners) this.client.off(event, fn);
    this._listeners = [];
    this.emit('end', this.collected, reason);
  }

  /** The next collected item; rejects with the collection when the collector ends first. */
  get next() {
    return new Promise((resolve, reject) => {
      if (this.ended) return reject(this.collected);
      const onCollect = (item) => {
        cleanup();
        resolve(item);
      };
      const onEnd = () => {
        cleanup();
        reject(this.collected);
      };
      const cleanup = () => {
        this.off('collect', onCollect);
        this.off('end', onEnd);
      };
      this.on('collect', onCollect);
      this.on('end', onEnd);
    });
  }

  async *[Symbol.asyncIterator]() {
    const queue = [];
    let wake = null;
    const onCollect = (item) => {
      queue.push(item);
      wake?.();
    };
    const onEnd = () => wake?.();
    this.on('collect', onCollect);
    this.on('end', onEnd);
    try {
      for (;;) {
        while (queue.length) yield queue.shift();
        if (this.ended) return;
        await new Promise((resolve) => { wake = resolve; });
        wake = null;
      }
    } finally {
      this.off('collect', onCollect);
      this.off('end', onEnd);
    }
  }
}
