# Voice

## Voice events

```js
client.on(Events.VoiceJoin, (state) => console.log(`${state.userId} joined ${state.channelId}`));
client.on(Events.VoiceLeave, (state) => console.log(`${state.userId} left ${state.channelId}`));
```

A `VoiceState` has `userId`, `channelId`, `serverId`, `joined`, `user`, `member`, `channel`, `server` and `isMe` (it's about the bot itself, like a moderator disconnecting it).

A move is a `voiceLeave` plus a `voiceJoin`, in either order. A dropped connection that comes back sends both too.

## Who is in voice

`server.voice.states` is kept up to date from these events. For the real picture right now:

```js
const channels = await server.voice.fetch();     // Collection<channelId, userId[]>, empty channels included
const where = await server.voice.channelOf(userId);
member.voice.channelId;                          // as last seen
voiceChannel.memberIds;
```

These lookups are limited to 60 a minute per bot.

## Moving people

These need Move Members, and a higher role than the person:

```js
await server.voice.move(userId, otherChannel);   // or member.voice.move(channel)
await server.voice.disconnect(userId);           // or member.voice.disconnect()
```

Up to 30 moves and disconnects a minute per bot. The person must be allowed to join the new channel, and the bot must see both channels. A `409` means they aren't in voice. These never work on Yapin’ staff.

### Join to create

Make a voice channel called **Join to create**, then give the bot Manage channels and Move Members:

```js
const made = new Set();

client.on(Events.VoiceJoin, async (state) => {
  const channel = await client.channels.fetch(state.channelId);
  if (channel.name !== 'Join to create') return;
  const user = await client.users.fetch(state.userId);
  const room = await state.server.channels.create(`${user.displayName}'s room`, { type: 'voice', category: channel.categoryId });
  made.add(room.id);
  await state.server.voice.move(state.userId, room);
});

client.on(Events.VoiceLeave, async (state) => {
  if (!made.has(state.channelId)) return;
  const channels = await state.server.voice.fetch();
  if (channels.get(state.channelId)?.length) return; // someone's still there
  made.delete(state.channelId);
  await client.channels.cache.get(state.channelId)?.delete();
});
```

## Music bots

Bots can join a voice channel and play audio. You need `npm i @livekit/rtc-node`, plus [ffmpeg](https://ffmpeg.org) to decode files.

> **Only play audio you have the rights to.** Streaming from YouTube, Spotify, SoundCloud and similar services breaks their terms, and so does ripping their audio. Use your own music, royalty-free or Creative Commons tracks (with the credit they ask for), or a radio stream that allows it. Yapin’ turns off bots that play things they don't have the rights to.

```js
client.commands.register({
  name: 'play',
  description: 'Play a song from the music folder',
  serverOnly: true,
  options: [{ name: 'song', required: true }],
  async run(ctx) {
    const name = ctx.values.song.replace(/[^\w-]/g, '');
    const channelId = await ctx.server.voice.channelOf(ctx.authorId);
    if (!channelId) return ctx.reply('Join a voice channel first');

    const connection = await ctx.server.voice.connect(channelId);
    await ctx.reply(`Playing ${name}`);
    await connection.play(`music/${name}.mp3`);   // resolves when the song ends
    await connection.leave();
  },
});
```

`connect()` does the whole join for you:

1. It gets a ticket from Yapin’.
2. It connects with LiveKit.
3. It hands the bot's media key to everyone in the call.
4. It publishes an audio track.

Calls on Yapin’ are end-to-end encrypted. Each person's copy of the key is sealed so only they can open it, and without this step nobody would hear the bot.

### VoiceConnection

| | |
| --- | --- |
| `play(input, { seek, args, ffmpeg })` | A file path, an http(s) URL, or a Readable stream. Anything ffmpeg can read. Resolves when it finishes or is stopped. |
| `playPCM(stream)` | Raw 16-bit little-endian PCM, 48 kHz stereo by default |
| `pause()`, `resume()`, `stop()` | |
| `setVolume(0 to 2)` | 1 is normal |
| `leave()` | Leave the call |
| `muted` | The bot joined muted (no Speak permission, or muted by a moderator) |
| `e2ee` | The call is encrypted (it was handled) |
| events | `'start'`, `'finish'`, `'error'`, `'disconnect'` |

`server.voice.connection` / `client.voice.connections` give the active connections. `server.voice.leave()` takes the bot out even if its own code lost track. Options for `connect`: `sampleRate` (48000), `channels` (2), `bitrate` (128000), and `rtc` to pass the LiveKit module yourself.

### A queue

```js
const queues = new Map(); // server id → { connection, songs }

async function enqueue(server, channelId, song) {
  let q = queues.get(server.id);
  if (!q) {
    q = { connection: await server.voice.connect(channelId), songs: [] };
    queues.set(server.id, q);
    q.connection.on('disconnect', () => queues.delete(server.id));
  }
  q.songs.push(song);
  if (q.songs.length === 1) playNext(server.id);
}

async function playNext(serverId) {
  const q = queues.get(serverId);
  while (q?.songs.length) {
    await q.connection.play(`music/${q.songs[0]}.mp3`).catch(console.error);
    q.songs.shift();
  }
  await q?.connection.leave();
}

// skip: queues.get(server.id)?.connection.stop()
```

### Rules

The bot gets the same checks as a member: it must see the channel and have Connect, and a server ban, voice ban or timeout keeps it out. It can't hear anyone or share video. It can be in one voice channel per server; joining another leaves the first. Moderators can mute or disconnect it but not move it. Up to 10 joins and leaves a minute per bot.

`server.voice.join(channel)` gives you the raw LiveKit ticket if you want to connect with your own code. Then you have to do the key handoff yourself, or nobody hears you.
