# Hosting

A Yapin’ bot needs no public URL, no open port and no port forwarding. It fetches its own events, so it runs fine on your own computer behind any router. Keep it running somewhere that stays on, and you're done.

## On your own machine or a VPS

```sh
YAPIN_TOKEN=yb_… node bot.js
```

To keep it running and restart it on crashes, use a process manager:

```sh
npm i -g pm2
pm2 start bot.js --name my-bot
pm2 save && pm2 startup
```

Or a systemd unit:

```ini
[Service]
ExecStart=/usr/bin/node /srv/my-bot/bot.js
Environment=YAPIN_TOKEN=yb_…
Restart=always
WorkingDirectory=/srv/my-bot
```

Shut down cleanly so the event cursor is saved and voice calls are left:

```js
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    await client.destroy();
    process.exit(0);
  });
}
```

Add `sequenceStore: '.yapin-seq'` so a restart catches up on what it missed. See [Gateway](gateway.md#catching-up-after-a-restart).

## Yapin’ bot hosting

[Verified bots](#getting-verified) can run on Yapin’s own containers: **Settings → Developer → your bot → Hosting**.

- **Plans.** Small (256 MB RAM, 0.25 CPU, 512 MB disk) fits most bots. Large (1 GB RAM, 1 CPU, 2 GB disk) is for bots in 50+ servers. With Yapin’ Plus, one Small bot may run free.
- **Code.** Link a public GitHub repo (and branch, up to 20 MB). A bot that uses yapin.js has dependencies, so use a repo rather than the single-file upload.
- **Install.** Dependencies from `package.json` are installed for you (install scripts don't run).
- **Start.** It runs your `start` script if it's exactly `node file.js`, else `main`, else `bot.js`, else `index.js`.
- **Token.** Your bot gets its own token as `process.env.YAPPER_BOT_TOKEN`, new on every start. `client.login()` reads it automatically, so don't put a token in your code.
- **Crashes.** The bot is restarted for you. Five crashes or three out-of-memory kills within 10 minutes stop it; check the logs on the tab.

A minimal `package.json` for hosting:

```json
{
  "type": "module",
  "main": "bot.js",
  "scripts": { "start": "node bot.js" },
  "dependencies": { "yapin.js": "^0.1.0" }
}
```

Hosting runs Node, so the gateway works out of the box on Node 22+.

## Getting verified

Your bot works in your own servers from the start. To let other servers add it:

1. On the **Community** tab, write a description (20 to 300 characters) and press **Publish for review**. Yapin’ checks every bot by hand.
2. Before verification, the bot must be in 3 servers you don't own, each with 3+ members. Press **Let server owners add it** and share its bot ID; anyone with Manage Server can add it from **Server settings → Bots → Have a bot ID?** (up to 10 servers until it's verified). Post it in a bot promo channel; please don't DM strangers.
3. Once approved, it gets a BOT tag, shows in Community bots and on /bots, can send 300 messages a minute instead of 30, and can use hosting.

For a bot made for one community, press **Ask for private verification** instead. You get the same tag, limits and hosting, but it isn't listed anywhere.

## Limits to plan for

- 2 bots per person (10 with Yapin’ Plus), 25 bots per server, 100 commands per bot.
- 30 messages a minute per server, and 30 overall (300 verified). See [REST](rest.md#rate-limits).
- The same content rules apply to bots as to people.
