import { Limits } from '../util/Constants.js';
import { Routes } from '../rest/Routes.js';
import { checkLength } from '../builders/validation.js';
import { resolveImage } from '../util/util.js';
import { CDN } from '../util/Formatters.js';
import { User } from './User.js';

/** The bot's own account: `client.user`. */
export class ClientUser extends User {
  constructor(client, data) {
    super(client, data);
    this.bot = true;
    this.presence = { status: 'online', activity: null };
  }

  _patch(data) {
    super._patch(data);
    if ('bio' in data) this.bio = data.bio ?? null;
    if ('banner_path' in data) this.bannerPath = data.banner_path ?? null;
    if ('banner_url' in data) this._bannerURL = data.banner_url ?? null;
    if ('created_at' in data) this.createdAt = data.created_at ? new Date(data.created_at) : null;
    return data;
  }

  bannerURL() {
    return this._bannerURL ?? CDN.banner(this.bannerPath);
  }

  /** edit({ displayName, bio }). Display name up to 32 characters, bio up to 300. */
  async edit({ displayName, bio } = {}) {
    const body = {};
    if (displayName !== undefined) body.display_name = checkLength(displayName, Limits.DisplayName, 'Display name');
    if (bio !== undefined) body.bio = checkLength(bio, Limits.Bio, 'Bio');
    const data = await this.client.rest.patch(Routes.me(), { body });
    this._patch(data);
    return this;
  }

  setDisplayName(displayName) {
    return this.edit({ displayName });
  }

  /** discord.js name for setDisplayName. Yapin’ usernames themselves can't be changed by bots. */
  setUsername(displayName) {
    return this.edit({ displayName });
  }

  setBio(bio) {
    return this.edit({ bio });
  }

  /**
   * The bot's picture: a file path ('./avatar.png'), an https URL, a Buffer / Uint8Array, or a Blob.
   * PNG, JPG, GIF or WebP up to 8 MB. Once is enough, it sticks. `null` removes it.
   */
  async setAvatar(image, contentType) {
    if (image === null) {
      await this.client.rest.delete(Routes.meAvatar());
      this.avatarPath = null;
      this._avatarURL = null;
      return this;
    }
    const { data, contentType: type } = await resolveImage(image, contentType);
    const out = await this.client.rest.put(Routes.meAvatar(), { body: data, contentType: type, timeout: 120_000 });
    this.avatarPath = out.path ?? this.avatarPath;
    this._avatarURL = out.url ?? null;
    return this;
  }

  /** Same inputs as setAvatar, up to 10 MB. `null` removes it. */
  async setBanner(image, contentType) {
    if (image === null) {
      await this.client.rest.delete(Routes.meBanner());
      this.bannerPath = null;
      this._bannerURL = null;
      return this;
    }
    const { data, contentType: type } = await resolveImage(image, contentType);
    const out = await this.client.rest.put(Routes.meBanner(), { body: data, contentType: type, timeout: 120_000 });
    this.bannerPath = out.path ?? this.bannerPath;
    this._bannerURL = out.url ?? null;
    return this;
  }

  /**
   * setPresence({ status: 'dnd', activity: 'Moderating' }). Status: online, idle or dnd; activity up to 60
   * characters (null clears it). Leave one out to keep it. Kept while the bot is connected.
   */
  async setPresence({ status, activity } = {}) {
    const next = {
      status: status ?? this.presence.status,
      activity: activity === undefined ? this.presence.activity : activity === null ? null : checkLength(activity, Limits.Activity, 'Activity'),
    };
    await this.client.rest.put(Routes.meStatus(), { body: next });
    this.presence = next;
    return this.presence;
  }

  setStatus(status) {
    return this.setPresence({ status });
  }

  setActivity(activity) {
    return this.setPresence({ activity });
  }
}
