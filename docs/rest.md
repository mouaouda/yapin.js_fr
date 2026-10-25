# REST and rate limits

Every method in yapin.js is a call to Yapin’s Bot API (`https://www.yapin.gg/api/bot/v1`) through `client.rest`. You can call it directly for anything yapin.js doesn't wrap yet:

```js
import { Routes } from 'yapin.js';

const { servers } = await client.rest.get(Routes.servers());
await client.rest.post(Routes.channelMessages(channelId), { body: { content: 'hi' } });
await client.rest.get(Routes.channelMessages(channelId), { query: { limit: 10, before: new Date() } });
await client.rest.put(Routes.meAvatar(), { body: pngBytes, contentType: 'image/png' });
```

| Option | |
| --- | --- |
| `body` | JSON-able data, or raw bytes / a Blob / FormData (with `contentType`) |
| `query` | An object. `undefined` and `null` are left out; Dates become ISO strings. |
| `timeout` | ms (default 30000) |
| `retries` | default 3 |
| `signal` | an AbortSignal |
| `auth` | `false` to send no token |

`Routes` has every path, with ids encoded for you: `Routes.server(id)`, `Routes.serverMember(id, userId)`, `Routes.channelMessageReaction(ch, msg, emoji)`, `Routes.interactionCallback(id, token)`, and the rest.

The REST client works on its own too, without a Client:

```js
import { REST, Routes } from 'yapin.js';
const rest = new REST({ token: process.env.YAPIN_TOKEN });
console.log(await rest.get(Routes.me()));
```

## Rate limits

| What | Limit |
| --- | --- |
| Messages | 30 a minute per server (per DM in DMs), and 30 a minute overall (300 for verified bots) |
| Replies to commands | The first 5 replies to a slash command (sent with `replyTo` within 15 minutes) don't count towards the overall limit |
| Button `reply` answers | The first 5 per click don't count towards the overall limit |
| Channel creation | 10 a minute per server |
| Voice moves / disconnects | 30 a minute; voice lookups 60 a minute |
| Bot joining / leaving voice | 10 a minute |
| Webhooks | 5 posts per 2 seconds per webhook, 30 a minute per channel |
| Commands | 100 per bot; names 1 to 32 characters, descriptions up to 100 |

This is how yapin.js handles them:

- **429 with `Retry-After`.** It waits that long, with a little jitter, and retries, up to `rest.retries` times. Other requests to the same route queue behind it instead of failing too. If it's the bot-wide limit ("300 messages a minute overall"), every send waits.
- **429 without `Retry-After`.** Waiting won't help (the same message twice, more than 10 answers to one click), so it throws a `RateLimitError` right away.
- **503 with `Retry-After`.** Yapin’ was busy and nothing was done, so it waits and retries.
- **Network errors.** GET, PUT and DELETE are retried with backoff. POST and PATCH aren't, since that could send something twice.
- **Long waits.** A `Retry-After` over `rest.maxRetryAfter` (60 s) throws instead of waiting.

Every 429 also emits `rateLimited` on the client, whether it's retried or not:

```js
client.on(Events.RateLimited, ({ method, path, retryAfter, global }) => {
  console.warn(`Rate limited on ${method} ${path} for ${retryAfter}s${global ? ' (bot-wide)' : ''}`);
});
```

Sending replies with `ctx.reply` / `message.reply` uses `replyTo`, which is exempt from the overall limit. Prefer it for command answers.

## Errors

A failed call throws a `YapinAPIError`:

```js
try {
  await member.kick();
} catch (error) {
  if (error.status === 403) return ctx.reply("I can't kick them (my role needs Kick members and to be higher than theirs).");
  throw error;
}
```

| Status | Meaning |
| --- | --- |
| 400 | Bad input. The message says what. |
| 401 | Missing or wrong token |
| 403 | Not allowed: the bot isn't in that server, or its roles lack the permission |
| 404 | Not found, or the bot can't see it |
| 409 | The person isn't in voice |
| 429 | Slow down (`RateLimitError`) |
| 503 | Yapin’ is busy |

The error has `status`, `message` (Yapin’'s own explanation), `method`, `path`, `body`, `retryAfter`, plus `isRateLimit`, `isMissingPermissions` and `isNotFound`.

## Pictures and file links

The API gives pictures as paths (`avatar_path`, `icon_path`, `attachment_path`). The structures turn them into links for you (`user.avatarURL()`, `server.iconURL()`, `message.attachmentURL`). To do it yourself, use `cdn(bucket, path)` from [utilities](utilities.md#cdn-links).

## CORS

Yapin’'s API allows any origin, so a bot can run in a browser page. Keep the token out of anything public.
