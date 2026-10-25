// Both kinds of webhook:
//  - event webhooks: Yapin’ POSTs the bot's events here (set the URL in Settings → Developer → your bot → Advanced)
//  - a channel webhook: post into a channel with no bot at all
// Env: YAPIN_TOKEN, YAPIN_WEBHOOK_SECRET, and optionally ALERTS_WEBHOOK_URL.
import http from 'node:http';
import { Client, EmbedBuilder, Events, WebhookClient } from 'yapin.js';

const client = new Client();

client.on(Events.MessageCreate, (message) => {
  if (message.content === '!hook') message.reply('Got this one by webhook, gateway or polling, whichever came first.');
});

const server = http.createServer(client.webhookHandler({ secret: process.env.YAPIN_WEBHOOK_SECRET, path: '/yapin' }));
server.listen(3000, () => console.log('Event webhooks on http://localhost:3000/yapin'));

await client.login();

if (process.env.ALERTS_WEBHOOK_URL) {
  const alerts = new WebhookClient({ url: process.env.ALERTS_WEBHOOK_URL });
  await alerts.send({
    username: 'Status',
    embeds: [new EmbedBuilder().setTitle('Bot started').setColor('Green').setTimestamp()],
  });
}
