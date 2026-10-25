import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import http from 'node:http';
import { ActionRowBuilder, ButtonBuilder, Client, ContainerBuilder, Events, MessageFlags } from '../src/index.js';
import { startMockYapin, until } from './helpers/mockYapin.js';

let mock;
const clients = [];

before(async () => {
  mock = await startMockYapin();
});

after(async () => {
  for (const c of clients) await c.destroy();
  await mock.close();
});

function makeClient(options = {}) {
  const client = new Client({ baseURL: mock.baseURL, transport: 'polling', logger: false, ...options });
  clients.push(client);
  return client;
}

const interaction = (customId) => ({
  id: randomUUID(),
  token: 'tok',
  type: 'button',
  custom_id: customId,
  message_id: randomUUID(),
  channel_id: randomUUID(),
  server_id: randomUUID(),
  user_id: randomUUID(),
});

test('a stored cursor catches up on missed events, and destroy() saves it', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yapin-seq-'));
  const file = join(dir, 'seq');
  const missedId = mock.push('test', { hello: 'missed while offline' });
  await writeFile(file, String(missedId - 1));
  const client = makeClient({ sequenceStore: file });
  const seen = new Promise((resolve) => client.on(Events.Test, resolve));
  await client.login('yb_test');
  assert.equal((await seen).hello, 'missed while offline');
  const next = mock.push('test', { hello: 'live' });
  await until(() => client.stream.seq >= next);
  await client.destroy();
  assert.equal(Number(await readFile(file, 'utf8')), next);
});

test('event webhooks: signed requests are dispatched, bad ones rejected, duplicates skipped', async () => {
  const client = makeClient();
  await client.login('yb_test');
  const secret = 'whsec';
  const server = http.createServer(client.webhookHandler({ secret, path: '/hook' }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/hook`;
  const post = (body, signature) => fetch(url, { method: 'POST', body, headers: { 'x-yapper-signature': signature, 'content-type': 'application/json' } });
  const sign = (body) => `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;

  let count = 0;
  client.on(Events.Test, (data) => { if (data.via === 'webhook') count++; });
  const body = JSON.stringify({ id: mock.state.nextId + 1000, event: 'test', data: { via: 'webhook' } });
  assert.equal((await post(body, 'sha256=bad')).status, 401);
  assert.equal((await post(body, sign(body))).status, 200);
  assert.equal((await post(body, sign(body))).status, 200);
  await until(() => count === 1);
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(count, 1);
  server.close();
});

test('interaction updates with a V2 layout set the flag; ephemeral buttons are refused', async () => {
  const client = makeClient();
  const errors = [];
  client.on(Events.Error, (e) => errors.push(e));
  client.button('v2:go', (i) => i.update({ components: [new ContainerBuilder().addTextDisplayComponents('updated')] }));
  client.button('v2:bad', async (i) => {
    await assert.rejects(i.ephemeral({ content: 'x', components: [ButtonBuilder.primary('a', 'b')] }), /not buttons/);
    await i.ack();
  });
  await client.login('yb_test');

  const go = interaction('v2:go');
  mock.push('interaction', go);
  const cb = await until(() => mock.state.callbacks.find((c) => c.id === go.id));
  assert.equal(cb.body.type, 'update');
  assert.equal(cb.body.flags, MessageFlags.IsComponentsV2);
  assert.equal(cb.body.components[0].type, 17);

  const bad = interaction('v2:bad');
  mock.push('interaction', bad);
  const ack = await until(() => mock.state.callbacks.find((c) => c.id === bad.id));
  assert.deepEqual(ack.body, { type: 'ack' });
  assert.deepEqual(errors, []);
});

test('a command file can replace the built-in /help', async () => {
  const client = makeClient({ commands: { help: true } });
  const dir = await mkdtemp(join(tmpdir(), 'yapin-help-'));
  await writeFile(join(dir, 'package.json'), '{"type":"module"}');
  await writeFile(join(dir, 'help.js'), `export default { name: 'help', description: 'Custom', run: (ctx) => ctx.reply('my help') };`);
  await client.commands.load(dir);
  assert.equal(client.commands.get('help').description, 'Custom');
});

test('message edits can remove parts with null, and sends without await report failures', async () => {
  const client = makeClient();
  const errors = [];
  client.on(Events.Error, (e) => errors.push(e));
  await client.login('yb_test');
  const channelId = randomUUID();
  const message = await client.send(channelId, { content: 'hi', components: [new ActionRowBuilder(ButtonBuilder.primary('a', 'b'))] });
  await message.edit({ content: 'bye', components: null });
  const edit = mock.state.edits.at(-1);
  assert.deepEqual(edit.body, { content: 'bye', components: null });

  client.rest.setToken('yb_wrong');
  client.send(channelId, 'this will 401');
  await until(() => errors.length === 1);
  assert.equal(errors[0].status, 401);
  client.rest.setToken('yb_test');
});
