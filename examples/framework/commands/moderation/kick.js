export default {
  name: 'kick',
  description: 'Kick someone from the server',
  category: 'Moderation',
  serverOnly: true,
  permissions: ['kick_members'],
  options: [
    { name: 'member', type: 'member', required: true, description: 'Who to kick' },
    { name: 'reason', rest: true, description: 'Why' },
  ],
  async run(ctx) {
    const { member, reason } = ctx.values;
    if (member.id === ctx.authorId) ctx.error("You can't kick yourself.");
    if (member.id === ctx.server.ownerId) ctx.error("The owner can't be kicked.");
    await member.send(`You were kicked from ${ctx.server.name}${reason ? `: ${reason}` : '.'}`).catch(() => {});
    await member.kick();
    await ctx.reply(`👢 Kicked **${member.displayName}**${reason ? `: ${reason}` : ''}`);
  },
};
