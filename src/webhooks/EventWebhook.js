import { createHmac, timingSafeEqual } from 'node:crypto';
import { ErrorCodes, YapinError } from '../errors/index.js';

/**
 * Checks an event webhook's `X-Yapper-Signature` header ("sha256=<hex>"): an HMAC-SHA256 of the raw
 * body keyed with your webhook secret (Settings → Developer → your bot → Advanced).
 */
export function verifyWebhookSignature(rawBody, signature, secret) {
  if (!signature || !secret) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const given = String(signature).replace(/^sha256=/i, '').trim().toLowerCase();
  if (given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given, 'utf8'), Buffer.from(expected, 'utf8'));
}

async function readBody(req, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new YapinError(ErrorCodes.InvalidPayload, 'Webhook body too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/**
 * A Node `(req, res)` handler for event webhooks, usable with http.createServer, Express, Fastify's
 * raw mode and the like. Checks the signature, answers 200 at once (Yapin’ waits 3 seconds and
 * doesn't retry), and feeds the event into the client, which skips any it already got by polling.
 *
 *   http.createServer(client.webhookHandler({ secret: process.env.YAPIN_WEBHOOK_SECRET })).listen(3000);
 *
 * If you already parsed the body (Express json()), pass the raw body as `req.rawBody`.
 */
export function createWebhookHandler(client, { secret, path, maxBodySize = 1024 * 1024 } = {}) {
  if (!secret) throw new TypeError('createWebhookHandler needs your webhook secret');
  return async (req, res, next) => {
    if (path && req.url?.split('?')[0] !== path) {
      if (typeof next === 'function') return next();
      res.statusCode = 404;
      return res.end();
    }
    if (req.method !== 'POST') {
      res.statusCode = 405;
      return res.end();
    }
    let raw;
    try {
      raw = req.rawBody ?? (await readBody(req, maxBodySize));
    } catch {
      res.statusCode = 413;
      return res.end();
    }
    if (!verifyWebhookSignature(raw, req.headers['x-yapper-signature'], secret)) {
      client.emit('debug', '[webhook] rejected a request with a bad signature');
      res.statusCode = 401;
      return res.end();
    }
    let payload;
    try {
      payload = JSON.parse(raw.toString('utf8'));
    } catch {
      res.statusCode = 400;
      return res.end();
    }
    res.statusCode = 200;
    res.end();
    client._ingestWebhook({ id: payload.id, type: payload.event ?? payload.type, data: payload.data ?? {}, created_at: payload.created_at });
  };
}

/** Starts a small HTTP server for event webhooks. Resolves with the server once it listens. */
export async function startWebhookServer(client, { port = 3000, host, path = '/', secret } = {}) {
  const { createServer } = await import('node:http');
  const server = createServer(createWebhookHandler(client, { secret, path }));
  await new Promise((resolve) => server.listen(port, host, resolve));
  client.emit('debug', `[webhook] listening on ${host ?? '0.0.0.0'}:${port}${path}`);
  return server;
}
