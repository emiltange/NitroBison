import { validateSnapshot } from './core.js';
import { portablePath, pathRegistry } from './markdown-paths.js';

const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/drive.file openid profile email';
const MICROSOFT_SCOPE = 'https://graph.microsoft.com/Files.ReadWrite.AppFolder';
const DRIVE = 'https://www.googleapis.com/drive/v2/files';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v2/files';
const GRAPH = 'https://graph.microsoft.com/v1.0/me/drive';
const MAX_BYTES = 10 * 1024 * 1024;
let googleScript;

function failure(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

const conflict = () => failure('Cloud vault changed or already exists. Sync again to merge before saving; no blind overwrite was attempted.', 'CLOUD_CONFLICT');
const reauthenticate = () => failure('Cloud connection expired or was disconnected. Connect the provider again, then sync.', 'CLOUD_AUTH');

function online() {
  if (globalThis.navigator?.onLine === false) throw failure('Cloud connections require an online connection. Your local vault remains available offline.', 'CLOUD_OFFLINE');
}

function randomSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function tokenDetails(response, scope) {
  const normalize = value => value.replace('https://graph.microsoft.com/', '').replace('https://www.googleapis.com/auth/userinfo.', '');
  const scopes = String(response.scope || '').split(/\s+/).map(normalize);
  if (!scope.split(/\s+/).every(value => scopes.includes(normalize(value)))) throw failure('Required cloud permission was not granted. Reconnect and consent to the requested scopes.', 'CLOUD_CONSENT');
  const lifetime = Number(response.expires_in);
  if (typeof response.access_token !== 'string' || !response.access_token || !Number.isFinite(lifetime) || lifetime <= 0 || String(response.token_type).toLowerCase() !== 'bearer') throw failure('Provider returned an invalid access token. Reconnect and check the public client registration.', 'CLOUD_AUTH');
  return { token: response.access_token, expiresAt: Date.now() + lifetime * 1000 };
}

async function loadGoogleScript() {
  if (globalThis.google?.accounts?.oauth2) return;
  if (!googleScript) {
    googleScript = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.referrerPolicy = 'strict-origin-when-cross-origin';
      const timeout = setTimeout(() => { script.remove(); reject(failure('Google sign-in did not load. Check your connection, content blocker and CSP, then reconnect.', 'CLOUD_AUTH')); }, 20000);
      script.onload = () => { clearTimeout(timeout); globalThis.google?.accounts?.oauth2 ? resolve() : reject(failure('Google Identity Services is unavailable. Reconnect while online.', 'CLOUD_AUTH')); };
      script.onerror = () => { clearTimeout(timeout); script.remove(); reject(failure('Cannot load Google Identity Services. Allow accounts.google.com and reconnect while online.', 'CLOUD_AUTH')); };
      document.head.append(script);
    }).catch(error => { googleScript = undefined; throw error; });
  }
  await googleScript;
}

async function googleToken(clientId, scope) {
  await loadGoogleScript();
  return new Promise((resolve, reject) => {
    const state = randomSecret();
    const timer = setTimeout(() => reject(failure('Google sign-in timed out. Reconnect and allow the sign-in popup.', 'CLOUD_AUTH')), 120000);
    const finish = (error, value) => { clearTimeout(timer); error ? reject(error) : resolve(value); };
    try {
      const client = globalThis.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope,
        include_granted_scopes: false,
        state,
        callback(response) {
          if (response.error) return finish(failure(`Google authorization failed (${response.error}). Check consent, test users and the registered web origin.`, 'CLOUD_AUTH'));
          if (response.state !== state) return finish(failure('Google sign-in state did not match. Security check failed; reconnect.', 'CLOUD_AUTH'));
          try { finish(null, tokenDetails(response, scope)); } catch (error) { finish(error); }
        },
        error_callback(error) { finish(failure(`Google sign-in ${error.type === 'popup_closed' ? 'was cancelled' : 'popup could not open'}. Reconnect from the button and allow popups.`, 'CLOUD_AUTH')); },
      });
      client.requestAccessToken({ prompt: 'select_account' });
    } catch (error) { finish(error); }
  });
}

async function microsoftToken(clientId, tenant) {
  if (!/^[a-zA-Z0-9.-]+$/.test(tenant)) throw failure('Use a tenant ID, verified tenant domain, common, organizations or consumers.', 'CLOUD_CONFIG');
  const redirectUri = `${window.location.origin}/oauth-callback.html`;
  const authority = `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0`;
  const state = randomSecret();
  let verifier = randomSecret();
  // Open before the digest promise to retain the user's popup activation.
  const popup = window.open('about:blank', `herd-oauth-${state}`, 'popup,width=560,height=720');
  if (!popup) throw failure('Microsoft sign-in popup was blocked. Allow popups and reconnect using the button.', 'CLOUD_AUTH');
  try {
    const code = await new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error, value) => {
        if (settled) return;
        settled = true;
        clearInterval(closed);
        clearTimeout(timeout);
        window.removeEventListener('message', receive);
        popup.close();
        error ? reject(error) : resolve(value);
      };
      const receive = event => {
        if (event.origin !== window.location.origin || event.source !== popup || event.data?.type !== 'herd-oauth-callback') return;
        if (event.data.state !== state) return finish(failure('Microsoft sign-in state did not match. Security check failed; reconnect.', 'CLOUD_AUTH'));
        if (event.data.error) return finish(failure(`Microsoft authorization failed (${String(event.data.error).slice(0, 100)}). Check consent, account type and SPA redirect registration.`, 'CLOUD_AUTH'));
        if (typeof event.data.code !== 'string' || !event.data.code || event.data.code.length > 10000) return finish(failure('Microsoft did not return a valid authorization code. Reconnect.', 'CLOUD_AUTH'));
        finish(null, event.data.code);
      };
      const closed = setInterval(() => { if (popup.closed) finish(failure('Microsoft sign-in was cancelled. Reconnect when ready.', 'CLOUD_AUTH')); }, 300);
      const timeout = setTimeout(() => finish(failure('Microsoft sign-in timed out. Reconnect and complete the popup.', 'CLOUD_AUTH')), 120000);
      window.addEventListener('message', receive);
      crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)).then(hash => {
        if (settled) return;
        const challenge = btoa(String.fromCharCode(...new Uint8Array(hash))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        const query = new URLSearchParams({ client_id: clientId, response_type: 'code', response_mode: 'query', redirect_uri: redirectUri, scope: MICROSOFT_SCOPE, state, code_challenge: challenge, code_challenge_method: 'S256', prompt: 'select_account' });
        popup.location.href = `${authority}/authorize?${query}`;
      }).catch(error => finish(error));
    });
    let response;
    try {
      response = await fetch(`${authority}/token`, {
        method: 'POST', credentials: 'omit', referrerPolicy: 'no-referrer',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: clientId, grant_type: 'authorization_code', redirect_uri: redirectUri, scope: MICROSOFT_SCOPE, code, code_verifier: verifier }),
      });
    } catch {
      throw failure('Microsoft token exchange failed. Register the exact callback as Single-page application (SPA), not Web; check CORS, network and CSP.', 'CLOUD_AUTH');
    }
    const result = await response.json();
    if (!response.ok || result.error) throw failure(`Microsoft token exchange failed (${result.error || response.status}). Check the SPA redirect URI, account type and app consent; no client secret is needed.`, 'CLOUD_AUTH');
    return tokenDetails(result, MICROSOFT_SCOPE);
  } finally { verifier = ''; popup.close(); }
}

function validId(id) {
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_!.-]{1,250}$/.test(id)) throw failure('Provider returned an invalid cloud file identifier.', 'CLOUD_DATA');
  return id;
}

function validEtag(etag) {
  if (typeof etag !== 'string' || etag.length > 1000 || !/^"[^"\r\n]+"$/.test(etag)) throw failure('Cloud provider did not return a usable ETag revision. Refusing an unsafe concurrent write.', 'CLOUD_REVISION');
  return etag;
}

const revisionFor = (id, etag) => JSON.stringify({ id: validId(id), etag: validEtag(etag) });
function parseRevision(revision) {
  try {
    const value = JSON.parse(revision);
    return { id: validId(value.id), etag: validEtag(value.etag) };
  } catch { throw failure('Invalid cloud revision. Load the cloud vault again before saving.', 'CLOUD_REVISION'); }
}

function preauthenticatedUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw failure('Provider did not return a valid file transfer URL.', 'CLOUD_DATA'); }
  if (url.protocol !== 'https:' || url.username || url.password || !(url.hostname.endsWith('.1drv.com') || url.hostname.endsWith('.sharepoint.com'))) throw failure('Provider returned an unexpected file transfer host. This connector supports global OneDrive/SharePoint only.', 'CLOUD_DATA');
  return url.href;
}

function folderWebUrl(value, provider) {
  if (typeof value !== 'string' || value.length > 4096 || /[\s\x00-\x1f\x7f\\]/.test(value)) return null;
  let url;
  try { url = new URL(value); } catch { return null; }
  const hostAllowed = provider === 'google' ? url.hostname === 'drive.google.com'
    : url.hostname === 'onedrive.live.com' || url.hostname.endsWith('.sharepoint.com');
  const queryKeys = provider === 'google' ? ['id', 'usp'] : ['id', 'cid', 'resid', 'web'];
  if (url.protocol !== 'https:' || !hostAllowed || url.username || url.password || url.port || url.hash
    || [...url.searchParams.keys()].some(key => !queryKeys.includes(key))) return null;
  return url.href;
}

function oneDriveFolderPath(reference, name) {
  if (typeof reference?.path !== 'string' || reference.path.length > 4096) return null;
  const match = /^\/(?:drive|drives\/[A-Za-z0-9_!.-]+)\/root:(\/[^?#]*)?$/.exec(reference.path);
  if (!match) return null;
  let path;
  try { path = decodeURIComponent(match[1] || ''); } catch { return null; }
  const parts = path ? path.slice(1).split('/') : [];
  if (parts.some(part => !part || part === '.' || part === '..' || /[\\\x00-\x1f\x7f]/.test(part))) return null;
  return [...parts, name].join('/');
}

async function checkResponse(response, { missing = false, writing = false } = {}) {
  if (response.status === 404 && missing) return null;
  if (response.status === 401) throw reauthenticate();
  if (response.status === 409 || response.status === 412 || (writing && response.status === 404)) throw conflict();
  if (response.status === 403) throw failure('Cloud access denied. Check the delegated file permission, tenant consent and provider storage policy, then reconnect.', 'CLOUD_PERMISSION');
  if (response.status === 429) throw failure('Cloud provider is rate limiting requests. Wait, then press Sync again; local changes are safe.', 'CLOUD_RATE_LIMIT');
  if (!response.ok) throw failure(`Cloud request failed (HTTP ${response.status}). Check provider availability, storage quota and app registration, then sync again. A failed write may have completed; reload before retrying.`, 'CLOUD_HTTP');
  return response;
}

async function readSnapshot(response) {
  const length = Number(response.headers.get('Content-Length'));
  if (length > MAX_BYTES) {
    await response.body?.cancel();
    throw failure('Cloud snapshot exceeds the 10 MiB transfer limit. Export a local backup before reducing the vault.', 'CLOUD_DATA');
  }
  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  const chunks = [];
  let bytes = 0;
  if (reader) {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > MAX_BYTES) {
          await reader.cancel();
          throw failure('Cloud snapshot exceeds the 10 MiB transfer limit.', 'CLOUD_DATA');
        }
        chunks.push(decoder.decode(value, { stream: true }));
      }
      chunks.push(decoder.decode());
    } finally { reader.releaseLock(); }
  }
  try { return validateSnapshot(JSON.parse(chunks.join(''))); } catch (error) { throw failure(`Invalid cloud vault; nothing was imported: ${error.message}`, 'CLOUD_DATA'); }
}

function serializeSnapshot(snapshot) {
  const text = JSON.stringify(validateSnapshot(snapshot));
  if (new TextEncoder().encode(text).byteLength > MAX_BYTES) throw failure('Cloud snapshot exceeds the 10 MiB transfer limit. Download a local JSON backup instead.', 'CLOUD_DATA');
  return text;
}

export async function authorizeGoogle(clientId) {
  if (typeof clientId !== 'string' || !clientId.trim() || clientId.length > 256 || !/^[A-Za-z0-9._-]+$/.test(clientId.trim())) throw failure('Enter a Google public OAuth client ID, never a client secret.', 'CLOUD_CONFIG');
  const native = globalThis.window?.nitrobisonDesktop?.isDesktop === true;
  if (!native) {
    if (typeof window === 'undefined' || !window.location?.origin || !/^https?:$/.test(window.location.protocol)) throw failure('Google authentication requires HTTPS or localhost development.', 'CLOUD_CONFIG');
    if (window.location.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(new URL(window.location.origin).hostname)) throw failure('Google authentication requires HTTPS, except localhost development origins.', 'CLOUD_CONFIG');
  }
  online();
  return native
    ? tokenDetails(await window.nitrobisonDesktop.authorize({ provider: 'google', clientId: clientId.trim() }), GOOGLE_SCOPE)
    : googleToken(clientId.trim(), GOOGLE_SCOPE);
}

export async function connectCloud({ provider, clientId, tenant = 'common' } = {}) {
  if (provider !== 'google' && provider !== 'onedrive') throw failure('Select the google or onedrive cloud provider.', 'CLOUD_CONFIG');
  if (typeof clientId !== 'string' || !clientId.trim() || clientId.length > 500) throw failure('Enter your provider application client ID. This is a public identifier, never a client secret.', 'CLOUD_CONFIG');
  const native = globalThis.window?.nitrobisonDesktop?.isDesktop === true;
  if (!native) {
    if (typeof window === 'undefined' || !window.location?.origin || !/^https?:$/.test(window.location.protocol)) throw failure('Cloud authentication requires a browser on HTTPS (or localhost during development).', 'CLOUD_CONFIG');
    if (window.location.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(new URL(window.location.origin).hostname)) throw failure('Cloud authentication requires HTTPS, except localhost development origins.', 'CLOUD_CONFIG');
  }
  online();
  let access = provider === 'google' ? await authorizeGoogle(clientId)
    : native ? tokenDetails(await window.nitrobisonDesktop.authorize({ provider, clientId: clientId.trim(), tenant }), MICROSOFT_SCOPE)
      : await microsoftToken(clientId.trim(), tenant);
  const connected = () => Boolean(access && Date.now() < access.expiresAt - 30000);
  const request = async (url, options = {}, policy = {}) => {
    online();
    if (!connected()) throw reauthenticate();
    const headers = new Headers(options.headers);
    headers.set('Authorization', `Bearer ${access.token}`);
    let response;
    try { response = await fetch(url, { ...options, headers, credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', redirect: 'error' }); }
    catch { throw failure('Cloud request could not complete. Check your network and CSP, then sync again. A write may have completed; reload before retrying.', 'CLOUD_NETWORK'); }
    if (response.status === 401) access = null;
    return checkResponse(response, policy);
  };
  const disconnect = () => { if (access) access.token = ''; access = null; };
  return provider === 'google' ? googleConnection(request, disconnect, connected) : oneDriveConnection(request, disconnect, connected);
}

function googleConnection(request, disconnect, connected) {
  let canModifyContent;
  let info = { accountType: 'unknown', folder: null };
  async function find(query) {
    const response = await request(`${DRIVE}?${new URLSearchParams({ q: query, fields: 'items(id),nextPageToken', maxResults: '2' })}`);
    const result = await response.json();
    if (!Array.isArray(result.items)) throw failure('Google returned an invalid file listing.', 'CLOUD_DATA');
    if (result.items.length > 1 || result.nextPageToken) throw failure('Multiple cloud folders or vault.json files exist for NitroBison. Download all copies in Drive and resolve duplicates manually before reconnecting; nothing was overwritten.', 'CLOUD_CONFLICT');
    return result.items.length ? validId(result.items[0].id) : null;
  }
  const folder = () => find("trashed = false and title = 'Herd' and mimeType = 'application/vnd.google-apps.folder' and properties has { key='herd' and value='vault-v1' and visibility='PRIVATE' }");
  const file = parent => find(`trashed = false and title = 'vault.json' and '${validId(parent)}' in parents`);
  const metadata = async id => {
    const result = await (await request(`${DRIVE}/${validId(id)}?fields=id,etag,capabilities(canModifyContent)`, {}, { missing: true }))?.json();
    canModifyContent = typeof result?.capabilities?.canModifyContent === 'boolean' ? result.capabilities.canModifyContent : undefined;
    return result;
  };
  async function locate() {
    const parent = await folder();
    return { parent, id: parent ? await file(parent) : null };
  }
  return {
    name: 'Google Drive', disconnect,
    get connected() { return connected(); },
    get info() { return connected() ? { accountType: info.accountType, folder: info.folder && { ...info.folder } } : { accountType: 'unknown', folder: null }; },
    async verify() {
      info = { accountType: 'unknown', folder: null };
      const identity = await (await request('https://www.googleapis.com/oauth2/v2/userinfo')).json();
      let accountType = 'unknown';
      if (typeof identity?.id === 'string' && /^[A-Za-z0-9_-]{1,250}$/.test(identity.id)
        && typeof identity.email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identity.email)) {
        // Hosted-domain metadata, never the email suffix, identifies a Workspace account.
        if (!Object.hasOwn(identity, 'hd')) accountType = 'personal';
        else if (typeof identity.hd === 'string' && /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(identity.hd) && identity.hd.length <= 253) accountType = 'business';
      }
      const id = await folder();
      let reference = null;
      if (id) {
        const response = await request(`${DRIVE}/${id}?fields=id,title,mimeType,alternateLink`, {}, { missing: true });
        if (response) {
          const result = await response.json();
          if (!result || result.id !== id || result.title !== 'Herd' || result.mimeType !== 'application/vnd.google-apps.folder') throw failure('Google returned invalid vault folder metadata.', 'CLOUD_DATA');
          reference = { id, name: result.title, path: result.title, webUrl: folderWebUrl(result.alternateLink, 'google') };
        }
      }
      info = { accountType, folder: reference };
      return this.info;
    },
    get readOnly() { return canModifyContent === false; },
    async load() {
      const { id } = await locate();
      if (!id) { canModifyContent = undefined; return null; }
      const before = await metadata(id);
      if (!before) return null;
      const revision = revisionFor(id, before.etag);
      const response = await request(`${DRIVE}/${id}?alt=media`, { headers: { 'If-Match': before.etag } }, { missing: true });
      if (!response) return null;
      const snapshot = await readSnapshot(response);
      const after = await metadata(id);
      if (!after || after.etag !== before.etag) throw conflict();
      return { snapshot, revision };
    },
    async save(snapshot, revision) {
      const body = serializeSnapshot(snapshot);
      const expected = revision === null ? null : parseRevision(revision);
      let { parent, id } = await locate();
      if (expected) {
        if (id !== expected.id) throw conflict();
        const current = await metadata(id);
        if (!current) throw conflict();
        if (canModifyContent === false) throw failure('Google Drive grants read-only access to this vault. Local changes are retained; ask the file owner for content editing access before saving.', 'CLOUD_READ_ONLY');
        if (canModifyContent !== true) throw failure('Google Drive did not report whether this vault content can be modified. Sync again before saving; no write was attempted.', 'CLOUD_PERMISSION_UNKNOWN');
        if (current.etag !== expected.etag) throw conflict();
        const response = await request(`${DRIVE_UPLOAD}/${id}?uploadType=media&fields=id,etag`, { method: 'PUT', headers: { 'Content-Type': 'application/json; charset=UTF-8', 'If-Match': expected.etag }, body }, { writing: true });
        const saved = await response.json();
        return revisionFor(saved.id, saved.etag);
      }
      if (id) throw conflict();
      if (globalThis.window?.nitrobisonDesktop?.isDesktop && !await window.nitrobisonDesktop.confirmGoogleVaultCreation()) {
        throw failure('Google vault creation cancelled. Export a backup from the web app before choosing whether to create a separate desktop-visible cloud vault.', 'CLOUD_CREATION_CANCELLED');
      }
      canModifyContent = undefined;
      if (!parent) {
        const response = await request(`${DRIVE}?fields=id`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Herd', mimeType: 'application/vnd.google-apps.folder', properties: [{ key: 'herd', value: 'vault-v1', visibility: 'PRIVATE' }] }) }, { writing: true });
        parent = validId((await response.json()).id);
      }
      const boundary = `herd_${randomSecret()}`;
      const metadataBody = JSON.stringify({ title: 'vault.json', mimeType: 'application/json', parents: [{ id: parent }] });
      const multipart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadataBody}\r\n--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${body}\r\n--${boundary}--\r\n`;
      const response = await request(`${DRIVE_UPLOAD}?uploadType=multipart&fields=id,etag`, { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body: multipart }, { writing: true });
      const saved = await response.json();
      const result = revisionFor(saved.id, saved.etag);
      // Drive allows duplicate names: detect simultaneous first creates, retaining both copies.
      const current = await locate();
      if (current.id !== saved.id) throw conflict();
      return result;
    },
  };
}

function oneDriveConnection(request, disconnect, connected) {
  let info = { accountType: 'unknown', folder: null };
  const metadata = async (path = '/special/approot:/vault.json') => (await request(`${GRAPH}${path}?$select=id,name,eTag,file,@microsoft.graph.downloadUrl`, {}, { missing: true }))?.json();
  async function load() {
    const before = await metadata();
    if (!before) return null;
    if (!before.file || before.name !== 'vault.json') throw failure('OneDrive vault.json is not a regular file. Move the conflicting folder out of the app folder.', 'CLOUD_DATA');
    const revision = revisionFor(before.id, before.eTag);
    const response = await fetch(preauthenticatedUrl(before['@microsoft.graph.downloadUrl']), { credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store', redirect: 'error' });
    await checkResponse(response);
    const snapshot = await readSnapshot(response);
    const after = await metadata(`/items/${validId(before.id)}`);
    if (!after || after.eTag !== before.eTag) throw conflict();
    return { snapshot, revision };
  }
  async function createFile(name, body) {
    const response = await request(`${GRAPH}/special/approot:/${name}:/content?@microsoft.graph.conflictBehavior=fail`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json; charset=UTF-8', 'If-None-Match': '*' }, body,
    }, { writing: true });
    const saved = await response.json();
    revisionFor(saved.id, saved.eTag);
    return saved;
  }
  return {
    name: 'OneDrive', disconnect, load,
    get connected() { return connected(); },
    get info() { return connected() ? { accountType: info.accountType, folder: info.folder && { ...info.folder } } : { accountType: 'unknown', folder: null }; },
    async verify() {
      info = { accountType: 'unknown', folder: null };
      const result = await (await request(`${GRAPH}/special/approot?$select=id,name,folder,parentReference,webUrl`)).json();
      if (!result || typeof result !== 'object' || Array.isArray(result)
        || !result.folder || typeof result.folder !== 'object' || Array.isArray(result.folder)
        || typeof result.name !== 'string' || !result.name.trim() || result.name.length > 255
        || result.name === '.' || result.name === '..' || /[/\\\x00-\x1f\x7f]/.test(result.name)) throw failure('OneDrive returned invalid app folder metadata.', 'CLOUD_DATA');
      const id = validId(result.id);
      const driveType = result.parentReference?.driveType;
      const accountType = driveType === 'personal' ? 'personal' : driveType === 'business' || driveType === 'documentLibrary' ? 'business' : 'unknown';
      info = { accountType, folder: { id, name: result.name, path: oneDriveFolderPath(result.parentReference, result.name), webUrl: folderWebUrl(result.webUrl, 'onedrive') } };
      return this.info;
    },
    async save(snapshot, revision) {
      const body = serializeSnapshot(snapshot);
      const expected = revision === null ? null : parseRevision(revision);
      const current = await metadata();
      if (expected ? current?.id !== expected.id || current?.eTag !== expected.etag : current !== undefined) throw conflict();
      let saved;
      if (expected) {
        const recoveryName = `herd-recovery-${crypto.randomUUID()}.json`;
        await createFile(recoveryName, body);
        try {
          const sessionResponse = await request(`${GRAPH}/items/${expected.id}/createUploadSession`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'If-Match': expected.etag },
            body: JSON.stringify({ item: { name: 'vault.json', '@microsoft.graph.conflictBehavior': 'replace' } }),
          }, { writing: true });
          const session = await sessionResponse.json();
          const bytes = new TextEncoder().encode(body);
          // Session URLs are preauthenticated: never send the Graph bearer token.
          const response = await fetch(preauthenticatedUrl(session.uploadUrl), {
            method: 'PUT', credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error',
            headers: { 'Content-Type': 'application/octet-stream', 'Content-Range': `bytes 0-${bytes.byteLength - 1}/${bytes.byteLength}`, 'If-Match': expected.etag }, body: bytes,
          });
          await checkResponse(response, { writing: true });
          if (response.status !== 200 && response.status !== 201) throw failure('OneDrive did not confirm the complete snapshot upload. Reconnect and sync to inspect the canonical file before retrying.', 'CLOUD_HTTP');
          saved = await response.json();
        } catch (error) {
          error.message += ` Your submitted version is preserved in the OneDrive app folder as ${recoveryName}.`;
          throw error;
        }
      } else saved = await createFile('vault.json', body);
      const nextRevision = revisionFor(saved.id, saved.eTag);
      const verified = await load();
      if (!verified || verified.revision !== nextRevision || serializeSnapshot(verified.snapshot) !== body) throw conflict();
      return nextRevision;
    },
  };
}


export async function importMarkdownFiles(fileList) {
  const register = pathRegistry();
  const entries = [];
  for (const file of Array.from(fileList || [])) {
    const path = file.webkitRelativePath || file.name;
    portablePath(path);
    if (!/\.md$/i.test(path)) continue;
    register(path, 'file');
    entries.push({ file, path });
  }
  if (entries.length > 20000) throw new Error('Import supports at most 20,000 Markdown files at once.');
  const notes = [];
  const folders = new Set();
  for (const { file, path } of entries) {
    const parts = path.split('/');
    const title = parts.pop().slice(0, -3);
    const folder = parts.join('/');
    for (let i = 1; i <= parts.length; i++) folders.add(parts.slice(0, i).join('/'));
    notes.push({ id: crypto.randomUUID(), title, folder, content: await file.text(), updatedAt: Number.isSafeInteger(file.lastModified) && file.lastModified >= 0 ? file.lastModified : Date.now() });
  }
  return validateSnapshot({ notes, folders: [...folders] });
}

async function existingDirectory(root, path) {
  let directory = root;
  for (const part of path.split('/').filter(Boolean)) {
    try { directory = await directory.getDirectoryHandle(part); }
    catch (error) { if (error.name === 'NotFoundError') return null; throw error; }
  }
  return directory;
}

async function existingFile(directory, name) {
  if (!directory) return null;
  try { return await directory.getFileHandle(name); }
  catch (error) { if (error.name === 'NotFoundError') return null; throw error; }
}

export async function exportMarkdownFolder(value) {
  const snapshot = validateSnapshot(value);
  const register = pathRegistry();
  for (const folder of snapshot.folders) register(folder, 'folder');
  const notes = snapshot.notes.filter(note => !note.deleted);
  for (const note of notes) register(`${note.folder ? `${note.folder}/` : ''}${note.title}.md`, 'file');
  if (globalThis.window?.nitrobisonDesktop?.isDesktop) return window.nitrobisonDesktop.exportMarkdown(snapshot);
  if (typeof globalThis.showDirectoryPicker !== 'function') throw new Error('Folder export needs a supporting Chromium browser on HTTPS or localhost. Use Download JSON for a portable complete backup.');
  const root = await globalThis.showDirectoryPicker({ mode: 'readwrite', id: 'herd-vault-export' });
  const pending = [];
  // Inspect the entire destination before creating any files.
  for (const note of notes) {
    const directory = await existingDirectory(root, note.folder);
    const name = `${note.title}.md`;
    const existing = await existingFile(directory, name);
    if (existing) {
      if (await (await existing.getFile()).text() !== note.content) throw new Error(`Export conflict: ${note.folder ? `${note.folder}/` : ''}${name} already exists with different content. Choose an empty destination or move the existing file; nothing has been overwritten.`);
    } else pending.push(note);
  }
  const directories = new Map([['', root]]);
  const getDirectory = async path => {
    if (directories.has(path)) return directories.get(path);
    let directory = root;
    let current = '';
    for (const part of path.split('/').filter(Boolean)) {
      current = current ? `${current}/${part}` : part;
      if (!directories.has(current)) directories.set(current, await directory.getDirectoryHandle(part, { create: true }));
      directory = directories.get(current);
    }
    return directory;
  };
  for (const folder of snapshot.folders) await getDirectory(folder);
  for (const note of pending) {
    const directory = await getDirectory(note.folder);
    const name = `${note.title}.md`;
    // Recheck because another writer may have created the file after preflight.
    if (await existingFile(directory, name)) throw new Error(`Export conflict: ${name} appeared during export. Choose a fresh destination; existing files were preserved.`);
    const handle = await directory.getFileHandle(name, { create: true });
    const stream = await handle.createWritable({ mode: 'exclusive', keepExistingData: true });
    try {
      if ((await handle.getFile()).size > 0) throw new Error(`Export conflict: ${name} changed during export; it was not overwritten.`);
      await stream.write(note.content);
      await stream.close();
    } catch (error) { await stream.abort?.(); throw error; }
  }
  return notes.length;
}

export function downloadVault(value) {
  const snapshot = validateSnapshot(value);
  const url = URL.createObjectURL(new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `nitrobison-vault-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
