# Gateway and polling

Yapin’ keeps every event for your bot for a day, and it can deliver them two ways. yapin.js picks the best one and switches between them by itself.

| | How | Needs |
| --- | --- | --- |
| **Gateway** | One WebSocket, events pushed instantly | The gateway turned on for your bot (it's in beta), and a runtime with WebSocket: Node 22+, Bun, Deno, or `npm i ws` |
| **Long polling** | `GET /events?after=…&wait=25`, answered the moment something happens | Nothing. It works on a laptop behind any router. |

Both carry the same events, with the same ids, in the same order, sharing one cursor. Switching never drops or repeats anything. Your handlers don't change.

## What happens

With `transport: 'auto'` (the default):

1. **Connect.** It opens the gateway, sends `resume` with the cursor, and heartbeats.
2. **Not on for the bot yet** (close code 4003). It polls, and tries the gateway again every 10 minutes.
3. **Drop or zombie** (a heartbeat with no ack). It reconnects with backoff and resumes, so nothing is missed.
4. **Keeps failing** (three times quickly). It polls for 5 minutes, then tries again.
5. **Too many sockets or connects** (4008, 4029). It polls for a minute.
6. **Bad token** (4004). It stops and emits an `error` with code `TokenInvalid`.

Listen to `connected` / `disconnected` to see this happen, or use `logger: 'debug'`:

```js
client.on(Events.Connected, ({ transport }) => console.log('events via', transport));
client.transport; // 'gateway' | 'polling'
client.ping;      // heartbeat round trip in ms over the gateway
```

Force one with `transport: 'gateway'` (never poll) or `transport: 'polling'` (never use the gateway). `gateway: false` also works for yapper.js compatibility.

Events are handed to your listeners one at a time, in order. Listeners themselves run concurrently, so a slow `async` handler doesn't hold up the next event.

## Intents

Ask only for what you use:

```js
import { Intents } from 'yapin.js';

new Client({ intents: [Intents.Messages, Intents.Interactions] });
```

| Intent | Events |
| --- | --- |
| `Intents.Messages` | `messageCreate` (and commands) |
| `Intents.Interactions` | `interactionCreate` (button clicks) |
| `Intents.Members` | `serverMemberAdd`, `serverMemberRemove` (or `MemberJoin` / `MemberLeave` alone) |
| `Intents.Reactions` | `messageReactionAdd`, `messageReactionRemove` |
| `Intents.Voice` | `voiceJoin`, `voiceLeave` |
| `Intents.Test` | `test` |
| `Intents.All` | everything (the same as leaving `intents` out) |

Over the gateway, Yapin’ filters for you (less traffic). When polling, events are filtered locally.

## Catching up after a restart

By default a bot starts from "now". To pick up where it left off, keep the cursor:

```js
new Client({ sequenceStore: '.yapin-seq' });                        // a file, written at most once a second
new Client({ sequenceStore: { get: () => db.get('seq'), set: (n) => db.set('seq', n) } });
```

On restart the bot gets everything it missed in the last day. Yapin’ always skips slash commands older than 15 minutes and button clicks that already expired, so a restarted bot doesn't answer yesterday's `/ping`. To skip older events too, add `maxEventAge`:

```js
new Client({ sequenceStore: '.yapin-seq', maxEventAge: 300 }); // only the last 5 minutes
```

`client.destroy()` saves the cursor one last time.

## Limits

- 2 open sockets per bot, 10 connects a minute, 30 messages per 10 seconds per socket (only heartbeats are sent).
- The bot shows as online while the socket is open or while it polls.
- Events are kept for one day.

## The protocol

For the curious, or for writing your own client:

```
wss://rt.yapper.website/bot

← { "op": "hello", "heartbeat_interval": 30000 }
→ { "op": "identify", "token": "yb_…" }                      start from now
→ { "op": "resume", "token": "yb_…", "seq": 1234 }           everything after event 1234
← { "op": "ready", "bot": { "id": "…", "name": "…" }, "seq": 1234 }
← { "op": "event", "s": 1235, "t": "message", "d": { "id": 1235, "type": "message", "data": { … }, "created_at": "…" } }
→ { "op": "heartbeat" }
← { "op": "heartbeat_ack", "seq": 1235 }
```

You must identify within 10 seconds. `identify` and `resume` also take `events` (a list of types) and `max_age`. Going 75 seconds without a heartbeat closes the socket. The close codes, all exported as `GatewayCloseCodes`, are 4002 (identify late or out of order), 4003 (gateway not on), 4004 (wrong token), 4008 (too many sockets), 4009 (no heartbeat), 4029 (rate limited) and 1013 (busy).
