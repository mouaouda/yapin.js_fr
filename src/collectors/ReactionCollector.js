import { Events } from '../util/Constants.js';
import { Collector } from './Collector.js';

/**
 * Reactions added to one message. Collected items are keyed `${emoji}:${userId}`.
 * Pass `dispose: true` to also drop reactions that get removed again.
 *
 *   const collector = message.createReactionCollector({ filter: (r, user) => r.emoji === '👍', time: 60_000 });
 */
export class ReactionCollector extends Collector {
  constructor(message, options = {}) {
    super(message.client, options);
    this.message = message;
    this._listen(Events.MessageReactionAdd, (reaction, user) => this.handleCollect(reaction, user));
    this._listen(Events.MessageReactionRemove, (reaction, user) => this.handleDispose(reaction, user));
  }

  collect(reaction) {
    return reaction.messageId === this.message.id ? `${reaction.emoji}:${reaction.userId}` : null;
  }

  dispose(reaction) {
    return reaction.messageId === this.message.id ? `${reaction.emoji}:${reaction.userId}` : null;
  }
}
