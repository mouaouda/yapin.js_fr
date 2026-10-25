// A music bot that plays files from ./music, with a queue.
// Needs: npm i @livekit/rtc-node, and ffmpeg on your PATH.
// Only play audio you have the rights to (your own, royalty-free, or Creative Commons).
import { readdir } from 'node:fs/promises';
import { Client } from 'yapin.js';

const client = new Client();
const queues = new Map(); // server id → { connection, songs: string[] }

async function songs() {
  return (await readdir('music').catch(() => [])).filter((f) => /\.(mp3|ogg|flac|wav|m4a)$/i.test(f));
}

async function playQueue(serverId) {
  const queue = queues.get(serverId);
  while (queue?.songs.length) {
    try {
      await queue.connection.play(`music/${queue.songs[0]}`);
    } catch (error) {
      client.logger.error(`Couldn't play ${queue.songs[0]}:`, error.message);
    }
    queue.songs.shift();
  }
  await queue?.connection.leave();
}

client.commands.register({
  name: 'play',
  description: 'Queue a song from the music folder',
  serverOnly: true,
  options: [{ name: 'song', rest: true, required: true }],
  async run(ctx) {
    const wanted = ctx.values.song.toLowerCase();
    const file = (await songs()).find((f) => f.toLowerCase().startsWith(wanted));
    if (!file) ctx.error(`No song starting with "${ctx.values.song}". Try /songs.`);
    const channelId = await ctx.server.voice.channelOf(ctx.authorId);
    if (!channelId) ctx.error('Join a voice channel first.');

    let queue = queues.get(ctx.serverId);
    if (!queue) {
      queue = { connection: await ctx.server.voice.connect(channelId), songs: [] };
      queues.set(ctx.serverId, queue);
      queue.connection.on('disconnect', () => queues.delete(ctx.serverId));
    }
    queue.songs.push(file);
    await ctx.reply(queue.songs.length === 1 ? `▶️ Playing **${file}**` : `➕ Queued **${file}** (#${queue.songs.length})`);
    if (queue.songs.length === 1) playQueue(ctx.serverId);
  },
});

client.command('skip', 'Skip the current song', (ctx) => {
  const queue = queues.get(ctx.serverId);
  if (!queue) return ctx.reply('Nothing is playing.');
  queue.connection.stop();
  return ctx.react('⏭️');
});

client.command('pause', 'Pause', (ctx) => { queues.get(ctx.serverId)?.connection.pause(); return ctx.react('⏸️'); });
client.command('resume', 'Resume', (ctx) => { queues.get(ctx.serverId)?.connection.resume(); return ctx.react('▶️'); });

client.commands.register({
  name: 'volume',
  description: 'Set the volume, 0 to 200%',
  options: [{ name: 'percent', type: 'integer', min: 0, max: 200, required: true }],
  run(ctx) {
    queues.get(ctx.serverId)?.connection.setVolume(ctx.values.percent / 100);
    return ctx.reply(`🔊 ${ctx.values.percent}%`);
  },
});

client.command('stop', 'Stop and leave', async (ctx) => {
  const queue = queues.get(ctx.serverId);
  if (queue) {
    queue.songs.length = 0;
    await queue.connection.leave();
  }
  return ctx.react('⏹️');
});

client.command('songs', 'List the songs', async (ctx) => {
  const list = await songs();
  return ctx.reply(list.length ? list.map((s) => `• ${s}`).join('\n').slice(0, 2000) : 'The music folder is empty.');
});

await client.login();
