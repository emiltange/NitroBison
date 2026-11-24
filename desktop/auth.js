import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';

const MAX_CALLBACK_BYTES = 8192;
const MAX_TOKEN_BYTES = 65536;
const AUTH_TIMEOUT_MS = 5 * 60 * 1000;
const PROVIDERS = {
  google: {
    authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
    token: 'https://oauth2.googleapis.com/token',
    scope: 'https://www.googleapis.com/auth/drive.file openid profile email',
    host: '127.0.0.1',
  },
  onedrive: {
    scope: 'https://graph.microsoft.com/Files.ReadWrite.AppFolder',
    host: 'localhost',
  },
};

class AuthorizationError extends Error {}

function failure(message) {
  const error = new AuthorizationError(message);
  error.code = 'CLOUD_AUTH';
  return error;
}

function validate(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)
    || Object.keys(config).some(key => !['provider', 'clientId', 'tenant'].includes(key))
    || typeof config.provider !== 'string' || !Object.hasOwn(PROVIDERS, config.provider)
    || typeof config.clientId !== 'string' || !/^[A-Za-z0-9._-]{1,256}$/.test(config.clientId)) {
    throw failure('Invalid cloud provider or public client ID. Check the desktop app registration.');
  }
  const tenant = config.tenant === undefined ? 'common' : config.tenant;
  if (typeof tenant !== 'string' || tenant.length > 253
    || !(/^(common|consumers|organizations)$/.test(tenant)
      || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenant)
      || /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(tenant))) {
    throw failure('Invalid Microsoft tenant. Use common, consumers, organizations, a tenant UUID or a verified domain.');
  }
  const provider = PROVIDERS[config.provider];
  return {
    ...provider,
    clientId: config.clientId,
    authorize: provider.authorize || `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
    token: provider.token || `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
  };
}

function abortable(promise, signal) {
  promise = Promise.resolve(promise);
  if (signal.aborted) {
    promise.catch(() => {});
    return Promise.reject(signal.reason);
  }
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

async function tokenResponse(response, signal) {
  if (!response.ok) {
    void response.body?.cancel().catch(() => {});
    throw failure('Cloud token exchange was rejected. Check the desktop public client registration, account type and consent, then reconnect.');
  }
  const reader = response.body?.getReader();
  if (!reader) throw failure('Cloud provider returned an invalid token response. Reconnect.');
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await abortable(reader.read(), signal);
      if (done) break;
      length += value.byteLength;
      if (length > MAX_TOKEN_BYTES) throw failure('Cloud provider returned an oversized token response. Reconnect.');
      chunks.push(value);
    }
  } finally {
    // Cancel also releases an unfinished oversized or interrupted provider response.
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  let result;
  try { result = JSON.parse(Buffer.concat(chunks, length).toString('utf8')); }
  catch { throw failure('Cloud provider returned an invalid token response. Reconnect.'); }
  const lifetime = Number(result?.expires_in);
  if (!result || typeof result !== 'object' || Array.isArray(result) || result.error
    || typeof result.access_token !== 'string' || !/^[\x21-\x7e]{1,32768}$/.test(result.access_token)
    || typeof result.token_type !== 'string' || result.token_type.toLowerCase() !== 'bearer'
    || !Number.isFinite(lifetime) || lifetime <= 0 || lifetime > Number.MAX_SAFE_INTEGER / 1000
    || typeof result.scope !== 'string' || !/^[\x20-\x7e]{1,8192}$/.test(result.scope)) {
    throw failure('Cloud provider returned an invalid access token. Reconnect and check the desktop public client registration.');
  }
  return { access_token: result.access_token, token_type: result.token_type, expires_in: lifetime, scope: result.scope };
}

/** Authorize only an allowlisted public client in the system browser; tokens never leave memory. */
export async function authorize(config, { openExternal, signal } = {}) {
  const provider = validate(config);
  if (typeof openExternal !== 'function' || (signal !== undefined && !(signal instanceof AbortSignal))) {
    throw failure('Desktop authorization requires a system browser and a valid cancellation signal.');
  }
  if (signal?.aborted) throw failure('Cloud sign-in was cancelled. Your local vault is unchanged.');

  const controller = new AbortController();
  const cancel = () => controller.abort(failure('Cloud sign-in was cancelled. Your local vault is unchanged.'));
  const sockets = new Set();
  const server = createServer({ maxHeaderSize: 16384, requestTimeout: 10000, headersTimeout: 10000 });
  server.maxHeadersCount = 64;
  server.maxRequestsPerSocket = 1;
  server.setTimeout(10000, socket => socket.destroy());
  server.on('connection', socket => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => {});
  });
  let listening = false;
  let closePromise;
  const closeListener = () => {
    if (!closePromise) {
      closePromise = new Promise(resolve => {
        if (listening) server.close(() => resolve());
        else resolve();
        for (const socket of sockets) socket.destroy();
      });
    }
    return closePromise;
  };
  let timer;
  let verifier = randomBytes(32).toString('base64url');
  let state = randomBytes(32).toString('base64url');
  let stopCallback;
  let acceptCallback;
  let received = false;
  const callback = new Promise((resolve, reject) => { acceptCallback = resolve; stopCallback = reject; });
  // Cancellation or malformed input can settle before the listener's first await returns.
  callback.catch(() => {});
  const aborted = () => stopCallback(controller.signal.reason);
  controller.signal.addEventListener('abort', aborted, { once: true });

  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        listening = true;
        server.removeListener('error', reject);
        resolve();
      });
    });
    server.on('error', () => stopCallback(failure('Cloud callback listener failed. Reconnect.')));
    const port = server.address().port;
    const host = `${provider.host}:${port}`;
    const redirect = `http://${host}/`;
    const respond = (response, status) => {
      response.writeHead(status, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
        'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
        'Referrer-Policy': 'no-referrer',
        'X-Content-Type-Options': 'nosniff',
        Connection: 'close',
      });
      response.end(status === 200 ? 'Authorization received. You can close this tab and return to NitroBison.' : 'Authorization could not complete. Return to NitroBison and reconnect.');
    };
    server.on('request', (request, response) => {
      const fail = message => {
        if (received) { respond(response, 400); return; }
        received = true;
        response.once('finish', () => stopCallback(failure(message)));
        respond(response, 400);
      };
      if (received) { respond(response, 400); return; }
      const target = request.url || '';
      const hosts = request.rawHeaders.filter((value, index) => index % 2 === 0 && value.toLowerCase() === 'host');
      if (request.method !== 'GET' || target.length > MAX_CALLBACK_BYTES
        || target.split('?')[0] !== '/' || target.includes('#')
        || hosts.length !== 1 || request.headers.host !== host || request.rawHeaders.length > 128
        || request.headers['transfer-encoding'] !== undefined
        || (request.headers['content-length'] !== undefined && request.headers['content-length'] !== '0')) {
        fail('Invalid cloud callback request. Reconnect to authorize again.');
        return;
      }
      const query = new URL(target, redirect).searchParams;
      const keys = new Set();
      for (const key of query.keys()) {
        if (keys.has(key)) { fail('Ambiguous cloud callback fields. Reconnect to authorize again.'); return; }
        keys.add(key);
      }
      const returnedState = query.get('state');
      if (typeof returnedState !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(returnedState)
        || !timingSafeEqual(Buffer.from(returnedState), Buffer.from(state))) {
        fail('Cloud sign-in state did not match. Security check failed; reconnect.');
        return;
      }
      const code = query.get('code');
      const error = query.get('error');
      if (error !== null) {
        fail(code !== null ? 'Ambiguous cloud callback response. Reconnect.' : 'Cloud sign-in was declined or denied by the provider. Reconnect when ready.');
        return;
      }
      if (typeof code !== 'string' || !/^[\x21-\x7e]{1,4096}$/.test(code)) {
        fail('Invalid cloud authorization code response. Reconnect.');
        return;
      }
      received = true;
      response.once('finish', () => acceptCallback(code));
      respond(response, 200);
    });
    server.on('clientError', (error, socket) => {
      const callbackError = failure('Invalid or oversized cloud callback request. Reconnect.');
      const reject = !received;
      received = true;
      if (socket.writable) {
        socket.end(`HTTP/1.1 ${error.code === 'HPE_HEADER_OVERFLOW' ? '431 Request Header Fields Too Large' : '400 Bad Request'}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`, () => {
          if (reject) stopCallback(callbackError);
        });
      } else {
        socket.destroy();
        if (reject) stopCallback(callbackError);
      }
    });
    timer = setTimeout(() => controller.abort(failure('Cloud sign-in timed out. Reconnect from NitroBison.')), AUTH_TIMEOUT_MS);
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) cancel();
    const auth = new URL(provider.authorize);
    auth.search = new URLSearchParams({
      client_id: provider.clientId,
      redirect_uri: redirect,
      response_type: 'code',
      scope: provider.scope,
      state,
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
      ...(config.provider === 'onedrive' ? { response_mode: 'query' } : { access_type: 'online' }),
    }).toString();
    if (!controller.signal.aborted) {
      Promise.resolve().then(() => {
        if (!controller.signal.aborted && !received) return openExternal(auth.href);
      }).catch(() => stopCallback(failure('The system browser could not open. Reconnect from NitroBison.')));
    }
    const code = await callback;
    await closeListener();
    if (controller.signal.aborted) throw controller.signal.reason;
    const body = new URLSearchParams({
      client_id: provider.clientId,
      code,
      code_verifier: verifier,
      grant_type: 'authorization_code',
      redirect_uri: redirect,
      ...(config.provider === 'onedrive' ? { scope: provider.scope } : {}),
    });
    const response = await abortable(fetch(provider.token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body,
      signal: controller.signal,
      redirect: 'error',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    }), controller.signal);
    return await tokenResponse(response, controller.signal);
  } catch (error) {
    if (controller.signal.aborted) throw controller.signal.reason;
    if (error instanceof AuthorizationError) throw error;
    throw failure('Cloud sign-in could not complete. Check your connection and desktop public client registration, then reconnect.');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
    controller.signal.removeEventListener('abort', aborted);
    controller.abort();
    verifier = '';
    state = '';
    await closeListener();
  }
}
