// The smallest useful bot: a couple of commands, a mention reply and a welcome.
// Run: YAPIN_TOKEN=yb_… node examples/basic.js
import { Client, Events, EmbedBuilder } from 'yapin.js';

const client = new Client({ commands: { help: true } });

client.command('ping', 'Is the bot alive?', (ctx) => ctx.reply('pong 🏓'));

client.commands.register({
  name: 'roll',
  description: 'Roll a die, like /roll 20',
  options: [{ name: 'sides', type: 'integer', min: 2, max: 1000, default: 6, description: 'How many sides' }],
  run(ctx) {
    const { sides } = ctx.values;
    return ctx.reply(`🎲 ${1 + Math.floor(Math.random() * sides)} (d${sides})`);
  },
});

client.on(Events.MessageCreate, (message) => {
  if (message.mentioned) message.reply(`hey ${message.author}, try /help`);
});

client.on(Events.ServerMemberAdd, async (member) => {
  const channels = await member.server.channels.fetch({ type: 'text' });
  const welcome = channels.find((c) => /welcome|general|chat/i.test(c.name)) ?? channels.first();
  if (!welcome) return;
  const embed = new EmbedBuilder()
    .setColor('Green')
    .setTitle(`Welcome, ${member.displayName}!`)
    .setDescription(`You're member #${member.server.memberCount}. Say hi!`);
  await welcome.send({ content: `${member}`, embeds: [embed] });
});

client.on(Events.ClientReady, (c) => console.log(`Ready as ${c.user.displayName} (${c.transport ?? 'connecting'})`));

await client.login();
