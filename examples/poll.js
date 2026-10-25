// A button poll with live counts, one vote per person, closed by its creator.
import { ActionRowBuilder, ButtonBuilder, Client, EmbedBuilder } from 'yapin.js';

const client = new Client();
const polls = new Map(); // message id → { question, options, votes: Map<userId, index>, ownerId }

function render(poll, closed = false) {
  const total = poll.votes.size;
  const counts = poll.options.map((_, i) => [...poll.votes.values()].filter((v) => v === i).length);
  const embed = new EmbedBuilder()
    .setColor(closed ? 'Grey' : 'Blurple')
    .setTitle(poll.question)
    .setDescription(poll.options.map((o, i) => {
      const share = total ? Math.round((counts[i] / total) * 100) : 0;
      return `**${o}**\n${'█'.repeat(Math.round(share / 10)).padEnd(10, '░')} ${counts[i]} (${share}%)`;
    }).join('\n\n'))
    .setFooter({ text: closed ? `Closed · ${total} votes` : `${total} vote${total === 1 ? '' : 's'}` });
  const buttons = poll.options.map((o, i) => ButtonBuilder.primary(o, `poll:vote:${i}`).setDisabled(closed));
  const rows = [new ActionRowBuilder(buttons)];
  if (!closed) rows.push(new ActionRowBuilder(ButtonBuilder.danger('Close poll', 'poll:close')));
  return { embeds: [embed], components: rows };
}

client.commands.register({
  name: 'poll',
  description: 'Start a poll: /poll "Question?" "Option 1" "Option 2"',
  serverOnly: true,
  options: [
    { name: 'question', required: true },
    { name: 'options', rest: true, required: true },
  ],
  async run(ctx) {
    const options = ctx.argv.slice(1);
    if (options.length < 2 || options.length > 5) ctx.error('Give 2 to 5 options, in quotes if they have spaces.');
    const poll = { question: ctx.values.question, options, votes: new Map(), ownerId: ctx.authorId };
    const message = await ctx.send(render(poll));
    polls.set(message.id, poll);
  },
});

client.button('poll:vote:{index}', async (i) => {
  const poll = polls.get(i.messageId);
  if (!poll) return i.ephemeral('This poll is no longer running.');
  poll.votes.set(i.userId, Number(i.params.index));
  await i.update(render(poll));
});

client.button('poll:close', async (i) => {
  const poll = polls.get(i.messageId);
  if (!poll) return i.ack();
  if (i.userId !== poll.ownerId) return i.ephemeral('Only the person who started the poll can close it.');
  polls.delete(i.messageId);
  await i.update(render(poll, true));
});

await client.login();
