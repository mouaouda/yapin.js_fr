# Utilities

## Collection

Every cache is a `Collection`: a `Map` with array-style helpers.

```js
import { Collection } from 'yapin.js';

const members = await server.members.fetch();
members.filter((m) => m.roles.has('Mods'));          // a Collection
members.map((m) => m.displayName);                   // an array
members.find((m) => m.user.username === 'alice');
members.first(); members.first(5); members.last(); members.random();
members.some(fn); members.every(fn); members.reduce(fn, 0);
members.partition((m) => m.user.bot);                // [bots, people]
members.sort((a, b) => a.joinedAt - b.joinedAt);      // in place; toSorted() for a copy
members.sweep((m) => m.partial);                     // remove matching, returns the count
members.ensure(id, () => makeDefault());
a.concat(b); a.intersect(b); a.difference(b); a.equals(b);
```

`LimitedCollection(maxSize)` forgets its oldest entries past `maxSize`. Message caches use it.

## Formatters

```js
import { bold, italic, strikethrough, inlineCode, codeBlock, quote, hyperlink, heading,
  unorderedList, orderedList, userMention, channelMention, formatEmoji, escapeMarkdown } from 'yapin.js';

bold('hi')                      // **hi**
codeBlock('js', 'let x = 1')    // ```js …```
hyperlink('docs', 'https://…')  // [docs](https://…)
heading('Title', 2)             // ## Title
userMention(id)                 // <@id>   (or just `${user}`)
channelMention(id)              // <#id>   (or `${channel}`)
formatEmoji('party', id)        // <:party:id>
escapeMarkdown(userInput)       // shows *stars* literally
```

`MentionPatterns.User`, `.Channel` and `.Emoji` are global RegExps for picking mentions out of text. `message.mentions` already does that for you.

## CDN links

```js
import { cdn, CDN } from 'yapin.js';

cdn('icons', server.iconPath);    // https://files.yapper.website/icons/<path>
CDN.avatar(path); CDN.banner(path); CDN.icon(path); CDN.attachment(path);
```

Paths starting with `/` (built-in pictures) point at `https://www.yapin.gg`. `null` means there's no picture. A new picture always gets a new path, so links are safe to cache.

## Durations

```js
import { parseDuration, formatDuration } from 'yapin.js';

parseDuration('1h30m');    // 5400000
parseDuration('2 days');   // 172800000
parseDuration('soon');     // null
formatDuration(5400000);   // '1h 30m'
```

Units: `ms`, `s`, `m` / `min`, `h`, `d`, `w`, and their long forms.

## Long messages

```js
import { splitMessage } from 'yapin.js';
for (const part of splitMessage(longText)) await channel.send(part);   // ≤ 2000 each, split on lines then spaces
```

## Constants

| | |
| --- | --- |
| `Events` | Client event names |
| `Intents` | Event types to receive, see [Gateway](gateway.md#intents) |
| `ChannelType` | `Text`, `Voice`, `DM`, `Category` |
| `ButtonStyle` | `Primary`, `Secondary`, `Success`, `Danger`, `Link` |
| `ComponentType` | Components V2 type numbers |
| `SeparatorSpacingSize` | `Small`, `Large` |
| `MessageFlags` | `IsComponentsV2` |
| `PresenceStatus` | `Online`, `Idle`, `DoNotDisturb` |
| `PermissionFlags` | Permission names |
| `Colors` | `Blurple`, `Green`, `Red`, `Yapin`, … |
| `Limits` | Every documented limit: `Limits.MessageContent` (2000), `Limits.EmbedTotal` (6000), … |
| `AllowedMediaHosts` | Hosts allowed for embed pictures |
| `GatewayOpcodes`, `GatewayCloseCodes`, `GatewayEventTypes` | The gateway protocol |
| `Routes` | Every API path |
| `version` | The yapin.js version |
