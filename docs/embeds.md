# Embeds

Bot messages can carry up to 5 embed cards.

```js
import { EmbedBuilder } from 'yapin.js';

const embed = new EmbedBuilder()
  .setTitle('Match result')
  .setURL('https://example.com/match/42')
  .setDescription('**Blue** won 3-1. [Replay](https://example.com/r/42)')
  .setColor('#ff6b4a')
  .setAuthor({ name: 'Score Bot', iconURL: 'https://i.imgur.com/abc.png' })
  .addFields(
    { name: 'MVP', value: `${member}`, inline: true },
    { name: 'Time', value: '34:12', inline: true },
  )
  .setThumbnail('https://i.imgur.com/thumb.png')
  .setImage('https://media.tenor.com/x.gif')
  .setFooter({ text: 'Season 2' })
  .setTimestamp();

await channel.send({ embeds: [embed] });
await message.reply(embed);           // an embed on its own works too
```

| Method | Limit |
| --- | --- |
| `setTitle(text)` | 256 |
| `setDescription(text)` | 4096. Markdown and `[masked](links)` work. |
| `setURL(url)` | http(s), 512 |
| `setColor(color)` | `0xff6b4a`, `'#ff6b4a'`, `'ff6b4a'`, a name from `Colors` (`'Blurple'`, `'Red'`, …), `'Random'` or `[r, g, b]` |
| `setAuthor({ name, url, iconURL })` | name 256 |
| `addFields(...fields)` / `addField(name, value, inline)` | 10 fields; name 256, value 1024. Inline fields sit 3 to a row. |
| `setFields(...)`, `spliceFields(i, n, ...)` | |
| `setThumbnail(url)` / `setImage(url)` | https |
| `setFooter({ text, iconURL })` | text 2048 |
| `setTimestamp(date?)` | now if left out; `null` removes it |

Pass `null` to any setter to remove that part. Across one message's embeds there's a limit of 6000 characters, counting titles, descriptions, fields, author names and footers. `embed.length` tells you where you are.

Plain objects in the API shape work everywhere instead of a builder:

```js
channel.send({ embeds: [{ title: 'Hi', description: 'Plain objects work', color: 0x57f287 }] });
```

To change an embed you received, use `EmbedBuilder.from(message.embeds[0]).setColor('Red')`.

## Pictures

Pictures must be https links to Yapin’ uploads or one of these hosts: i.imgur.com, media.tenor.com, media.giphy.com, i.giphy.com, upload.wikimedia.org, raw.githubusercontent.com, avatars.githubusercontent.com, user-images.githubusercontent.com, i.ytimg.com, cdn.discordapp.com, media.discordapp.net, pbs.twimg.com, i.redd.it, static-cdn.jtvnw.net, i.scdn.co, s4.anilist.co, cdn.myanimelist.net, nekos.best and cdn.weeb.sh. The list is exported as `AllowedMediaHosts`.

yapin.js checks for https but doesn't check the host, so a host Yapin’ adds later works right away. A host that isn't allowed gets a 400 from Yapin’ that says so.

Avatars and server icons come as paths. Use `user.avatarURL()`, `server.iconURL()`, or `cdn(bucket, path)` to get a link.

A link straight to an image (`.png`, `.jpg`, `.gif`, `.webp`) in a message's content shows as a picture, so you can also post images by URL.
