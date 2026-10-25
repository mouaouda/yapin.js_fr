import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client, Events } from '../src/index.js';
import { startMockYapin, until } from './helpers/mockYapin.js';

/** A scriptable stand-in for the gateway socket. */
function fakeGateway({ closeWith = null, ack = true } = {}) {
  return class FakeWebSocket {
    static sockets = [];

    constructor(url) {
      this.url = url;
      this.sent = [];
      this.closed = null;
      FakeWebSocket.sockets.push(this);
      setTimeout(() => {
        if (closeWith) return this.onclose?.({ code: closeWith });
        this.#receive({ op: 'hello', heartbeat_interval: 40 });
      }, 5);
    }

    #receive(packet) {
      this.onmessage?.({ data: JSON.stringify(packet) });
    }

    send(text) {
      const packet = JSON.parse(text);
      this.sent.push(packet);
      if (packet.op === 'identify' || packet.op === 'resume') setTimeout(() => this.#receive({ op: 'ready', bot: { id: 'b' }, seq: packet.seq ?? 0 }), 5);
      if (packet.op === 'heartbeat' && (typeof ack === 'function' ? ack(this) : ack)) setTimeout(() => this.#receive({ op: 'heartbeat_ack' }), 2);
    }

    /** Pushes an event like the gateway would. */
    dispatch(event) {
      this.#receive({ op: 'event', s: event.id, t: event.type, d: event });
    }

    close(code) {
      this.closed = code;
      setTimeout(() => this.onclose?.({ code }), 1);
    }
  };
}

let cleanup = [];
afterEach(async () => {
  for (const fn of cleanup.reverse()) await fn();
  cleanup = [];
});

async function setup(WebSocket, options = {}) {
  const mock = await startMockYapin();
  const client = new Client({ baseURL: mock.baseURL, WebSocket, logger: false, ...options });
  cleanup.push(() => mock.close(), () => client.destroy());
  return { mock, client };
}

const message = (content) => ({
  id: randomUUID(),
  channel_id: randomUUID(),
  server_id: randomUUID(),
  author_id: randomUUID(),
  author: { username: 'alice' },
  content,
  created_at: new Date().toISOString(),
});

test('connects over the gateway, resumes from the cursor, and handles pushed events', async () => {
  const WS = fakeGateway();
  const { mock, client } = await setup(WS);
  const connected = new Promise((resolve) => client.on(Events.Connected, (info) => info.transport === 'gateway' && resolve(info)));
  client.command('ping', (ctx) => ctx.reply('pong'));
  await client.login('yb_test');
  await connected;
  const socket = WS.sockets[0];
  assert.equal(socket.sent[0].op, 'resume');
  assert.equal(socket.sent[0].token, 'yb_test');
  assert.equal(socket.sent[0].seq, mock.state.nextId - 1);
  assert.equal(client.transport, 'gateway');

  const data = message('/ping');
  socket.dispatch({ id: mock.state.nextId + 5, type: 'message', data: { ...data, command: 'ping', args: '' } });
  socket.dispatch({ id: mock.state.nextId + 5, type: 'message', data: { ...data, command: 'ping', args: '' } });
  await until(() => mock.state.sent.find((s) => s.body.reply_to === data.id));
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(mock.state.sent.filter((s) => s.body.reply_to === data.id).length, 1, 'duplicate ids are skipped');
  assert.equal(client.stream.seq, mock.state.nextId + 5);
  await until(() => socket.sent.some((p) => p.op === 'heartbeat'));
  await until(() => client.ping !== null);
});

test('passes intents to the gateway as an event filter', async () => {
  const WS = fakeGateway();
  const { client } = await setup(WS, { intents: [['message'], 'interaction'] });
  await client.login('yb_test');
  await until(() => WS.sockets[0]?.sent.length);
  assert.deepEqual(WS.sockets[0].sent[0].events, ['message', 'interaction']);
});

test('falls back to polling when the gateway is off for the bot (4003)', async () => {
  const WS = fakeGateway({ closeWith: 4003 });
  const { mock, client } = await setup(WS);
  const polling = new Promise((resolve) => client.on(Events.Connected, (info) => info.transport === 'polling' && resolve()));
  const seen = new Promise((resolve) => client.on(Events.MessageCreate, resolve));
  await client.login('yb_test');
  await polling;
  mock.push('message', message('via polling'));
  assert.equal((await seen).content, 'via polling');
  assert.equal(WS.sockets.length, 1, 'does not hammer a disabled gateway');
});

test('a rejected token (4004) stops the bot with an error', async () => {
  const WS = fakeGateway({ closeWith: 4004 });
  const { client } = await setup(WS);
  const error = new Promise((resolve) => client.on(Events.Error, resolve));
  await client.login('yb_test');
  const err = await error;
  assert.equal(err.code, 'TokenInvalid');
  await until(() => !client.stream.running);
});

test('a zombie connection (no heartbeat ack) reconnects and resumes', async () => {
  const WS = fakeGateway({ ack: (socket) => socket !== WS.sockets[0] });
  const { mock, client } = await setup(WS);
  await client.login('yb_test');
  await until(() => WS.sockets.length >= 2, 5000);
  assert.equal(WS.sockets[0].closed, 4000);
  await until(() => WS.sockets[1].sent.some((p) => p.op === 'resume'));
  assert.equal(WS.sockets[1].sent[0].seq, mock.state.nextId - 1);
});
