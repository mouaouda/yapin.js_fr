![yapin.js: JavaScript Development Framework](YapinAssets/yapinjsicon.png)

# yapin.js

A fast, modular framework for building [Yapin’](https://www.yapin.gg) bots. If you've used discord.js, you already know most of it.

- **Zero dependencies.** It runs on Node 18+ and uses only standard APIs, so Bun and Deno's Node compatibility should work too. Voice is optional and uses `@livekit/rtc-node`.
- **A discord.js-style API.** `Client`, `Events`, `Collection`, managers with caches, `EmbedBuilder`, `ButtonBuilder`, `ActionRowBuilder`, `ContainerBuilder`, collectors, `message.reply()`, `member.timeout()`, and so on.
- **A complete command framework.** Typed arguments, subcommands, aliases, cooldowns, permission and role checks, middleware, a built-in `/help`, and loading from folders. Commands are registered with Yapin’ so they show up in the `/` menu.
- **Reliable events.** It uses the WebSocket gateway when available and falls back to long polling by itself. It never drops or repeats an event, and it can catch up after a restart.
- **Rate limits handled for you.** 429s and 503s are waited out and retried per route. Errors give Yapin’s own explanation.
- **Modules with hot reload.** Split a bot into files, then load, unload, reload or watch them without restarting.
- **Everything else Yapin’ offers:** buttons, Components V2 layouts, embeds, reactions, voice moves, music bots with end-to-end encryption, channel webhooks, signed event webhooks, and Login with Yapin’ (OAuth2).
- **TypeScript types included.** You get full autocomplete in JavaScript too.

```js
import { Client, Events, EmbedBuilder } from 'yapin.js';

const client = new Client({ commands: { help: true } });

client.commands.register({
  name: 'roll',
  description: 'Roll a die, like /roll 20',
  options: [{ name: 'sides', type: 'integer', min: 2, max: 1000, default: 6 }],
  run: (ctx) => ctx.reply(`🎲 ${1 + Math.floor(Math.random() * ctx.values.sides)}`),
});

client.on(Events.ServerMemberAdd, async (member) => {
  const channels = await member.server.channels.fetch({ type: 'text' });
  const welcome = channels.find((c) => /welcome|general/i.test(c.name)) ?? channels.first();
  welcome?.send({ embeds: [new EmbedBuilder().setTitle(`Welcome, ${member.displayName}!`).setColor('Green')] });
});

client.login(process.env.YAPIN_TOKEN);
```

## Install

```sh
npm install yapin.js
```

Your project needs `"type": "module"` in its package.json, or use `.mjs` files. You also need a bot token: in Yapin’, open **Settings → Developer**, type a name and press **Create**. Copy the token from the Token tab; it's shown once.

## Documentation

| | |
| --- | --- |
| [Getting started](docs/getting-started.md) | Your first bot in five minutes |
| [The Client](docs/client.md) | Options, lifecycle, properties |
| [Events](docs/events.md) | Every event and what it gives you |
| [Commands](docs/commands.md) | Options and types, checks, cooldowns, subcommands, middleware, files |
| [Buttons and Components V2](docs/components.md) | Buttons, click routing, interactions, layouts |
| [Embeds](docs/embeds.md) | Cards with titles, fields and pictures |
| [Structures](docs/structures.md) | Message, User, Server, ServerMember, channels, Role |
| [Managers and caching](docs/managers.md) | `fetch`, `cache`, and what's kept in memory |
| [Collectors](docs/collectors.md) | Waiting for replies, clicks and reactions |
| [Modules](docs/modules.md) | Splitting a bot into files, with hot reload |
| [Voice](docs/voice.md) | Voice events, moving people, and music bots |
| [Webhooks](docs/webhooks.md) | Channel webhooks and event webhooks |
| [Login with Yapin’](docs/oauth2.md) | OAuth2 for your website |
| [Gateway and polling](docs/gateway.md) | How events arrive, intents, catching up after restarts |
| [REST and rate limits](docs/rest.md) | Raw API calls, routes, limits |
| [Errors](docs/errors.md) | Error types and handling them |
| [Utilities](docs/utilities.md) | Collection, formatters, durations, constants |
| [Hosting](docs/hosting.md) | Running on Yapin’s bot hosting or your own machine |
| [Coming from discord.js](docs/migrating-from-discord-js.md) | What's the same and what differs |
| [Coming from yapper.js](docs/migrating-from-yapper.md) | Moving from the official single-file SDK |

There are runnable bots in [examples/](examples/).

## Examples at a glance

### Buttons

```js
import { ActionRowBuilder, ButtonBuilder } from 'yapin.js';

client.command('vote', 'Pizza tonight?', (ctx) => ctx.reply({
  content: 'Pizza tonight?',
  components: [new ActionRowBuilder(ButtonBuilder.success('Yes', 'vote:yes'), ButtonBuilder.danger('No', 'vote:no'))],
}));

client.button('vote:{choice}', (i) => i.ephemeral(`You voted ${i.params.choice}`));
```

### Moderation with checks and typed options

```js
client.commands.register({
  name: 'timeout',
  description: 'Time someone out',
  serverOnly: true,
  permissions: ['timeout_members'],
  options: [
    { name: 'member', type: 'member', required: true },
    { name: 'length', type: 'duration', default: 10 * 60_000, max: 28 * 86_400_000 },
    { name: 'reason', rest: true },
  ],
  async run(ctx) {
    const { member, length, reason } = ctx.values;
    await member.timeout(length, reason ?? undefined);
    await ctx.reply(`${member.displayName} is timed out.`);
  },
});
```

### Waiting for an answer

```js
client.command('quiz', 'A quick question', async (ctx) => {
  await ctx.reply('What is 6 × 7?');
  const answers = await ctx.channel.awaitMessages({ filter: (m) => m.authorId === ctx.authorId, max: 1, time: 15_000 });
  ctx.send(answers.first()?.content === '42' ? 'Correct!' : 'Nope, 42.');
});
```

### A module file with hot reload

```js
// modules/fun.js
import { Module } from 'yapin.js';

export default class Fun extends Module {
  commands = [{ name: 'joke', description: 'Tell a joke', run: (ctx) => ctx.reply('I know a UDP joke, but you might not get it.') }];
  events = { serverMemberAdd: (member) => this.logger.info(`${member.displayName} joined`) };
}

// bot.js
await client.modules.load('./modules');
client.modules.watch(); // edit modules/fun.js, save, and it reloads
```

## Requirements

- Node.js 18.17 or newer. For the WebSocket gateway, use Node 22+ or install `ws` (Node 18 to 21 poll without it).
- Optional: `@livekit/rtc-node` and ffmpeg for music bots.

## Testing

```sh
npm test
```

The test suite runs entirely offline against a mock Yapin’ API. It covers login, commands, buttons, gateway behaviour, modules and collectors. `npm run typecheck` checks the TypeScript declarations.

## Contributing

Bug reports, docs fixes and pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) to get started, and [SUPPORT.md](SUPPORT.md) if you need help. Please report security problems privately as described in [SECURITY.md](SECURITY.md). Everyone taking part is expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

MIT
