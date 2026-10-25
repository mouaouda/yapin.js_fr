# Collectors

Collectors wait for things to happen (messages, button clicks, reactions) for a while or until a limit.

## Options

| Option | |
| --- | --- |
| `filter(item, …, collected)` | Only collect what passes. May be async. |
| `time` | End after this many ms |
| `idle` | End after this many ms with nothing collected |
| `max` | End after collecting this many |
| `maxProcessed` | End after seeing this many, passing or not |
| `dispose` | Reactions: drop ones that get removed again |

Events: `collect`, `ignore` (seen but filtered out), `dispose`, and `end` with `(collected, reason)`. The reason is `'time'`, `'idle'`, `'limit'`, `'processedLimit'`, `'user'` (from `stop()`), or whatever you pass to `stop(reason)`.

## Messages

```js
const collector = channel.createMessageCollector({ filter: (m) => m.authorId === ctx.authorId, time: 30_000 });
collector.on('collect', (m) => console.log('got', m.content));
collector.on('end', (collected, reason) => console.log(`${collected.size} messages (${reason})`));
```

Or wait for them as a promise:

```js
const replies = await channel.awaitMessages({ filter: (m) => m.authorId === ctx.authorId, max: 1, time: 15_000 });
const answer = replies.first();
if (!answer) return ctx.send('No answer, never mind.');
```

Add `errors: ['time']` to reject instead of resolving when time runs out.

## Button clicks

```js
const message = await ctx.reply({ content: 'Pick one', components: [row] });

// One click
const click = await message.awaitMessageComponent({ filter: (i) => i.userId === ctx.authorId, time: 60_000 });
await click.update({ content: `You picked ${click.customId}`, components: null });

// Many clicks
const collector = message.createMessageComponentCollector({ time: 120_000 });
collector.on('collect', (i) => i.update({ content: `Last click: ${i.customId}` }));
collector.on('end', () => message.edit({ components: null }));
```

`awaitMessageComponent` rejects when time runs out. The general `InteractionCollector` narrows by `message`, `channel`, `server`, `user` and `customId` (a string or RegExp):

```js
import { InteractionCollector } from 'yapin.js';
new InteractionCollector(client, { channel, customId: /^quiz:/, time: 60_000 });
```

Clicks collected this way still go to `client.components` handlers. If nothing answers, the auto-ack covers it.

## Reactions

```js
const message = await ctx.reply('React 👍 to join');
await message.react('👍');
const collector = message.createReactionCollector({
  filter: (reaction, user) => reaction.emoji === '👍' && !user.bot,
  time: 60_000,
  dispose: true,
});
collector.on('end', (collected) => ctx.send(`${collected.size} joined`));
```

Collected reactions are keyed `"emoji:userId"`.

## Async iteration

Every collector is an async iterator:

```js
const collector = channel.createMessageCollector({ time: 60_000 });
for await (const message of collector) {
  if (message.content === 'stop') collector.stop();
  else await message.react('✅');
}
```

The loop ends when the collector does.

`await collector.next` gives the next item, or rejects if the collector ends first.
