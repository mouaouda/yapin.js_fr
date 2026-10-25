import { EmbedBuilder, defineModule } from 'yapin.js';

/** Welcomes new members in #welcome (or #general) and says goodbye when they leave. */
export default defineModule({
  name: 'welcome',
  events: {
    async serverMemberAdd(member) {
      const channel = await findChannel(member.server);
      if (!channel) return;
      await channel.send({
        content: `${member}`,
        embeds: [
          new EmbedBuilder()
            .setColor('Green')
            .setTitle(`Welcome to ${member.server.name ?? 'the server'}!`)
            .setDescription(`Glad you're here, ${member.displayName}. Try \`/help\` to see what I can do.`)
            .setFooter({ text: `Member #${member.server.memberCount}` }),
        ],
      });
    },
    async serverMemberRemove(member) {
      const channel = await findChannel(member.server);
      await channel?.send(`👋 ${member.user.displayName ?? 'Someone'} left.`);
    },
  },
});

async function findChannel(server) {
  if (!server.channels.cache.size) await server.channels.fetch();
  return server.channels.cache.find((c) => c.isText() && /welcome/i.test(c.name)) ??
    server.channels.cache.find((c) => c.isText() && /general/i.test(c.name)) ??
    null;
}
