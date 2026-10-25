// Join to create: joining "Join to create" makes you your own voice room, deleted once it's empty.
// The bot needs Manage channels and Move Members.
import { Client, Events, Intents } from 'yapin.js';

const client = new Client({ intents: [Intents.Voice] });
const made = new Set();

client.on(Events.VoiceJoin, async (state) => {
  const channel = await client.channels.fetch(state.channelId).catch(() => null);
  if (channel?.name !== 'Join to create') return;
  const user = await client.users.fetch(state.userId);
  const room = await state.server.channels.create(`${user.displayName}'s room`, { type: 'voice', category: channel.categoryId });
  made.add(room.id);
  await state.server.voice.move(state.userId, room);
});

client.on(Events.VoiceLeave, async (state) => {
  if (!made.has(state.channelId)) return;
  const channels = await state.server.voice.fetch();
  if (channels.get(state.channelId)?.length) return;
  made.delete(state.channelId);
  await client.channels.cache.get(state.channelId)?.delete();
});

await client.login();
