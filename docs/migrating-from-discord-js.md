# Coming from discord.js

yapin.js follows discord.js wherever Yapin’ works the same way, so most of what you know carries over. This page lists what's different.

## Same

- `new Client()`, `client.login()`, `client.on(Events.X, …)`, `client.destroy()`.
- `Collection`, with the same helpers.
- Managers with `cache` and `fetch()`: `client.channels`, `client.users`, `server.members`, `server.roles`, `channel.messages`.
- `EmbedBuilder`, `ButtonBuilder`, `ActionRowBuilder`, `ContainerBuilder`, `SectionBuilder`, `TextDisplayBuilder`, `MediaGalleryBuilder`, `SeparatorBuilder`, `ThumbnailBuilder` and `FileBuilder`, with the same method names.
- `message.reply()`, `channel.send()`, `message.edit()`, `message.react()`, `channel.bulkDelete()`, collectors and `awaitMessages`.
- `interaction.reply({ ephemeral: true })`, `interaction.update()`, `interaction.deferUpdate()`, `interaction.followUp()`, `interaction.customId`.
- `member.kick()`, `member.ban()`, `member.timeout(ms, reason)`, `member.roles.add()`, `member.displayName`.
- `user.displayName`, `user.globalName`, and `toString()` mentions.

## Different

| discord.js | yapin.js | Why |
| --- | --- | --- |
| Guilds | **Servers**: `client.servers`, `message.server`, `Server`. `client.guilds` and `ctx.guild` work as aliases. | Yapin’ calls them servers |
| Snowflake ids | UUID strings | |
| `GatewayIntentBits` (bitfield) | `Intents` (event type names): `[Intents.Messages, Intents.Interactions]` | Yapin’ filters by event type. Message content is always included. |
| Slash commands with registered options | Commands are messages: `/name args`. Options are parsed by yapin.js (typed, with errors explained). Yapin’ shows names and descriptions in the `/` menu. | That's how Yapin’ commands work |
| `interactionCreate` for commands | `client.commands.register({ run(ctx) })` with a `CommandContext` | Commands aren't interactions |
| `interaction.options.getUser()` | `ctx.options.getUser()`, or `ctx.values.user` | |
| `SlashCommandBuilder` | Plain objects: `{ name, description, options: [{ name, type }] }` | |
| `REST` + `Routes.applicationCommands()` deploy script | Nothing: commands sync on login and on change | |
| `guildMemberAdd` / `guildMemberRemove` | `serverMemberAdd` / `serverMemberRemove` | |
| `voiceStateUpdate(old, new)` | `voiceJoin(state)` and `voiceLeave(state)` | Yapin’ sends join and leave events |
| `messageReactionAdd(reaction, user)` | The same, but `reaction.emoji` is a string | |
| `PermissionsBitField` | `Permissions` with names (`has('kick_members')`) | Yapin’ roles have named permissions |
| Select menus, modals, autocomplete | Not on Yapin’ yet | |
| `interaction.deferReply()` | `deferUpdate()` / `ack()`. yapin.js acknowledges slow clicks for you. | |
| Message attachments (files) | `message.attachmentURL` to read. Post images by link (a link to a `.png` shows as a picture). | Bots can't upload files yet |
| `setPresence({ activities: [...] })` | `client.user.setPresence({ status, activity: 'text' })` | One activity line |
| `client.user.setUsername()` | Changes the display name (`setDisplayName`) | Bot usernames are fixed |
| `@discordjs/voice` | `server.voice.connect(channel)` → `connection.play('song.mp3')` | Built in, with Yapin’'s encryption handled |
| Sharding | Not needed | One connection carries every server |

## Before and after

```js
// discord.js
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== 'kick') return;
  const member = interaction.options.getMember('target');
  await member.kick();
  await interaction.reply(`Kicked ${member.displayName}`);
});

// yapin.js
client.commands.register({
  name: 'kick',
  description: 'Kick someone',
  permissions: ['kick_members'],
  options: [{ name: 'target', type: 'member', required: true }],
  async run(ctx) {
    const member = ctx.options.getMember('target');
    await member.kick();
    await ctx.reply(`Kicked ${member.displayName}`);
  },
});
```

discord.js-style command files (`export const data = { name, description }; export async function execute(ctx) {}`) load as they are with `client.commands.load('./commands')`. Swap `interaction` for `ctx` inside.

```js
// Buttons: the same builders
const row = new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId('ok').setLabel('OK').setStyle(ButtonStyle.Primary),
);
await channel.send({ content: 'Ready?', components: [row] });

// Routing clicks, without a big switch
client.components.button('ok', (i) => i.update({ content: 'Go!', components: [] }));
```
