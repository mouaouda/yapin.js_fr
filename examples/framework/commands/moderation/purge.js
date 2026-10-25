export default {
  name: 'purge',
  description: 'Delete recent messages',
  category: 'Moderation',
  serverOnly: true,
  permissions: ['manage_messages'],
  options: [
    { name: 'count', type: 'integer', required: true, min: 1, max: 100 },
    { name: 'from', type: 'user', description: 'Only messages from this person' },
  ],
  cooldown: { seconds: 5, scope: 'channel' },
  async run(ctx) {
    const { count, from } = ctx.values;
    const recent = await ctx.channel.messages.fetch({ limit: 100 });
    const targets = [...recent.filter((m) => m.id !== ctx.message.id && (!from || m.authorId === from.id)).values()].slice(-count);
    const { deleted } = await ctx.channel.bulkDelete(targets);
    const note = await ctx.send(`🧹 Deleted ${deleted.length} message${deleted.length === 1 ? '' : 's'}.`);
    setTimeout(() => note.delete().catch(() => {}), 5000);
  },
};
