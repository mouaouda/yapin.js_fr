# Getting started

This guide takes you from nothing to a running bot with a few commands.

## 1. Make the bot account

1. In Yapin’, open **Settings → Developer**, type a name and press **Create**.
2. Open the **Token** tab and copy the token. It starts with `yb_` and is shown once. Never paste it anywhere public. If it leaks, press **New token**.
3. Add the bot to a server you manage, from the same screen or **Server settings → Bots → Your bots → Add**. Your own bots work in your own servers right away.

> Bots must use bot accounts. Automating your own account (a "selfbot") is against Yapin’s Terms.

## 2. Set up a project

```sh
mkdir my-bot && cd my-bot
npm init -y
npm install yapin.js
```

Open `package.json` and add `"type": "module"` so you can use `import`.

Keep the token out of your code. Put it in an environment variable called `YAPIN_TOKEN`; `client.login()` reads it automatically:

```sh
# macOS / Linux
export YAPIN_TOKEN=yb_your_token_here
# Windows PowerShell
$env:YAPIN_TOKEN = "yb_your_token_here"
```

You can also use a `.env` file with Node's built-in loader: run `node --env-file=.env bot.js`.

## 3. Write the bot

Create `bot.js`:

```js
import { Client, Events } from 'yapin.js';

const client = new Client({
  commands: { help: true }, // a built-in /help that lists your commands
});

// A command. People type /ping or !ping, and it shows up in the "/" menu.
client.command('ping', 'Is the bot alive?', (ctx) => ctx.reply('pong 🏓'));

// A command with an option.
client.commands.register({
  name: 'roll',
  description: 'Roll a die, like /roll 20',
  options: [{ name: 'sides', type: 'integer', min: 2, max: 1000, default: 6 }],
  run(ctx) {
    const { sides } = ctx.values;
    return ctx.reply(`🎲 ${1 + Math.floor(Math.random() * sides)} (d${sides})`);
  },
});

// Any message that @mentions the bot.
client.on(Events.MessageCreate, (message) => {
  if (message.mentioned) message.reply(`hey ${message.author}, try /help`);
});

client.on(Events.ClientReady, (c) => console.log(`Logged in as ${c.user.displayName}`));

client.login();
```

## 4. Run it

```sh
node bot.js
```

You'll see `[yapin] YourBot is online with 3 commands`. In your server, type `/ping`.

Not working? In **Settings → Developer → your bot → Get started**, press **Send test event**. Then listen for it:

```js
client.on(Events.Test, (data) => console.log('test event!', data));
```

If that prints, the bot is connected. Turn on debug logs to see more:

```js
new Client({ logger: 'debug' });
```

## 5. Grow it

- Put commands in their own files and load a folder: see [Commands](commands.md#command-files).
- Add buttons, embeds and layouts: see [Components](components.md) and [Embeds](embeds.md).
- Split features into [modules](modules.md) and hot-reload them while you work.
- Give the bot a picture once, from code: `await client.user.setAvatar('./avatar.png')`.

## TypeScript

The type definitions come with the package. In TypeScript, use `"module": "NodeNext"`:

```ts
import { Client, type CommandDefinition } from 'yapin.js';

const ping: CommandDefinition = { name: 'ping', run: (ctx) => ctx.reply('pong') };
```

In plain JavaScript you get the same autocomplete in VS Code, and `// @ts-check` at the top of a file turns on type checking.

## Permissions your bot needs

A bot is a member, and anything beyond reading and posting is checked against the bot's own roles, just like for a person. Give the bot a role with **Manage messages** to delete or pin, **Kick**, **Ban** or **Timeout** for moderation, **Manage roles**, **Manage channels**, **Manage nicknames** or **Move Members** as needed. Without a role it can read, post, react and DM.
