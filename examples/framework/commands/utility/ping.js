export default {
  name: 'ping',
  description: 'Check the bot is alive',
  category: 'Utility',
  async run(ctx) {
    const started = Date.now();
    const reply = await ctx.reply('Pinging…');
    const gateway = ctx.client.ping === null ? 'polling' : `gateway ${ctx.client.ping}ms`;
    await reply.edit(`Pong! Round trip ${Date.now() - started}ms (${gateway})`);
  },
};
