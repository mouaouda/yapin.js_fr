/** Every structure keeps its client out of enumeration (and out of console.log / JSON). */
export class Base {
  constructor(client) {
    Object.defineProperty(this, 'client', { value: client, writable: false, enumerable: false });
  }

  _patch(data) {
    return data;
  }

  _clone() {
    return Object.assign(Object.create(Object.getPrototypeOf(this)), this);
  }

  /** A copy with the new data applied, the original untouched. */
  _update(data) {
    const before = this._clone();
    this._patch(data);
    return before;
  }

  toJSON() {
    const out = {};
    for (const [key, value] of Object.entries(this)) {
      if (key.startsWith('_') || typeof value === 'function') continue;
      if (value instanceof Base) out[key] = value.id ?? value.toJSON();
      else if (value && typeof value === 'object' && 'cache' in value) continue;
      else out[key] = value;
    }
    return out;
  }

  valueOf() {
    return this.id;
  }
}
