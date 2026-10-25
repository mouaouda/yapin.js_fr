# Events

Listen with `client.on(event, listener)`. Use the `Events` constants (`Events.MessageCreate`) or the plain strings (`'messageCreate'`). Listeners can be `async`. If one throws or rejects, the error goes to the `error` event instead of crashing the bot.

```js
import { Events } from 'yapin.js';

client.on(Events.MessageCreate, async (message) => {
  if (message.content === 'hello') await message.reply('hi!');
});
```

## Yapin’ events

| Event | Arguments | When |
| --- | --- | --- |
| `ready` (`Events.ClientReady`) | `client` | Once, after login |
| `messageCreate` | [`Message`](structures.md#message) | A message in a server the bot is in, from someone else |
| `serverMemberAdd` | [`ServerMember`](structures.md#servermember) | Someone joined (not sent for other bots) |
| `serverMemberRemove` | `ServerMember` | Someone left. This is the cached member if there was one, else a partial. |
| `messageReactionAdd` | [`MessageReaction`](structures.md#messagereaction), `User` | Someone reacted |
| `messageReactionRemove` | `MessageReaction`, `User` | Someone took a reaction back |
| `interactionCreate` | [`ButtonInteraction`](components.md#the-interaction) | Someone clicked one of the bot's buttons |
| `voiceJoin` | [`VoiceState`](voice.md#voice-events) | Someone joined a voice channel the bot can see |
| `voiceLeave` | `VoiceState` | Someone left one. A move is a leave plus a join, in either order. |
| `test` | `{ bot, by, at, hello }` | The **Send test event** button in Settings → Developer |

Some things Yapin’ doesn't send:

- The bot's own messages.
- Messages from other bots and webhooks, unless you set `ignoreBots: false`. Check `message.authorBot` if you do.
- DMs people send to the bot. A bot can still open a DM and post there.

## Command events

| Event | Arguments | When |
| --- | --- | --- |
| `commandRun` | `ctx` | A command is about to run (checks and arguments passed) |
| `commandSuccess` | `ctx`, `durationMs` | It finished without throwing |
| `commandDenied` | `UserError`, `ctx` | A check, cooldown or bad argument stopped it. The person was already told why. |
| `commandError` | `Error`, `ctx` | It threw something unexpected. Without a listener, this goes to `error`. |
| `commandsSynced` | `commands` | The list was sent to Yapin’ |

## Framework events

| Event | Arguments | When |
| --- | --- | --- |
| `connected` | `{ transport, previous }` | Events started flowing over `'gateway'` or `'polling'` |
| `disconnected` | `{ transport, code }` | The gateway socket closed. It reconnects by itself. |
| `rateLimited` | `{ method, path, retryAfter, global, message }` | A request hit a rate limit. It's retried for you when that's possible. |
| `moduleLoad` / `moduleUnload` | module record | A module came or went |
| `raw` | `{ id, type, data, created_at }` | Every event exactly as Yapin’ sent it, before processing |
| `error` | `Error` | Something failed: a listener, a command, a send nobody awaited |
| `warn` | `string` | Something worth knowing, like the gateway failing and polling taking over |
| `debug` | `string` | Detailed logs (also printed with `logger: 'debug'`) |

### Errors

Without an `error` listener, errors are logged with where they came from, like `[module fun] [/joke]`. With a listener, you decide:

```js
client.on(Events.Error, (error) => {
  console.error(error.module ?? '', error.command ?? '', error);
});
```

A `send` or `reply` you didn't `await` doesn't crash the bot if it fails (for example, from a missing permission). The error goes here instead. If you do `await` it, or call `.catch()`, you get the error as usual.

## Raw events

Want a field yapin.js doesn't map, or an event type it doesn't know yet? Use `raw`:

```js
client.on(Events.Raw, (event) => {
  if (event.type === 'message') console.log(event.data.channel_name);
});
```

## Intents

To cut traffic, receive only what you use:

```js
import { Client, Intents } from 'yapin.js';

new Client({ intents: [Intents.Messages, Intents.Interactions, Intents.Members] });
```

`Intents.Members`, `Intents.Reactions` and `Intents.Voice` are groups. Commands arrive as messages, so keep `Intents.Messages` if you have commands. Keep `Intents.Interactions` if you have buttons.
