# The Client

`Client` is your bot. It connects to Yapin’, keeps caches of what it sees, turns events into objects, and gives you managers for everything else.

```js
import { Client } from 'yapin.js';

const client = new Client({ /* options */ });
await client.login(); // resolves once the bot is ready
```

`login()` resolves when the bot is ready. By then it has fetched its own profile, sent your commands to Yapin’ and started receiving events. The bot keeps running until you call `client.destroy()`.

## Options

Every option is optional.

| Option | Default | What it does |
| --- | --- | --- |
| `token` | `YAPIN_TOKEN`, then `YAPPER_BOT_TOKEN` | The bot token. You can also pass it to `login(token)`. |
| `prefixes` | `['/', '!']` | Command prefixes. Can be longer than one character (`'yap!'`). Can be a function `(message) => prefixes` for per-server prefixes; it may be async. `prefix: '?'` is accepted too. |
| `intents` | all events | Which event types to receive, like `[Intents.Messages, Intents.Interactions]`. See [Gateway](gateway.md#intents). |
| `ignoreBots` | `true` | Skip messages from other bots and webhooks, so two bots can't answer each other forever. |
| `transport` | `'auto'` | `'auto'` uses the gateway when it can and polls otherwise. `'gateway'` or `'polling'` force one. |
| `maxEventAge` | `null` | When catching up after a restart, skip events older than this many seconds (up to 86400). |
| `sequenceStore` | `null` | Remember the event cursor across restarts: a file path like `'.yapin-seq'`, or `{ get, set }`. See [Gateway](gateway.md#catching-up-after-a-restart). |
| `presence` | `null` | Set on login: `{ status: 'online' \| 'idle' \| 'dnd', activity: 'Playing chess' }`. |
| `commands.help` | `false` | Adds the built-in `/help`. `true`, or `{ name, color, title, aliases }`. |
| `commands.autoSync` | `true` | Send the command list to Yapin’ on login and whenever it changes. |
| `commands.replyOnError` | `true` | Tell people when a command fails (bad arguments, missing permissions…). |
| `commands.errorMessage` | `'Something went wrong running that command.'` | The reply for unexpected errors. |
| `commands.formatError` | `null` | `(error, ctx) => payload \| null` to write your own error replies. |
| `commands.owners` | `[]` | Extra user ids treated as owners for `ownerOnly`, on top of the bot's owner. |
| `commands.ownersBypassCooldowns` | `true` | Owners skip cooldowns. |
| `commands.mentionPrefix` | `true` | `@Bot ping` works like `/ping`. |
| `commands.caseSensitive` | `false` | Make `/PING` different from `/ping`. |
| `commands.registerAliases` | `false` | List aliases in the `/` menu too. They count towards the 100-command limit. |
| `components.autoAck` | `true` | Acknowledge button clicks no handler answered, so people don't see "This interaction failed". |
| `components.autoAckAfter` | `2500` | When to do that, in ms. Yapin’ allows 3 seconds. |
| `cache.messages` | `100` | Messages kept per channel. |
| `cache.users` / `cache.members` | `Infinity` | Limits for those caches. |
| `rest.timeout` | `30000` | Per-request timeout, in ms. |
| `rest.retries` | `3` | Retries for rate limits, busy responses and network errors on safe requests. |
| `rest.maxRetryAfter` | `60` | The longest `Retry-After` (in seconds) that is waited out; longer ones throw. |
| `logger` | info level | `false` to silence, `'debug'` for everything, or your own logger (anything with `debug`, `info`, `warn` and `error`, like pino). |
| `voice.rtc` | auto | The `@livekit/rtc-node` module, if you want to pass it yourself. |
| `WebSocket` | built in | A WebSocket class for the gateway. `false` turns the gateway off. |
| `baseURL`, `gatewayURL`, `fetch` | Yapin’s | For proxies and tests. |

## Properties

| Property | What it is |
| --- | --- |
| `client.user` | The bot's own account: a `ClientUser` with `setAvatar`, `setPresence` and so on. Available after login. |
| `client.application` | `{ id, name, public, ownerId }` |
| `client.servers` (`client.guilds`) | Servers: [ServerManager](managers.md) |
| `client.channels` | Every channel seen: [ChannelManager](managers.md) |
| `client.users` | Every user seen: [UserManager](managers.md) |
| `client.commands` | The [command handler](commands.md) |
| `client.components` | The [button router](components.md) |
| `client.modules` | [Modules](modules.md) |
| `client.voice` | The bot's own [voice connections](voice.md) |
| `client.rest` | The [REST client](rest.md) for raw API calls |
| `client.stream` | The [event stream](gateway.md) |
| `client.logger` | The logger in use |
| `client.readyAt`, `client.uptime`, `client.isReady()` | When the bot became ready |
| `client.transport` | `'gateway'` or `'polling'` |
| `client.ping` | Gateway heartbeat round trip in ms, or `null` while polling |

## Methods

| Method | What it does |
| --- | --- |
| `login(token?)` | Connects. Resolves with the token once ready. |
| `destroy()` | Disconnects, leaves voice, saves the event cursor. |
| `send(channelId, payload)` | Sends to a channel by id without fetching it first. |
| `command(name, description, run)` | Shorthand for `commands.register`. |
| `button(pattern, handler)` | Shorthand for `components.button`. |
| `webhookHandler({ secret })` | A Node `(req, res)` handler for [event webhooks](webhooks.md#event-webhooks). |

## Shutting down cleanly

```js
process.on('SIGINT', async () => {
  await client.destroy();
  process.exit(0);
});
```

## Profile and presence

```js
await client.user.setAvatar('./avatar.png');         // a path, an https URL, a Buffer or a Blob (PNG/JPG/GIF/WebP, 8 MB)
await client.user.setBanner('./banner.png');         // 10 MB
await client.user.edit({ displayName: 'Dice Bot', bio: 'Rolls dice. /roll 2d6' });
await client.user.setPresence({ status: 'dnd', activity: 'Moderating' });
await client.user.setActivity('with fire');          // keeps the status
await client.user.setAvatar(null);                   // removes it
```

The picture sticks, so you only need to set it once.
