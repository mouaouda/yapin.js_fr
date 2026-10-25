/**
 * Remembers the last event id the bot handled, so a restart catches up on what it missed
 * (Yapin’ keeps events for a day) instead of starting from "now".
 *
 *   new Client({ sequenceStore: new FileSequenceStore('.yapin-seq') })
 *   new Client({ sequenceStore: '.yapin-seq' })                     // same thing
 *   new Client({ sequenceStore: { get: () => redis.get('seq'), set: (n) => redis.set('seq', n) } })
 *
 * Catching up skips slash commands older than 15 minutes and expired clicks either way; add
 * `maxEventAge` to bound the rest.
 */
export class MemorySequenceStore {
  constructor(initial = 0) {
    this.value = initial;
  }

  get() {
    return this.value;
  }

  set(seq) {
    this.value = seq;
  }
}

export class FileSequenceStore {
  constructor(path, { debounce = 1000 } = {}) {
    this.path = path;
    this.debounce = debounce;
    this.pending = null;
    this.timer = null;
  }

  async get() {
    const { readFile } = await import('node:fs/promises');
    try {
      const n = Number((await readFile(this.path, 'utf8')).trim());
      return Number.isSafeInteger(n) && n > 0 ? n : 0;
    } catch {
      return 0;
    }
  }

  set(seq) {
    this.pending = seq;
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, this.debounce);
    this.timer.unref?.();
  }

  /** Writes now (also called on client.destroy()). Atomic: write a temp file, then rename. */
  async flush() {
    if (this.pending === null) return;
    clearTimeout(this.timer);
    this.timer = null;
    const value = this.pending;
    this.pending = null;
    const { writeFile, rename } = await import('node:fs/promises');
    const tmp = `${this.path}.tmp`;
    await writeFile(tmp, String(value));
    await rename(tmp, this.path);
  }
}

export function resolveSequenceStore(option) {
  if (!option) return null;
  if (typeof option === 'string' || option instanceof URL) return new FileSequenceStore(option instanceof URL ? option.pathname : option);
  if (typeof option.get === 'function' && typeof option.set === 'function') return option;
  throw new TypeError('sequenceStore must be a file path or an object with get() and set(seq)');
}
