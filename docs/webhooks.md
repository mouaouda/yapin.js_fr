# Webhooks

There are two kinds:

- **Channel webhooks** post into a channel without a bot. They're good for CI, alerts and feeds.
- **Event webhooks** have Yapin’ POST your bot's events to your server, if you host one with a public https URL.

## Channel webhooks

People with Manage Webhooks make them in **Edit channel → Webhooks** (up to 10 per channel). Each gets a name and picture, and a secret URL that's shown once.

```js
import { WebhookClient, EmbedBuilder } from 'yapin.js';

const hook = new WebhookClient({ url: process.env.DEPLOY_WEBHOOK_URL });
// or new WebhookClient({ id, token })

await hook.send('Deploy finished');
await hook.send({
  username: 'CI',                                    // up to 80 characters, this message only
  avatarURL: 'https://i.imgur.com/ci.png',
  embeds: [new EmbedBuilder().setTitle('Build #42').setColor('Green')],   // up to 10, with 25 fields each
  allowedMentions: { parse: ['users'] },             // the default: only users are pinged
});
```

`send()` returns the posted message (Yapin’'s `?wait=true`). Pass `wait: false` to skip that. `hook.fetchWebhook()` returns the webhook's info.

Webhooks can post up to 5 times per 2 seconds, and 30 times a minute per channel. A 429 is waited out and retried. Other errors are `YapinAPIError`s whose `code` is one of `WebhookErrorCodes`: `UnknownWebhook` (10015), `InvalidToken` (50027), `EmptyMessage` (50006), `InvalidFormBody` (50035), `InvalidJSON` (50109), `MissingAccess` (50001) or `PayloadTooLarge` (40005). A webhook stops working if the person who made it is banned from the server.

## Event webhooks

Set a URL in **Settings → Developer → your bot → Advanced**, and Yapin’ also POSTs every event there. The requests are signed with your webhook secret (shown on the same tab). Polling or the gateway keeps working alongside.

```js
import http from 'node:http';
import { Client } from 'yapin.js';

const client = new Client();
http.createServer(client.webhookHandler({ secret: process.env.YAPIN_WEBHOOK_SECRET })).listen(3000);
await client.login();
```

The handler:

1. Checks the `X-Yapper-Signature` header (an HMAC-SHA256 of the raw body) and rejects bad ones with 401.
2. Answers 200 at once. Yapin’ waits 3 seconds and doesn't retry.
3. Feeds the event into the client.

Each event id is handled once, whether it arrives by webhook, gateway or polling. That means you can run both, and nothing is missed if a webhook delivery fails.

With Express, give it the raw body:

```js
const handler = client.webhookHandler({ secret });
app.post('/yapin', express.raw({ type: 'application/json' }), (req, res) => {
  req.rawBody = req.body;
  return handler(req, res);
});
```

Other helpers:

```js
import { startWebhookServer, verifyWebhookSignature } from 'yapin.js';

await startWebhookServer(client, { port: 3000, path: '/yapin', secret });
verifyWebhookSignature(rawBody, req.headers['x-yapper-signature'], secret); // true / false
```
