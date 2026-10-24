/**
 * A Map with array-style helpers. Every cache in yapin.js is one of these, so
 * `client.servers.cache.find((s) => s.name === 'Lounge')` and friends work everywhere.
 */
export class Collection extends Map {
  static get [Symbol.species]() {
    return Collection;
  }

  /** The first value, or the first `n` values as an array. */
  first(n) {
    if (n === undefined) return this.values().next().value;
    if (n < 0) return this.last(-n);
    return Array.from({ length: Math.min(n, this.size) }, ((it) => () => it.next().value)(this.values()));
  }

  firstKey(n) {
    if (n === undefined) return this.keys().next().value;
    if (n < 0) return this.lastKey(-n);
    return Array.from({ length: Math.min(n, this.size) }, ((it) => () => it.next().value)(this.keys()));
  }

  last(n) {
    const values = [...this.values()];
    if (n === undefined) return values.at(-1);
    if (n < 0) return this.first(-n);
    return n ? values.slice(-n) : [];
  }

  lastKey(n) {
    const keys = [...this.keys()];
    if (n === undefined) return keys.at(-1);
    if (n < 0) return this.firstKey(-n);
    return n ? keys.slice(-n) : [];
  }

  at(index) {
    return [...this.values()].at(index);
  }

  keyAt(index) {
    return [...this.keys()].at(index);
  }

  random(n) {
    const values = [...this.values()];
    if (n === undefined) return values[Math.floor(Math.random() * values.length)];
    for (let i = values.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [values[i], values[j]] = [values[j], values[i]];
    }
    return values.slice(0, n);
  }

  find(fn) {
    for (const [key, value] of this) if (fn(value, key, this)) return value;
    return undefined;
  }

  findKey(fn) {
    for (const [key, value] of this) if (fn(value, key, this)) return key;
    return undefined;
  }

  filter(fn) {
    const out = new this.constructor[Symbol.species]();
    for (const [key, value] of this) if (fn(value, key, this)) out.set(key, value);
    return out;
  }

  /** [matches, rest]. */
  partition(fn) {
    const yes = new this.constructor[Symbol.species]();
    const no = new this.constructor[Symbol.species]();
    for (const [key, value] of this) (fn(value, key, this) ? yes : no).set(key, value);
    return [yes, no];
  }

  /** Values mapped into an array. */
  map(fn) {
    const out = new Array(this.size);
    let i = 0;
    for (const [key, value] of this) out[i++] = fn(value, key, this);
    return out;
  }

  /** Values mapped into a new Collection with the same keys. */
  mapValues(fn) {
    const out = new this.constructor[Symbol.species]();
    for (const [key, value] of this) out.set(key, fn(value, key, this));
    return out;
  }

  flatMap(fn) {
    const out = new this.constructor[Symbol.species]();
    for (const [key, value] of this) for (const [k, v] of fn(value, key, this)) out.set(k, v);
    return out;
  }

  some(fn) {
    for (const [key, value] of this) if (fn(value, key, this)) return true;
    return false;
  }

  every(fn) {
    for (const [key, value] of this) if (!fn(value, key, this)) return false;
    return true;
  }

  reduce(fn, initial) {
    let acc = initial;
    let started = arguments.length > 1;
    for (const [key, value] of this) {
      if (!started) {
        acc = value;
        started = true;
        continue;
      }
      acc = fn(acc, value, key, this);
    }
    if (!started) throw new TypeError('Reduce of empty collection with no initial value');
    return acc;
  }

  /** Removes entries that match; returns how many went. */
  sweep(fn) {
    let removed = 0;
    for (const [key, value] of this) {
      if (fn(value, key, this)) {
        this.delete(key);
        removed++;
      }
    }
    return removed;
  }

  each(fn) {
    for (const [key, value] of this) fn(value, key, this);
    return this;
  }

  tap(fn) {
    fn(this);
    return this;
  }

  hasAll(...keys) {
    return keys.flat().every((k) => this.has(k));
  }

  hasAny(...keys) {
    return keys.flat().some((k) => this.has(k));
  }

  /** The value at `key`, creating it with `make(key)` first if it's missing. */
  ensure(key, make) {
    if (this.has(key)) return this.get(key);
    const value = make(key, this);
    this.set(key, value);
    return value;
  }

  clone() {
    return new this.constructor[Symbol.species](this);
  }

  concat(...collections) {
    const out = this.clone();
    for (const c of collections) for (const [key, value] of c) out.set(key, value);
    return out;
  }

  /** Entries in both. */
  intersect(other) {
    return this.filter((_, key) => other.has(key));
  }

  /** Entries in exactly one of the two. */
  difference(other) {
    const out = this.filter((_, key) => !other.has(key));
    for (const [key, value] of other) if (!this.has(key)) out.set(key, value);
    return out;
  }

  /** Sorts in place, like Array#sort. */
  sort(compare = Collection.defaultSort) {
    const entries = [...this.entries()].sort(([ak, av], [bk, bv]) => compare(av, bv, ak, bk));
    super.clear();
    for (const [key, value] of entries) super.set(key, value);
    return this;
  }

  /** A sorted copy. */
  toSorted(compare = Collection.defaultSort) {
    return this.clone().sort(compare);
  }

  equals(other) {
    if (this === other) return true;
    if (!other || this.size !== other.size) return false;
    for (const [key, value] of this) if (!other.has(key) || other.get(key) !== value) return false;
    return true;
  }

  toJSON() {
    return this.map((value) => (value && typeof value.toJSON === 'function' ? value.toJSON() : value));
  }

  static defaultSort(a, b) {
    return Number(a > b) || Number(a === b) - 1;
  }
}

/** A Collection that forgets its oldest entries past `maxSize`. Used for message caches. */
export class LimitedCollection extends Collection {
  constructor(maxSize = Infinity, entries) {
    super();
    this.maxSize = maxSize;
    if (entries) for (const [key, value] of entries) this.set(key, value);
  }

  static get [Symbol.species]() {
    return Collection;
  }

  set(key, value) {
    if (this.maxSize === 0) return this;
    if (!this.has(key) && this.size >= this.maxSize) this.delete(this.firstKey());
    return super.set(key, value);
  }
}
