import { Events } from '../util/Constants.js';
import { Collector } from './Collector.js';

/**
 * New messages in one channel.
 *
 *   const collector = channel.createMessageCollector({ filter: (m) => m.author.id === userId, time: 30_000, max: 1 });
 *   collector.on('collect', (m) => …);
 */
export class MessageCollector extends Collector {
  constructor(channel, options = {}) {
    super(channel.client, options);
    this.channel = channel;
    this._listen(Events.MessageCreate, (message) => this.handleCollect(message));
  }

  collect(message) {
    return message.channelId === this.channel.id ? message.id : null;
  }
}
