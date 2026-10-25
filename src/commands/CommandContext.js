import { UserError } from '../errors/index.js';
import { OptionResolver } from './ArgumentParser.js';

/**
 * What a command's run(ctx) gets: the message, the parsed options, and shortcuts.
 *
 *   async run(ctx) {
 *     const member = ctx.options.getMember('member');   // or: const { member } = ctx.values
 *     await member.kick();
 *     ctx.reply(`Kicked ${member.displayName}`);
 *   }
 */
export class CommandContext {
  constructor({ client, message, command, prefix, commandName, args }) {
    Object.defineProperty(this, 'client', { value: client });
    this.message = message;
    this.command = command;
    /** The prefix that was used: '/', '!', a mention… */
    this.prefix = prefix;
    /** The name (or alias) that was typed. */
    this.commandName = commandName;
    /** Everything after the command name, as typed. */
    this.args = args;
    /** The arguments split into words (quotes respected). */
    this.argv = [];
    this.options = new OptionResolver();
    /** Anything middleware wants to pass along. */
    this.state = {};
    this.startedAt = Date.now();
  }

  /** The parsed options as a plain object: `const { member, reason } = ctx.values`. */
  get values() {
    return this.options.values;
  }

  get author() {
    return this.message.author;
  }

  get user() {
    return this.message.author;
  }

  get authorId() {
    return this.message.authorId;
  }

  get channel() {
    return this.message.channel;
  }

  get channelId() {
    return this.message.channelId;
  }

  get server() {
    return this.message.server;
  }

  get guild() {
    return this.message.server;
  }

  get serverId() {
    return this.message.serverId;
  }

  /** The author's member, if cached. `await ctx.fetchMember()` to be sure (preconditions do this). */
  get member() {
    return this.message.member;
  }

  fetchMember() {
    return this.message.fetchMember();
  }

  inServer() {
    return this.message.inServer();
  }

  /** Replies quoting the command message (doesn't count towards the bot-wide message limit). */
  reply(payload) {
    return this.message.reply(payload);
  }

  /** Posts in the same channel without quoting. */
  send(payload) {
    return this.channel.send(payload);
  }

  react(emoji) {
    return this.message.react(emoji);
  }

  /** Stops the command and tells the person why: `if (!ok) ctx.error('You need to be in voice')`. */
  error(message, options) {
    throw new UserError(message, options);
  }

  /** The command's usage line, like '/ban <member> [reason...]'. */
  get usage() {
    return this.command.usage(this.prefix);
  }
}
