import { Events } from '../util/Constants.js';
import { resolveId } from '../util/util.js';
import { Collector } from './Collector.js';

/**
 * Button clicks, narrowed by `message`, `channel`, `server`, `customId` (string or RegExp) and/or `user`.
 *
 *   const collector = message.createMessageComponentCollector({ time: 60_000 });
 *   collector.on('collect', (i) => i.update({ content: `Clicked ${i.customId}` }));
 */
export class InteractionCollector extends Collector {
  constructor(client, options = {}) {
    super(client, options);
    this.messageId = resolveId(options.message);
    this.channelId = resolveId(options.channel);
    this.serverId = resolveId(options.server);
    this.userId = resolveId(options.user);
    this.customId = options.customId ?? null;
    this._listen(Events.InteractionCreate, (interaction) => this.handleCollect(interaction));
  }

  collect(interaction) {
    if (this.messageId && interaction.messageId !== this.messageId) return null;
    if (this.channelId && interaction.channelId !== this.channelId) return null;
    if (this.serverId && interaction.serverId !== this.serverId) return null;
    if (this.userId && interaction.userId !== this.userId) return null;
    if (this.customId) {
      const ok = this.customId instanceof RegExp
        ? ((this.customId.lastIndex = 0), this.customId.test(interaction.customId))
        : interaction.customId === this.customId;
      if (!ok) return null;
    }
    return interaction.id;
  }
}
