import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { request } from 'node:http';
import { connect } from 'node:net';
import { authorize } from '../desktop/auth.js';

const config = { provider: 'google', clientId: '123-public.apps.googleusercontent.com' };
const token = { access_token: 'memory-only-token', token_type: 'Bearer', expires_in: 3600, scope: 'https://www.googleapis.com/auth/drive.file openid https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email' };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });

function callback(redirect, { path, method = 'GET', host = redirect.host, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port: redirect.port, path: path || `${redirect.pathname}${redirect.search}`, method, headers: { Host: host, ...headers }, agent: false }, res => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { text += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text }));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.end();
  });
}

function callbackUrl(auth, fields = { code: 'one-use-code' }) {
  const redirect = new URL(auth.searchParams.get('redirect_uri'));
  redirect.searchParams.set('state', auth.searchParams.get('state'));
  for (const [key, value] of Object.entries(fields)) redirect.searchParams.set(key, value);
  return redirect;
}

function begin(t, options = {}, settings = config) {
  const controller = new AbortController();
  let opened;
  const browser = new Promise(resolve => { opened = resolve; });
  const result = authorize(settings, {
    signal: controller.signal,
    openExternal: url => { opened(new URL(url)); },
    ...options,
  });
  result.catch(() => {});
  t.after(() => controller.abort());
  return { controller, browser, result };
}

async function closed(redirect) {
  await assert.rejects(callback(redirect), error => error.code === 'ECONNREFUSED' || error.code === 'ECONNRESET');
}

test('native Google uses real loopback, one-use S256 PKCE, fixed endpoints and token-only output', async t => {
  let submitted;
  let endpoint;
  t.mock.method(globalThis, 'fetch', async (input, options) => {
    endpoint = String(input);
    submitted = options;
    return json({ ...token, refresh_token: 'do-not-return-refresh', id_token: 'do-not-return-id', extra: 'discard' });
  });
  const flow = begin(t);
  const auth = await flow.browser;
  assert.equal(auth.origin, 'https://accounts.google.com');
  assert.equal(auth.pathname, '/o/oauth2/v2/auth');
  assert.equal(auth.searchParams.get('response_type'), 'code');
  assert.equal(auth.searchParams.get('code_challenge_method'), 'S256');
  assert.match(auth.searchParams.get('state'), /^[A-Za-z0-9_-]{43,128}$/);
  assert.equal(auth.searchParams.has('offline_access'), false);
  const redirect = callbackUrl(auth);
  assert.equal(redirect.hostname, '127.0.0.1');
  assert.equal(redirect.pathname, '/');
  assert.ok(Number(redirect.port) > 0);
  const response = await callback(redirect);
  assert.equal(response.status, 200);
  assert.match(response.headers['cache-control'], /no-store/);
  assert.match(response.headers['content-security-policy'], /default-src 'none'/);
  assert.equal(response.headers['referrer-policy'], 'no-referrer');
  assert.doesNotMatch(response.text, /one-use-code|memory-only-token|https?:|<script|<img/i);
  assert.deepEqual(await flow.result, token);
  assert.equal(endpoint, 'https://oauth2.googleapis.com/token');
  assert.equal(submitted.method, 'POST');
  assert.equal(submitted.redirect, 'error');
  assert.equal(submitted.credentials, 'omit');
  const body = new URLSearchParams(submitted.body);
  assert.equal(body.get('grant_type'), 'authorization_code');
  assert.equal(body.get('client_id'), config.clientId);
  assert.equal(body.get('code'), 'one-use-code');
  assert.equal(body.get('redirect_uri'), auth.searchParams.get('redirect_uri'));
  assert.equal(body.has('client_secret'), false);
  assert.equal(body.has('refresh_token'), false);
  assert.match(body.get('code_verifier'), /^[A-Za-z0-9_-]{43,128}$/);
  assert.equal(createHash('sha256').update(body.get('code_verifier')).digest('base64url'), auth.searchParams.get('code_challenge'));
  await closed(redirect);
});

test('native OneDrive uses localhost and the same public Entra registration with only appfolder scope', async t => {
  let endpoint;
  let body;
  t.mock.method(globalThis, 'fetch', async (input, options) => {
    endpoint = String(input);
    body = new URLSearchParams(options.body);
    return json({ ...token, scope: 'Files.ReadWrite.AppFolder' });
  });
  const flow = begin(t, {}, { provider: 'onedrive', clientId: 'public-client', tenant: 'consumers' });
  const auth = await flow.browser;
  assert.equal(auth.origin, 'https://login.microsoftonline.com');
  assert.equal(auth.pathname, '/consumers/oauth2/v2.0/authorize');
  assert.equal(auth.searchParams.get('response_mode'), 'query');
  const redirect = callbackUrl(auth);
  assert.equal(redirect.hostname, 'localhost');
  assert.equal(redirect.pathname, '/');
  assert.equal((await callback(redirect)).status, 200);
  assert.equal((await flow.result).scope, 'Files.ReadWrite.AppFolder');
  assert.equal(endpoint, 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token');
  assert.equal(body.has('client_secret'), false);
  await closed(redirect);
});

test('separate attempts generate fresh state and PKCE even when cancelled', async t => {
  const first = begin(t);
  const firstAuth = await first.browser;
  first.controller.abort();
  await assert.rejects(first.result, /cancel/i);
  const second = begin(t);
  const secondAuth = await second.browser;
  assert.notEqual(secondAuth.searchParams.get('state'), firstAuth.searchParams.get('state'));
  assert.notEqual(secondAuth.searchParams.get('code_challenge'), firstAuth.searchParams.get('code_challenge'));
  second.controller.abort();
  await assert.rejects(second.result, /cancel/i);
  await closed(callbackUrl(firstAuth));
  await closed(callbackUrl(secondAuth));
});

test('invalid provider, public registration metadata and endpoint options cannot start a listener or browser', async () => {
  const invalid = [
    null, {}, { ...config, provider: 'dropbox' }, { ...config, clientId: '' },
    { ...config, provider: { toString: null, valueOf: null } },
    { ...config, clientId: 'x'.repeat(257) }, { ...config, clientId: 'id\nsecret' },
    { ...config, clientId: 'https://attacker.example/' },
    { ...config, tenant: '../attacker' }, { ...config, tenant: 'foo?bar=baz' },
    { ...config, tenant: 'https://attacker.example' }, { ...config, tenant: '-bad.example' },
    { ...config, tokenEndpoint: 'https://attacker.example/token' }, { ...config, clientSecret: 'never-accepted' },
    { ...config, purpose: 'drive' }, { ...config, purpose: undefined },
  ];
  for (const settings of invalid) {
    await assert.rejects(authorize(settings, { openExternal: () => assert.fail('Invalid configuration opened a browser') }), error => error.code === 'CLOUD_AUTH' && error.message.length < 300);
  }
});

test('an already-aborted request never opens the browser or echoes the cancellation reason', async () => {
  const controller = new AbortController();
  controller.abort(new Error('secret-user-data'));
  await assert.rejects(authorize(config, { signal: controller.signal, openExternal: () => assert.fail('Cancelled authorization opened browser') }), error => /cancel/i.test(error.message) && !error.message.includes('secret-user-data'));
});

for (const [name, change] of [
  ['wrong state', redirect => { redirect.searchParams.set('state', 'wrong'); return {}; }],
  ['missing state', redirect => { redirect.searchParams.delete('state'); return {}; }],
  ['duplicate state', redirect => { redirect.searchParams.append('state', redirect.searchParams.get('state')); return {}; }],
  ['duplicate code', redirect => { redirect.searchParams.append('code', 'second-code'); return {}; }],
  ['duplicate unrelated query field', redirect => { redirect.searchParams.append('scope', 'a'); redirect.searchParams.append('scope', 'b'); return {}; }],
  ['non-ASCII state with matching character length', redirect => { redirect.searchParams.set('state', 'é'.repeat(43)); return {}; }],
  ['missing code', redirect => { redirect.searchParams.delete('code'); return {}; }],
  ['empty code', redirect => { redirect.searchParams.set('code', ''); return {}; }],
  ['ambiguous code and error', redirect => { redirect.searchParams.set('error', 'access_denied'); return {}; }],
  ['wrong path', () => ({ path: '/oauth-callback.html?state=anything&code=secret' })],
  ['normalized path alias', redirect => ({ path: `/a/../?${redirect.searchParams}` })],
  ['absolute request target', redirect => ({ path: redirect.href })],
  ['POST method', () => ({ method: 'POST' })],
  ['untrusted Host', () => ({ host: 'attacker.example' })],
  ['request body', () => ({ headers: { 'Content-Length': '1' } })],
]) {
  test(`invalid native callback rejects ${name} without exchanging codes and closes listener`, async t => {
    t.mock.method(globalThis, 'fetch', () => assert.fail('Invalid callback reached token endpoint'));
    const flow = begin(t);
    const redirect = callbackUrl(await flow.browser);
    const response = await callback(redirect, change(redirect));
    assert.ok(response.status >= 400 && response.status < 500);
    await assert.rejects(flow.result, error => error.code === 'CLOUD_AUTH' && !/one-use-code|secret/.test(error.message));
    await closed(redirect);
  });
}

test('provider denial closes listener and never echoes provider-supplied descriptions', async t => {
  t.mock.method(globalThis, 'fetch', () => assert.fail('Provider denial exchanged a code'));
  const flow = begin(t);
  const redirect = callbackUrl(await flow.browser, { error: 'access_denied', error_description: 'private-provider-details<script>' });
  const response = await callback(redirect);
  assert.doesNotMatch(response.text, /private-provider-details|<script>/);
  await assert.rejects(flow.result, error => /declined|denied/i.test(error.message) && !error.message.includes('private-provider-details'));
  await closed(redirect);
});

test('browser launch failure rejects safely and releases the loopback port', async t => {
  let redirect;
  const flow = begin(t, { openExternal: url => { redirect = callbackUrl(new URL(url)); throw new Error('one-use-code secret browser failure'); } });
  await assert.rejects(flow.result, error => /browser/i.test(error.message) && !error.message.includes('secret'));
  await closed(redirect);
});

test('cancellation aborts an in-flight exchange, closes listener and returns no late token', async t => {
  let started;
  const exchangeStarted = new Promise(resolve => { started = resolve; });
  let fetchSignal;
  let finish;
  t.mock.method(globalThis, 'fetch', async (input, options) => {
    fetchSignal = options.signal;
    started();
    return new Promise(resolve => { finish = resolve; });
  });
  const flow = begin(t);
  const redirect = callbackUrl(await flow.browser);
  await callback(redirect);
  await exchangeStarted;
  flow.controller.abort(new Error('private-cancel-reason'));
  await assert.rejects(flow.result, error => /cancel/i.test(error.message) && !error.message.includes('private-cancel-reason'));
  assert.equal(fetchSignal.aborted, true);
  finish(json(token));
  await closed(redirect);
});

test('finite timeout cancels an abandoned browser and closes even an idle accepted connection', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const flow = begin(t);
  const redirect = callbackUrl(await flow.browser);
  const socket = connect({ host: '127.0.0.1', port: Number(redirect.port) });
  await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('error', reject); });
  const socketClosed = new Promise(resolve => socket.once('close', resolve));
  t.after(() => socket.destroy());
  t.mock.timers.tick(5 * 60 * 1000);
  await assert.rejects(flow.result, /timed out|timeout/i);
  await socketClosed;
  await closed(redirect);
});

test('finite timeout also interrupts a stalled token body and cancels its reader', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let reading;
  const bodyStarted = new Promise(resolve => { reading = resolve; });
  let cancelled = false;
  t.mock.method(globalThis, 'fetch', async () => new Response(new ReadableStream({
    pull() { reading(); return new Promise(() => {}); },
    cancel() { cancelled = true; },
  })));
  const flow = begin(t);
  const redirect = callbackUrl(await flow.browser);
  await callback(redirect);
  await bodyStarted;
  t.mock.timers.tick(5 * 60 * 1000);
  await assert.rejects(flow.result, /timed out|timeout/i);
  assert.equal(cancelled, true);
  await closed(redirect);
});

for (const [name, response] of [
  ['provider error', () => json({ error: 'private-code-in-error', error_description: 'secret-refresh-token' }, 400)],
  ['non-JSON body', () => new Response('secret-auth-code<html>')],
  ['JSON null', () => json(null)],
  ['missing token', () => json({ token_type: 'Bearer', expires_in: 3600, scope: token.scope })],
  ['non-bearer token', () => json({ ...token, token_type: 'MAC' })],
  ['invalid lifetime', () => json({ ...token, expires_in: -1 })],
  ['invalid scope type', () => json({ ...token, scope: ['drive.file'] })],
  ['oversized body', () => new Response('x'.repeat(65537))],
]) {
  test(`token exchange rejects ${name} with bounded safe errors and closes listener`, async t => {
    t.mock.method(globalThis, 'fetch', async () => response());
    const flow = begin(t);
    const redirect = callbackUrl(await flow.browser);
    await callback(redirect);
    await assert.rejects(flow.result, error => error.code === 'CLOUD_AUTH' && error.message.length < 300 && !/private-code|secret|<html>/.test(error.message));
    await closed(redirect);
  });
}

test('network failures do not expose authorization codes through error causes or messages', async t => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('https://provider/token?code=private-auth-code'); });
  const flow = begin(t);
  const redirect = callbackUrl(await flow.browser);
  await callback(redirect);
  await assert.rejects(flow.result, error => error.code === 'CLOUD_AUTH' && !`${error.stack}${error.cause}`.includes('private-auth-code'));
  await closed(redirect);
});

test('network exceptions cannot impersonate safe internal authorization errors', async t => {
  t.mock.method(globalThis, 'fetch', async () => {
    const error = new Error('private-auth-code-and-refresh-token');
    error.code = 'CLOUD_AUTH';
    throw error;
  });
  const flow = begin(t);
  const redirect = callbackUrl(await flow.browser);
  await callback(redirect);
  await assert.rejects(flow.result, error => error.code === 'CLOUD_AUTH' && !`${error.stack}${error.cause}`.includes('private-auth-code'));
  await closed(redirect);
});

test('oversized callback target is rejected without leaking its contents or leaving listener active', async t => {
  t.mock.method(globalThis, 'fetch', () => assert.fail('Oversized callback exchanged a code'));
  const flow = begin(t);
  const redirect = callbackUrl(await flow.browser);
  const response = await callback(redirect, { path: `/?code=${'x'.repeat(9000)}` });
  assert.ok(response.status >= 400 && response.status < 500);
  await assert.rejects(flow.result, /callback|request/i);
  await closed(redirect);
});

test('oversized HTTP headers terminate safely and close the listening port', async t => {
  t.mock.method(globalThis, 'fetch', () => assert.fail('Oversized headers exchanged a code'));
  const flow = begin(t);
  const redirect = callbackUrl(await flow.browser);
  const response = await callback(redirect, { headers: { 'X-Oversized': 'x'.repeat(20000) } });
  assert.equal(response.status, 431);
  await assert.rejects(flow.result, /callback|request/i);
  await closed(redirect);
});

test('duplicate Host headers cannot hide an attacker-controlled authority behind a valid first Host', async t => {
  t.mock.method(globalThis, 'fetch', () => assert.fail('Ambiguous Host reached token exchange'));
  const flow = begin(t);
  const redirect = callbackUrl(await flow.browser);
  const response = await new Promise((resolve, reject) => {
    const socket = connect({ host: '127.0.0.1', port: Number(redirect.port) }, () => {
      socket.write(`GET /?${redirect.searchParams} HTTP/1.1\r\nHost: ${redirect.host}\r\nHost: attacker.example\r\nConnection: close\r\n\r\n`);
    });
    t.after(() => socket.destroy());
    let text = '';
    socket.setEncoding('utf8');
    socket.on('data', chunk => { text += chunk; });
    socket.on('end', () => resolve(text));
    socket.on('error', reject);
  });
  assert.match(response, /^HTTP\/1\.1 400 /);
  await assert.rejects(flow.result, /callback|request/i);
  await closed(redirect);
});
