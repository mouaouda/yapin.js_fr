import { CDN } from '../util/Formatters.js';
import { BanManager } from '../managers/BanManager.js';
import { MemberManager } from '../managers/MemberManager.js';
import { RoleManager } from '../managers/RoleManager.js';
import { ServerChannelManager } from '../managers/ServerChannelManager.js';
import { ServerVoiceManager } from '../managers/ServerVoiceManager.js';
import { Base } from './Base.js';

/** A Yapin’ server (discord.js calls these guilds). */
export class Server extends Base {
  constructor(client, data) {
    super(client);
    this.id = String(data.id);
    this.name = null;
    this.iconPath = null;
    this.ownerId = null;
    this.memberCount = null;
    this.partial = true;
    this.channels = new ServerChannelManager(this);
    this.members = new MemberManager(this);
    this.roles = new RoleManager(this);
    this.bans = new BanManager(this);
    this.voice = new ServerVoiceManager(this);
    this._patch(data);
  }

  _patch(data) {
    if ('name' in data && data.name != null) {
      this.name = data.name;
      this.partial = false;
    }
    if ('icon_path' in data) this.iconPath = data.icon_path ?? null;
    if ('owner_id' in data) this.ownerId = data.owner_id ?? null;
    if ('member_count' in data && typeof data.member_count === 'number') this.memberCount = data.member_count;
    return data;
  }

  iconURL() {
    return CDN.icon(this.iconPath);
  }

  get owner() {
    return this.ownerId ? this.members.cache.get(this.ownerId) ?? null : null;
  }

  fetchOwner() {
    return this.members.fetch(this.ownerId);
  }

  /** The bot's own member here, once fetched (`server.members.fetchMe()`). */
  get me() {
    return this.members.me;
  }

  fetch(force = true) {
    return this.client.servers.fetch(this.id, { force });
  }

  toString() {
    return this.name ?? this.id;
  }
}
