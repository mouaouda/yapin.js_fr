import { formatDuration } from 'yapin.js';

export default {
  name: 'timeout',
  description: 'Time someone out, or end a timeout',
  category: 'Moderation',
  serverOnly: true,
  permissions: ['timeout_members'],
  subcommands: [
    {
      name: 'set',
      description: 'Time someone out',
      options: [
        { name: 'member', type: 'member', required: true },
        { name: 'length', type: 'duration', default: 10 * 60_000, max: 28 * 86_400_000 },
        { name: 'reason', rest: true },
      ],
      async run(ctx) {
        const { member, length, reason } = ctx.values;
        await member.timeout(length, reason ?? undefined);
        await ctx.reply(`🔇 ${member.displayName} is timed out for ${formatDuration(length)}.`);
      },
    },
    {
      name: 'clear',
      description: 'End a timeout',
      options: [{ name: 'member', type: 'member', required: true }],
      async run(ctx) {
        await ctx.values.member.removeTimeout();
        await ctx.reply(`🔊 ${ctx.values.member.displayName} can talk again.`);
      },
    },
  ],
};
