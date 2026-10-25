// Reaction roles: react to the bot's message to get a role, take the reaction back to lose it.
// The bot needs a role with Manage roles, placed above the roles it hands out.
import { Client, EmbedBuilder, Events, Intents } from 'yapin.js';

const client = new Client({ intents: [Intents.Messages, Intents.Reactions] });
const ROLES = { '🔴': 'Red team', '🔵': 'Blue team', '🟢': 'Green team' };
const roleMessages = new Set(); // keep these ids in a file or database to survive restarts

client.commands.register({
  name: 'rolemenu',
  description: 'Post the reaction role menu',
  serverOnly: true,
  permissions: ['manage_roles'],
  async run(ctx) {
    const embed = new EmbedBuilder()
      .setTitle('Pick a team')
      .setDescription(Object.entries(ROLES).map(([emoji, role]) => `${emoji}  ${role}`).join('\n'))
      .setColor('Blurple');
    const message = await ctx.send({ embeds: [embed] });
    roleMessages.add(message.id);
    for (const emoji of Object.keys(ROLES)) await message.react(emoji);
  },
});

async function toggle(reaction, add) {
  if (!roleMessages.has(reaction.messageId) || !ROLES[reaction.emoji] || reaction.userId === client.user.id) return;
  const server = reaction.server;
  await server.roles.ensure();
  const role = server.roles.resolve(ROLES[reaction.emoji]);
  if (!role) return client.logger.warn(`No role called ${ROLES[reaction.emoji]} in ${server.name}`);
  if (add) await server.members.addRole(reaction.userId, role);
  else await server.members.removeRole(reaction.userId, role);
}

client.on(Events.MessageReactionAdd, (reaction) => toggle(reaction, true));
client.on(Events.MessageReactionRemove, (reaction) => toggle(reaction, false));

await client.login();
