import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Client, Events, UserError } from '../src/index.js';
import { startMockYapin, until } from './helpers/mockYapin.js';

const SERVER = randomUUID();
const CHANNEL = randomUUID();
const ALICE = randomUUID();

let mock;
let client;
const errors = [];

const messageEvent = (content, extra = {}) => ({
  id: randomUUID(),
  channel_id: CHANNEL,
  channel_name: 'general',
  server_id: SERVER,
  author_id: ALICE,
  author: { id: ALICE, username: 'alice', display_name: 'Alice' },
  content,
  created_at: new Date().toISOString(),
  mentioned: false,
  author_bot: false,
  ...extra,
});

const lastSent = () => mock.state.sent.at(-1);

before(async () => {
  mock = await startMockYapin();
  mock.state.members.set(ALICE, { id: ALICE, username: 'alice', display_name: 'Alice', nickname: null, joined_at: new Date().toISOString(), roles: ['r-mod'] });
  mock.state.roles = [{ id: 'r-mod', name: 'Mods', color: null, position: 2, manage_server: false, manage_messages: true, perms: { kick_members: true } }];

  client = new Client({
    baseURL: mock.baseURL,
    transport: 'polling',
    logger: false,
    commands: { help: true },
    components: { autoAckAfter: 150 },
  });
  client.on(Events.Error, (e) => errors.push(e));

  client.command('ping', 'Pong!', (ctx) => ctx.reply('pong'));
  client.commands.register({
    name: 'echo',
    description: 'Say it back',
    aliases: ['say'],
    options: [{ name: 'text', required: true, rest: true }],
    run: (ctx) => ctx.reply(ctx.values.text),
  });
  client.commands.register({
    name: 'roll',
    description: 'Roll a die',
    options: [{ name: 'sides', type: 'integer', min: 2, max: 100, default: 6 }],
    cooldown: { seconds: 60, uses: 1 },
    run: (ctx) => ctx.reply(`rolled d${ctx.values.sides}`),
  });
  client.commands.register({
    name: 'mod',
    description: 'Mods only',
    serverOnly: true,
    permissions: ['manage_messages', 'kick_members'],
    run: (ctx) => ctx.reply(`hi mod ${ctx.member.displayName}`),
  });
  client.commands.register({
    name: 'admin',
    description: 'Needs ban',
    permissions: ['ban_members'],
    run: (ctx) => ctx.reply('should not run'),
  });
  client.commands.register({
    name: 'config',
    description: 'Settings',
    subcommands: [
      { name: 'set', options: [{ name: 'key', required: true }, { name: 'value', required: true }], run: (ctx) => ctx.reply(`set ${ctx.values.key}=${ctx.values.value}`) },
      { name: 'get', options: [{ name: 'key', required: true }], run: (ctx) => ctx.reply(`get ${ctx.values.key}`) },
    ],
  });
  client.commands.register({ name: 'oops', run: () => { throw new Error('boom'); } });
  client.commands.register({ name: 'nope', run: (ctx) => ctx.error('Not today') });
  client.button('vote:{choice}', (i) => i.ephemeral(`You picked ${i.params.choice}`));

  await client.login('yb_test');
});

after(async () => {
  await client.destroy();
  await mock.close();
});

test('login registers commands and is ready', () => {
  assert.ok(client.isReady());
  assert.equal(client.user.displayName, 'Test Bot');
  assert.equal(client.application.ownerId, mock.state.ownerId);
  const names = mock.state.commands.map((c) => c.name);
  for (const name of ['help', 'ping', 'echo', 'roll', 'mod', 'config']) assert.ok(names.includes(name), name);
  assert.ok(!names.includes('say'), 'aliases are not registered by default');
});

test('a command Yapin’ recognised replies quoting the message', async () => {
  const data = messageEvent('/ping', { command: 'ping', args: '' });
  mock.push('message', data);
  await until(() => mock.state.sent.find((s) => s.body.reply_to === data.id));
  assert.equal(lastSent().body.content, 'pong');
  assert.equal(lastSent().channelId, CHANNEL);
});

test('prefix commands, aliases and rest options', async () => {
  const data = messageEvent('!say hello   there "world"');
  mock.push('message', data);
  await until(() => mock.state.sent.find((s) => s.body.reply_to === data.id));
  assert.equal(lastSent().body.content, 'hello   there "world"');
});

test('messageCreate gives a Message with author, channel and server', async () => {
  const seen = new Promise((resolve) => client.once(Events.MessageCreate, resolve));
  mock.push('message', messageEvent('just chatting'));
  const message = await seen;
  assert.equal(message.content, 'just chatting');
  assert.equal(message.author.username, 'alice');
  assert.equal(message.author.displayName, 'Alice');
  assert.equal(message.channel.name, 'general');
  assert.equal(message.server.id, SERVER);
  assert.ok(client.channels.cache.has(CHANNEL));
  assert.ok(client.servers.cache.get(SERVER).channels.cache.has(CHANNEL));
});

test('argument errors are explained to the person', async () => {
  const data = messageEvent('/roll 1');
  mock.push('message', data);
  const reply = await until(() => mock.state.sent.find((s) => s.body.reply_to === data.id));
  assert.match(reply.body.content, /at least 2/);
  const missing = messageEvent('/echo');
  mock.push('message', missing);
  const reply2 = await until(() => mock.state.sent.find((s) => s.body.reply_to === missing.id));
  assert.match(reply2.body.content, /Missing `text`/);
});

test('defaults and cooldowns', async () => {
  const first = messageEvent('/roll');
  mock.push('message', first);
  const r1 = await until(() => mock.state.sent.find((s) => s.body.reply_to === first.id));
  assert.equal(r1.body.content, 'rolled d6');
  const second = messageEvent('/roll 20');
  mock.push('message', second);
  const r2 = await until(() => mock.state.sent.find((s) => s.body.reply_to === second.id));
  assert.match(r2.body.content, /Slow down/);
});

test('permission preconditions fetch the member and roles', async () => {
  const ok = messageEvent('/mod');
  mock.push('message', ok);
  const r1 = await until(() => mock.state.sent.find((s) => s.body.reply_to === ok.id));
  assert.equal(r1.body.content, 'hi mod Alice');
  const denied = new Promise((resolve) => client.once(Events.CommandDenied, (error) => resolve(error)));
  const no = messageEvent('/admin');
  mock.push('message', no);
  const r2 = await until(() => mock.state.sent.find((s) => s.body.reply_to === no.id));
  assert.match(r2.body.content, /ban_members/);
  assert.equal((await denied).precondition, 'permissions');
});

test('subcommands', async () => {
  const data = messageEvent('/config set color blue');
  mock.push('message', data);
  const reply = await until(() => mock.state.sent.find((s) => s.body.reply_to === data.id));
  assert.equal(reply.body.content, 'set color=blue');
  const bare = messageEvent('/config');
  mock.push('message', bare);
  const reply2 = await until(() => mock.state.sent.find((s) => s.body.reply_to === bare.id));
  assert.match(reply2.body.content, /Pick a subcommand/);
});

test('errors: unexpected ones are reported, UserErrors are just replied', async () => {
  const before = errors.length;
  const boom = messageEvent('/oops');
  mock.push('message', boom);
  const reply = await until(() => mock.state.sent.find((s) => s.body.reply_to === boom.id));
  assert.match(reply.body.content, /Something went wrong/);
  await until(() => errors.length > before);
  assert.equal(errors.at(-1).message, 'boom');
  assert.equal(errors.at(-1).command, 'oops');

  const nope = messageEvent('/nope');
  const denied = new Promise((resolve) => client.once(Events.CommandDenied, resolve));
  mock.push('message', nope);
  const reply2 = await until(() => mock.state.sent.find((s) => s.body.reply_to === nope.id));
  assert.equal(reply2.body.content, 'Not today');
  assert.ok((await denied) instanceof UserError);
});

test('commands for another bot are ignored', async () => {
  const count = mock.state.sent.length;
  mock.push('message', messageEvent('/ping @Other', { command: 'ping', args: '', command_for: [randomUUID()] }));
  const marker = messageEvent('/ping', { command: 'ping', args: '' });
  mock.push('message', marker);
  await until(() => mock.state.sent.find((s) => s.body.reply_to === marker.id));
  assert.equal(mock.state.sent.length, count + 1);
});

test('the built-in help command', async () => {
  const data = messageEvent('/help echo');
  mock.push('message', data);
  const reply = await until(() => mock.state.sent.find((s) => s.body.reply_to === data.id));
  assert.equal(reply.body.embeds[0].title, '/echo');
  assert.match(JSON.stringify(reply.body.embeds[0].fields), /say/);
});

test('button clicks route by pattern and answer the callback', async () => {
  const id = randomUUID();
  mock.push('interaction', { id, token: 'tok', type: 'button', custom_id: 'vote:yes', message_id: randomUUID(), channel_id: CHANNEL, server_id: SERVER, user_id: ALICE, username: 'alice', expires_at: new Date(Date.now() + 900_000).toISOString() });
  const cb = await until(() => mock.state.callbacks.find((c) => c.id === id));
  assert.deepEqual(cb.body, { type: 'ephemeral', content: 'You picked yes' });
});

test('unanswered clicks are acknowledged automatically', async () => {
  const id = randomUUID();
  mock.push('interaction', { id, token: 'tok', type: 'button', custom_id: 'nobody:handles', message_id: randomUUID(), channel_id: CHANNEL, server_id: SERVER, user_id: ALICE });
  const cb = await until(() => mock.state.callbacks.find((c) => c.id === id));
  assert.deepEqual(cb.body, { type: 'ack' });
});

test('member joins become ServerMembers', async () => {
  const BOB = randomUUID();
  const joined = new Promise((resolve) => client.once(Events.ServerMemberAdd, resolve));
  mock.push('member_join', { server_id: SERVER, channel_id: null, user_id: BOB, username: 'bob', joined_at: new Date().toISOString(), member_count: 42 });
  const member = await joined;
  assert.equal(member.user.username, 'bob');
  assert.equal(member.server.memberCount, 42);
  const left = new Promise((resolve) => client.once(Events.ServerMemberRemove, resolve));
  mock.push('member_leave', { server_id: SERVER, channel_id: null, user_id: BOB, username: 'bob', joined_at: null, member_count: 41 });
  assert.equal((await left).id, BOB);
  assert.ok(!member.server.members.cache.has(BOB));
});

test('reactions and voice events', async () => {
  const MSG = randomUUID();
  const reacted = new Promise((resolve) => client.once(Events.MessageReactionAdd, (r, u) => resolve([r, u])));
  mock.push('reaction_add', { message_id: MSG, channel_id: CHANNEL, server_id: SERVER, user_id: ALICE, username: 'alice', emoji: '👍', message_author_id: mock.state.botId });
  const [reaction, user] = await reacted;
  assert.equal(reaction.emoji, '👍');
  assert.ok(reaction.onOwnMessage);
  assert.equal(user.username, 'alice');

  const VC = randomUUID();
  const joined = new Promise((resolve) => client.once(Events.VoiceJoin, resolve));
  mock.push('voice_join', { user_id: ALICE, channel_id: VC, server_id: SERVER });
  const state = await joined;
  assert.equal(state.channelId, VC);
  assert.equal(client.servers.cache.get(SERVER).voice.states.get(ALICE).channelId, VC);
  assert.equal(client.servers.cache.get(SERVER).members.cache.get(ALICE).voice.channelId, VC);
});

test('rate limited sends are waited out and retried', async () => {
  mock.state.rateLimitNext = 1;
  const message = await client.send(CHANNEL, 'after a 429');
  assert.equal(message.content, 'after a 429');
  assert.equal(message.author.id, client.user.id);
});

test('events delivered by webhook and by polling are handled once', async () => {
  let count = 0;
  const listener = (m) => { if (m.content === 'dedupe me') count++; };
  client.on(Events.MessageCreate, listener);
  const data = messageEvent('dedupe me');
  const id = mock.state.nextId;
  client._ingestWebhook({ id, type: 'message', data });
  mock.push('message', data);
  const marker = messageEvent('/ping', { command: 'ping', args: '' });
  mock.push('message', marker);
  await until(() => mock.state.sent.find((s) => s.body.reply_to === marker.id));
  client.off(Events.MessageCreate, listener);
  assert.equal(count, 1);
});

test('modules load, register, unload and reload from files', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yapin-mod-'));
  const index = pathToFileURL(join(process.cwd(), 'src', 'index.js')).href;
  const file = join(dir, 'fun.js');
  const write = (reply) => writeFile(file, `
    import { Module } from ${JSON.stringify(index)};
    export default class Fun extends Module {
      commands = [{ name: 'joke', description: 'A joke', run: (ctx) => ctx.reply(${JSON.stringify(reply)}) }];
      events = { test: () => { this.client.__testHit = (this.client.__testHit ?? 0) + 1; } };
      buttons = { 'fun:*': (i) => i.ack() };
    }
  `);
  await write('first');
  const name = await client.modules.load(file);
  assert.equal(name, 'fun');
  assert.ok(client.commands.has('joke'));
  assert.equal(client.commands.get('joke').category, 'fun');

  const data = messageEvent('/joke');
  mock.push('message', data);
  assert.equal((await until(() => mock.state.sent.find((s) => s.body.reply_to === data.id))).body.content, 'first');

  await write('second');
  await client.modules.reload('fun');
  const again = messageEvent('/joke');
  mock.push('message', again);
  assert.equal((await until(() => mock.state.sent.find((s) => s.body.reply_to === again.id))).body.content, 'second');
  assert.equal(client.components.routes.filter((r) => r.owner?.name === 'fun').length, 1);

  await client.modules.unload('fun');
  assert.ok(!client.commands.has('joke'));
  assert.equal(client.components.routes.filter((r) => r.owner?.name === 'fun').length, 0);
  client.__testHit = 0;
  mock.push('test', { hello: true });
  const marker = messageEvent('/ping', { command: 'ping', args: '' });
  mock.push('message', marker);
  await until(() => mock.state.sent.find((s) => s.body.reply_to === marker.id));
  assert.equal(client.__testHit, 0, 'listeners are removed on unload');
  await until(() => mock.state.commands && !mock.state.commands.some((c) => c.name === 'joke'), 3000);
});

test('command files load from a folder', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yapin-cmd-'));
  await writeFile(join(dir, 'hello.js'), `export default { name: 'hello', description: 'Hi', run: (ctx) => ctx.reply('hello ' + ctx.author.username) };`);
  await writeFile(join(dir, '_helper.js'), `throw new Error('helpers are skipped');`);
  await writeFile(join(dir, 'djs.js'), `export const data = { name: 'djs', description: 'discord.js style' }; export async function execute(ctx) { await ctx.reply('djs ok'); }`);
  const names = await client.commands.load(dir);
  assert.deepEqual(names.sort(), ['djs', 'hello']);
  const data = messageEvent('!hello');
  mock.push('message', data);
  assert.equal((await until(() => mock.state.sent.find((s) => s.body.reply_to === data.id))).body.content, 'hello alice');
  const djs = messageEvent('/djs');
  mock.push('message', djs);
  assert.equal((await until(() => mock.state.sent.find((s) => s.body.reply_to === djs.id))).body.content, 'djs ok');
});

test('collectors gather messages and clicks', async () => {
  const channel = client.channels.cache.get(CHANNEL);
  const collected = channel.awaitMessages({ filter: (m) => m.content.startsWith('answer'), max: 2, time: 3000 });
  mock.push('message', messageEvent('noise'));
  mock.push('message', messageEvent('answer 1'));
  mock.push('message', messageEvent('answer 2'));
  const result = await collected;
  assert.deepEqual(result.map((m) => m.content), ['answer 1', 'answer 2']);

  const MSG = randomUUID();
  const message = channel.messages._add({ id: MSG, channel_id: CHANNEL, author_id: client.user.id, content: 'pick' });
  const click = message.awaitMessageComponent({ time: 3000 });
  mock.push('interaction', { id: randomUUID(), token: 't', type: 'button', custom_id: 'pick:a', message_id: MSG, channel_id: CHANNEL, server_id: SERVER, user_id: ALICE });
  assert.equal((await click).customId, 'pick:a');
});

test('no unexpected errors were reported', () => {
  const unexpected = errors.filter((e) => e.message !== 'boom');
  assert.deepEqual(unexpected.map((e) => e.message), []);
});
