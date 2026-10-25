// A bot split into command files and modules, with hot reload while developing.
// Run: YAPIN_TOKEN=yb_… node examples/framework/bot.js
import { Client, Events, Intents } from 'yapin.js';

const client = new Client({
  intents: [Intents.Messages, Intents.Interactions, Intents.Members],
  sequenceStore: '.yapin-seq',
  maxEventAge: 300,
  presence: { status: 'online', activity: '/help' },
  commands: { help: { title: 'What I can do', color: 'Yapin' } },
});

// Log how long each command takes.
client.commands.use(async (ctx, next) => {
  const started = performance.now();
  await next();
  client.logger.debug(`/${ctx.command.path} by ${ctx.author.username} took ${Math.round(performance.now() - started)}ms`);
});

client.on(Events.CommandError, (error, ctx) => {
  console.error(`/${ctx.command.path} failed:`, error);
});

await client.commands.load('./commands');
await client.modules.load('./modules');
if (process.env.NODE_ENV !== 'production') client.modules.watch();

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    await client.destroy();
    process.exit(0);
  });
}

await client.login();
