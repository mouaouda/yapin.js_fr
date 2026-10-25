import { formatDuration } from 'yapin.js';

export default {
  name: 'remind',
  description: 'Remind you about something later',
  category: 'Utility',
  aliases: ['reminder'],
  options: [
    { name: 'in', type: 'duration', required: true, min: 10_000, max: 7 * 86_400_000, description: 'When, like 10m or 2h' },
    { name: 'what', rest: true, required: true, description: 'What to remind you about' },
  ],
  examples: ['/remind 30m take the pizza out', '/remind 2h stretch'],
  cooldown: { seconds: 10, uses: 3 },
  async run(ctx) {
    const { in: delay, what } = ctx.values;
    await ctx.reply(`Okay, I'll remind you in ${formatDuration(delay)}.`);
    // Kept in memory: a restart forgets reminders. Store them somewhere for real use.
    setTimeout(() => ctx.channel.send(`${ctx.author}, reminder: ${what}`), delay);
  },
};
