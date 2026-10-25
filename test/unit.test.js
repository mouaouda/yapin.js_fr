import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  ActionRowBuilder,
  ButtonBuilder,
  Collection,
  ContainerBuilder,
  EmbedBuilder,
  LimitedCollection,
  MessageFlags,
  REST,
  SectionBuilder,
  compilePattern,
  disableValidators,
  enableValidators,
  formatDuration,
  parseDuration,
  resolveColor,
  resolvePayload,
  splitMessage,
  tokenize,
  verifyWebhookSignature,
  Permissions,
  OAuth2Client,
} from '../src/index.js';

test('Collection helpers', () => {
  const c = new Collection([['a', 1], ['b', 2], ['c', 3]]);
  assert.equal(c.first(), 1);
  assert.deepEqual(c.first(2), [1, 2]);
  assert.equal(c.last(), 3);
  assert.equal(c.find((v) => v > 1), 2);
  assert.ok(c.filter((v) => v > 1) instanceof Collection);
  assert.deepEqual([...c.filter((v) => v > 1).keys()], ['b', 'c']);
  assert.deepEqual(c.map((v) => v * 2), [2, 4, 6]);
  assert.equal(c.reduce((a, v) => a + v, 0), 6);
  const [even, odd] = c.partition((v) => v % 2 === 0);
  assert.deepEqual([...even.values()], [2]);
  assert.deepEqual([...odd.values()], [1, 3]);
  assert.deepEqual([...c.clone().sort((a, b) => b - a).values()], [3, 2, 1]);
  assert.equal(c.ensure('d', () => 4), 4);
  assert.equal(c.sweep((v) => v === 4), 1);
});

test('LimitedCollection evicts the oldest entries', () => {
  const c = new LimitedCollection(2);
  c.set('a', 1).set('b', 2).set('c', 3);
  assert.deepEqual([...c.keys()], ['b', 'c']);
});

test('EmbedBuilder builds and validates', () => {
  const embed = new EmbedBuilder()
    .setTitle('Score')
    .setColor('Blurple')
    .addFields({ name: 'Kills', value: '12', inline: true })
    .setFooter({ text: 'Season 2' })
    .setTimestamp(0);
  assert.deepEqual(embed.toJSON(), {
    title: 'Score',
    color: 0x5865f2,
    fields: [{ name: 'Kills', value: '12', inline: true }],
    footer: { text: 'Season 2', icon_url: undefined },
    timestamp: '1970-01-01T00:00:00.000Z',
  });
  assert.throws(() => new EmbedBuilder().setTitle('x'.repeat(257)), /limit is 256/);
  assert.throws(() => new EmbedBuilder().toJSON(), /needs something/);
  assert.throws(() => new EmbedBuilder().setImage('http://example.com/a.png'), /https/);
  assert.throws(() => new EmbedBuilder().addFields(...Array.from({ length: 11 }, (_, i) => ({ name: `${i}`, value: 'v' }))), /Too many embed fields/);
});

test('validators can be turned off', () => {
  disableValidators();
  try {
    assert.doesNotThrow(() => new EmbedBuilder().setTitle('x'.repeat(300)));
  } finally {
    enableValidators();
  }
});

test('resolveColor reads many forms', () => {
  assert.equal(resolveColor('#ff0000'), 0xff0000);
  assert.equal(resolveColor('00ff00'), 0x00ff00);
  assert.equal(resolveColor([0, 0, 255]), 0x0000ff);
  assert.equal(resolveColor('red'), 0xed4245);
  assert.throws(() => resolveColor('nope'), /isn't a color/);
});

test('ButtonBuilder rules', () => {
  assert.deepEqual(ButtonBuilder.success('Yes', 'vote:yes').setEmoji('🍕').toJSON(), {
    type: 'button', style: 'success', label: 'Yes', custom_id: 'vote:yes', emoji: '🍕',
  });
  assert.deepEqual(ButtonBuilder.link('Rules', 'https://example.com').toJSON(), {
    type: 'button', style: 'link', label: 'Rules', url: 'https://example.com',
  });
  assert.throws(() => new ButtonBuilder().setLabel('x').toJSON(), /custom_id/);
  assert.throws(() => new ButtonBuilder().setCustomId('a').toJSON(), /label or an emoji/);
  assert.throws(() => ButtonBuilder.link('x', 'http://insecure.example'), /https/);
  assert.throws(() => new ActionRowBuilder(...Array.from({ length: 6 }, (_, i) => ButtonBuilder.primary(`${i}`, `${i}`))), /Too many buttons/);
});

test('resolvePayload: strings, embeds, replies', () => {
  assert.deepEqual(resolvePayload('hi'), { content: 'hi' });
  assert.deepEqual(resolvePayload({ content: 'hi', replyTo: { id: 'm1' } }), { content: 'hi', reply_to: 'm1' });
  const body = resolvePayload(new EmbedBuilder().setTitle('t'));
  assert.equal(body.embeds[0].title, 't');
  assert.deepEqual(resolvePayload({ content: null, components: null }, { edit: true }), { content: null, components: null });
  assert.throws(() => resolvePayload({ content: 'x'.repeat(2001) }), /limit is 2000/);
});

test('resolvePayload detects Components V2 and moves content into a text display', () => {
  const container = new ContainerBuilder()
    .setAccentColor('Blue')
    .addTextDisplayComponents('## Game night')
    .addSectionComponents((s) => s.addTextDisplayComponents('**Minecraft**').setButtonAccessory(ButtonBuilder.primary('Vote', 'poll:mc')))
    .addSeparatorComponents()
    .addActionRowComponents(new ActionRowBuilder(ButtonBuilder.link('Rules', 'https://example.com')));
  const body = resolvePayload({ content: 'Hello', components: [container] });
  assert.equal(body.flags, MessageFlags.IsComponentsV2);
  assert.equal(body.content, undefined);
  assert.deepEqual(body.components[0], { type: 10, content: 'Hello' });
  assert.equal(body.components[1].type, 17);
  assert.equal(body.components[1].components[1].accessory.custom_id, 'poll:mc');
  assert.throws(() => resolvePayload({ embeds: [new EmbedBuilder().setTitle('x')], components: [container] }), /cannot have embeds/);
  assert.throws(() => new SectionBuilder().addTextDisplayComponents('a').toJSON(), /accessory/);
});

test('tokenize respects quotes and escapes', () => {
  assert.deepEqual(tokenize('ban "John Smith" being rude').map((t) => t.value), ['ban', 'John Smith', 'being', 'rude']);
  assert.deepEqual(tokenize('a\\ b c').map((t) => t.value), ['a b', 'c']);
  assert.deepEqual(tokenize('  ').map((t) => t.value), []);
});

test('compilePattern: exact, wildcard, params, RegExp', () => {
  assert.deepEqual(compilePattern('vote:yes')('vote:yes'), {});
  assert.equal(compilePattern('vote:yes')('vote:no'), null);
  assert.deepEqual(compilePattern('vote:*')('vote:anything'), {});
  assert.deepEqual(compilePattern('vote:{poll}:{choice}')('vote:42:yes'), { poll: '42', choice: 'yes' });
  assert.equal(compilePattern('vote:{choice}')('other:yes'), null);
  assert.equal(compilePattern(/^page:(?<n>\d+)$/g)('page:3').n, '3');
  assert.equal(compilePattern(/^page:(?<n>\d+)$/g)('page:3').n, '3');
});

test('parseDuration / formatDuration', () => {
  assert.equal(parseDuration('10m'), 600_000);
  assert.equal(parseDuration('1h30m'), 5_400_000);
  assert.equal(parseDuration('2 days'), 172_800_000);
  assert.equal(parseDuration('1h, 5m'), 3_900_000);
  assert.equal(parseDuration('500'), 500);
  assert.equal(parseDuration('soon'), null);
  assert.equal(parseDuration('5 fortnights'), null);
  assert.equal(formatDuration(5_400_000), '1h 30m');
  assert.equal(formatDuration(1500), '1s');
});

test('splitMessage breaks on newlines', () => {
  const parts = splitMessage(`${'a'.repeat(1500)}\n${'b'.repeat(1500)}`);
  assert.equal(parts.length, 2);
  assert.ok(parts.every((p) => p.length <= 2000));
});

test('Permissions match loosely; owners have everything', () => {
  const p = Permissions.fromRoles([{ manageMessages: true, perms: { kick_members: true, ban_members: false } }]);
  assert.ok(p.has('manage_messages'));
  assert.ok(p.has('KickMembers'));
  assert.ok(!p.has('ban_members'));
  assert.deepEqual(p.missing(['kick_members', 'ban_members']), ['ban_members']);
  assert.ok(Permissions.fromRoles([], { owner: true }).has('anything'));
});

test('verifyWebhookSignature', () => {
  const body = Buffer.from('{"id":1,"event":"test","data":{}}');
  const sig = `sha256=${createHmac('sha256', 's3cret').update(body).digest('hex')}`;
  assert.ok(verifyWebhookSignature(body, sig, 's3cret'));
  assert.ok(!verifyWebhookSignature(body, sig, 'wrong'));
  assert.ok(!verifyWebhookSignature(body, 'sha256=abc', 's3cret'));
  assert.ok(!verifyWebhookSignature(body, undefined, 's3cret'));
});

test('REST retries a 429 with Retry-After and then succeeds', async () => {
  let calls = 0;
  const rest = new REST({
    token: 'yb_x',
    baseURL: 'http://api.test',
    fetch: async () => {
      calls++;
      if (calls === 1) return new Response(JSON.stringify({ error: '30 messages a minute in this server' }), { status: 429, headers: { 'retry-after': '0.02' } });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    },
  });
  const limited = [];
  rest.on('rateLimited', (info) => limited.push(info));
  assert.deepEqual(await rest.post('/channels/abc/messages', { body: { content: 'hi' } }), { ok: true });
  assert.equal(calls, 2);
  assert.equal(limited.length, 1);
  assert.equal(limited[0].global, false);
});

test('REST throws YapinAPIError with status and message', async () => {
  const rest = new REST({
    token: 'yb_x',
    baseURL: 'http://api.test',
    fetch: async () => new Response(JSON.stringify({ error: 'Missing permission' }), { status: 403 }),
  });
  await assert.rejects(rest.get('/servers/1'), (e) => e.name === 'YapinAPIError' && e.status === 403 && e.message === 'Missing permission');
});

test('REST does not retry a 429 without Retry-After', async () => {
  let calls = 0;
  const rest = new REST({
    token: 'yb_x',
    baseURL: 'http://api.test',
    fetch: async () => {
      calls++;
      return new Response(JSON.stringify({ error: 'Too many answers' }), { status: 429 });
    },
  });
  await assert.rejects(rest.post('/interactions/1/t/callback', { body: {} }), (e) => e.name === 'RateLimitError');
  assert.equal(calls, 1);
});

test('REST sends raw bodies with their content type', async () => {
  let seen;
  const rest = new REST({
    token: 'yb_x',
    baseURL: 'http://api.test',
    fetch: async (url, init) => {
      seen = init;
      return new Response('{"path":"p","url":"u"}', { status: 200 });
    },
  });
  await rest.put('/me/avatar', { body: new Uint8Array([0x89, 0x50]), contentType: 'image/png' });
  assert.equal(seen.headers['content-type'], 'image/png');
  assert.ok(seen.body instanceof Uint8Array);
  assert.equal(seen.headers.authorization, 'Bot yb_x');
});

test('OAuth2Client builds an authorize URL with PKCE', () => {
  const oauth = new OAuth2Client({ clientId: 'abc', redirectURI: 'https://site.example/callback' });
  const { challenge, verifier } = OAuth2Client.generatePKCE();
  assert.ok(verifier.length >= 43);
  const url = new URL(oauth.generateAuthURL({ state: 'xyz', codeChallenge: challenge }));
  assert.equal(url.origin + url.pathname, 'https://www.yapin.gg/oauth/authorize');
  assert.equal(url.searchParams.get('scope'), 'identify');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('state'), 'xyz');
});
