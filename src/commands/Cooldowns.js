/**
 * Per-command usage windows. Scope decides who shares a cooldown: 'user' (default), 'member'
 * (a user in one server), 'channel', 'server' or 'global'.
 */
export class CooldownManager {
  constructor() {
    this.entries = new Map();
    this.sweeper = setInterval(() => this.sweep(), 60_000);
    this.sweeper.unref?.();
  }

  key(command, scope, ctx) {
    switch (scope) {
      case 'global': return `${command.path}`;
      case 'server': return `${command.path}:s:${ctx.serverId ?? ctx.channelId}`;
      case 'channel': return `${command.path}:c:${ctx.channelId}`;
      case 'member': return `${command.path}:m:${ctx.serverId ?? 'dm'}:${ctx.authorId}`;
      default: return `${command.path}:u:${ctx.authorId}`;
    }
  }

  /** Milliseconds until the command can be used again; 0 when it can (and the use is counted). */
  take(command, ctx) {
    const { duration, scope, uses } = command.cooldown;
    const key = this.key(command, scope, ctx);
    const now = Date.now();
    let entry = this.entries.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + duration };
      this.entries.set(key, entry);
    }
    if (entry.count >= uses) return entry.resetAt - now;
    entry.count++;
    return 0;
  }

  /** Lets someone use a command again right away. */
  reset(command, ctx) {
    this.entries.delete(this.key(command, command.cooldown?.scope ?? 'user', ctx));
  }

  sweep() {
    const now = Date.now();
    for (const [key, entry] of this.entries) if (entry.resetAt <= now) this.entries.delete(key);
  }

  destroy() {
    clearInterval(this.sweeper);
    this.entries.clear();
  }
}
