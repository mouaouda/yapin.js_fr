import { CDN, userMention } from '../util/Formatters.js';
import { Base } from './Base.js';

/** A Yapin’ account (a person or a bot). Ids are UUIDs. */
export class User extends Base {
  constructor(client, data) {
    super(client);
    this.id = String(data.id);
    this.username = null;
    /** The display name they set, or null. `displayName` falls back to the username. */
    this.globalName = null;
    this.avatarPath = null;
    this.badges = [];
    this.bot = false;
    this.partial = true;
    this._patch(data);
  }

  _patch(data) {
    if ('username' in data && data.username != null) this.username = data.username;
    if ('display_name' in data) this.globalName = data.display_name ?? null;
    if ('avatar_path' in data) this.avatarPath = data.avatar_path ?? null;
    if ('avatar_url' in data) this._avatarURL = data.avatar_url ?? null;
    if ('badges' in data) this.badges = data.badges ?? [];
    if ('bot' in data && typeof data.bot === 'boolean') this.bot = data.bot;
    if (this.username !== null && 'username' in data) this.partial = false;
    return data;
  }

  get displayName() {
    return this.globalName || this.username;
  }

  get mention() {
    return userMention(this.id);
  }

  avatarURL() {
    return this._avatarURL ?? CDN.avatar(this.avatarPath);
  }

  /** The avatar URL, or null when they have none (show initials then). */
  displayAvatarURL() {
    return this.avatarURL();
  }

  /** Opens (or finds) a DM with them. Their DM setting applies. */
  createDM() {
    return this.client.users.createDM(this);
  }

  send(payload) {
    return this.client.users.send(this, payload);
  }

  fetch(force = true) {
    return this.client.users.fetch(this.id, { force });
  }

  equals(other) {
    return Boolean(other) && this.id === other.id && this.username === other.username &&
      this.globalName === other.globalName && this.avatarPath === other.avatarPath;
  }

  toString() {
    return userMention(this.id);
  }
}
