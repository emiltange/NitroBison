import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { mkdirSync, chmodSync, realpathSync } from 'node:fs';
import { open, realpath, stat } from 'node:fs/promises';
import { resolve, relative, isAbsolute, sep, extname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { validateSnapshot } from '../src/core.js';

const deriveKey = promisify(scrypt);
const AUTH_BODY_LIMIT = 64 * 1024;
const WORKSPACE_BODY_LIMIT = 10 * 1024 * 1024;
const SESSION_TTL = 30 * 24 * 60 * 60 * 1000;
const INVITE_TTL = 48 * 60 * 60 * 1000;
const COOKIE_NAME = 'herd_session';
const SCRYPT = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const DUMMY_PASSWORD = `scrypt$32768$8$3$${Buffer.alloc(16).toString('base64url')}$${Buffer.alloc(64).toString('base64url')}`;
const CSP = [
  "default-src 'self'",
  "script-src 'self' https://accounts.google.com/gsi/client",
  "style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https://accounts.google.com https://oauth2.googleapis.com https://www.googleapis.com https://graph.microsoft.com https://login.microsoftonline.com https://*.1drv.com https://*.sharepoint.com",
  'frame-src https://accounts.google.com https://login.microsoftonline.com',
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.map': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif',
  '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.wasm': 'application/wasm', '.txt': 'text/plain; charset=utf-8', '.pdf': 'application/pdf',
};
const ROUTES = {
  '/api/health': ['GET'], '/api/session': ['GET', 'POST'], '/api/setup': ['POST'], '/api/logout': ['POST'],
  '/api/invites': ['POST'], '/api/invites/accept': ['POST'], '/api/members': ['GET'], '/api/workspace': ['GET', 'PUT'],
};

class HttpError extends Error {
  constructor(status, message, details = {}) { super(message); this.status = status; this.details = details; }
}
function fail(status, message, details) { throw new HttpError(status, message, details); }
function digest(value) { return createHash('sha256').update(value).digest('hex'); }
function publicUser(user) { return { id: user.id, email: user.email, name: user.name, role: user.role }; }
function inside(root, path) {
  const pathFromRoot = relative(root, path);
  return !isAbsolute(pathFromRoot) && pathFromRoot !== '..' && !pathFromRoot.startsWith(`..${sep}`);
}
function object(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(400, 'Expected a JSON object.');
  return value;
}
function text(value, label, max = 100) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\x00-\x1f\x7f]/.test(value)) fail(400, `${label} must contain 1–${max} characters without control characters.`);
  return value.trim();
}
function emailAddress(value) {
  const email = text(value, 'Email', 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'Enter a valid email address.');
  return email;
}
function passwordValue(value, creating = true) {
  if (typeof value !== 'string' || value.length < (creating ? 12 : 1) || value.length > 1024) fail(400, creating ? 'Use a password of 12–1024 characters.' : 'Enter a valid password.');
  return value;
}
function json(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}
function readJson(req, limit) {
  if ((req.headers['content-type'] || '').split(';')[0].trim().toLowerCase() !== 'application/json') {
    req.resume();
    fail(415, 'Use Content-Type: application/json.');
  }
  if (req.headers['content-encoding'] && req.headers['content-encoding'] !== 'identity') {
    req.resume();
    fail(415, 'Compressed request bodies are not supported.');
  }
  if (Number(req.headers['content-length'] || 0) > limit) {
    req.resume();
    fail(413, 'Request body is too large.');
  }
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    let size = 0;
    function cleanup() {
      req.off('data', onData); req.off('end', onEnd); req.off('error', onError); req.off('aborted', onAborted);
    }
    function onError(error) { cleanup(); reject(error); }
    function onAborted() { cleanup(); reject(new HttpError(400, 'Request body was interrupted.')); }
    function onData(chunk) {
      size += chunk.length;
      if (size > limit) {
        cleanup(); req.resume(); reject(new HttpError(413, 'Request body is too large.'));
      } else chunks.push(chunk);
    }
    function onEnd() {
      cleanup();
      try {
        const source = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, size));
        resolveBody(object(JSON.parse(source)));
      } catch (error) { reject(error instanceof HttpError ? error : new HttpError(400, 'Invalid JSON body.')); }
    }
    req.on('data', onData); req.once('end', onEnd); req.once('error', onError); req.once('aborted', onAborted);
  });
}
function protectOrigin(req) {
  if (['cross-site', 'same-site'].includes(req.headers['sec-fetch-site'])) fail(403, 'Cross-origin requests are not allowed.');
  const origin = req.headers.origin;
  if (!origin) return; // Non-browser clients have no Origin; JSON-only bodies prevent form-based CSRF.
  try {
    const parsed = new URL(origin);
    const host = new URL(`http://${req.headers.host}`);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin || parsed.host !== host.host) fail(403, 'Cross-origin requests are not allowed.');
  } catch { fail(403, 'Cross-origin requests are not allowed.'); }
}
function sessionToken(req) {
  const values = (req.headers.cookie || '').split(';').map(part => part.trim()).filter(part => part.startsWith(`${COOKIE_NAME}=`));
  if (values.length !== 1) return null;
  const token = values[0].slice(COOKIE_NAME.length + 1);
  return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}
function cookie(res, token, secure) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${token || ''}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${token ? SESSION_TTL / 1000 : 0}${secure ? '; Secure' : ''}`);
}
function snapshotBody(body) {
  if (!Number.isSafeInteger(body.revision) || body.revision < 0) fail(400, 'Revision must be a nonnegative safe integer.');
  if (!Array.isArray(body.notes) || body.notes.length > 10_000 || !Array.isArray(body.folders) || body.folders.length > 2_000) fail(400, 'A workspace supports up to 10,000 notes and 2,000 folders.');
  let snapshot;
  try { snapshot = validateSnapshot(body); } catch (error) { fail(400, error.message); }
  if (snapshot.folders.length > 2_000 || snapshot.notes.some(note => Buffer.byteLength(note.content) > 1024 * 1024)) fail(400, 'Notes support up to 1 MiB of UTF-8 content and workspaces up to 2,000 folders.');
  return snapshot;
}

async function serveStatic(req, res, staticRoot, dataRoot) {
  let pathname;
  try { pathname = decodeURIComponent(req.url.split('?')[0]); } catch { fail(400, 'Invalid URL encoding.'); }
  if (!pathname.startsWith('/') || pathname.startsWith('//') || /[\\\x00-\x1f\x7f]/.test(pathname)) fail(403, 'This path is not public.');
  const segments = pathname.split('/').filter(Boolean);
  if (segments.some(part => part.startsWith('.') || /[:<>"|?*]/.test(part) || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) fail(403, 'This path is not public.');
  const root = await realpath(staticRoot).catch(error => {
    if (error.code === 'ENOENT') fail(404, 'The application has not been built.');
    throw error;
  });
  async function findFile(path) {
    let actual;
    try { actual = await realpath(path); } catch (error) {
      if (['ENOENT', 'ENOTDIR'].includes(error.code)) return null;
      throw error;
    }
    if (!inside(root, actual) || inside(dataRoot, actual)) fail(403, 'This path is not public.');
    const metadata = await stat(actual);
    if (!metadata.isFile()) return null;
    const file = await open(actual, 'r');
    return { file, stat: metadata, actual };
  }
  let found = await findFile(join(root, ...segments, ...(segments.length ? [] : ['index.html'])));
  const navigation = (req.headers.accept || '').includes('text/html') && (!req.headers['sec-fetch-mode'] || req.headers['sec-fetch-mode'] === 'navigate');
  if (!found && navigation && !extname(pathname) && !pathname.startsWith('/api')) found = await findFile(join(root, 'index.html'));
  if (!found) fail(404, 'Not found.');
  const { file, stat: metadata, actual } = found;
  res.setHeader('Content-Type', MIME[extname(actual).toLowerCase()] || 'application/octet-stream');
  res.setHeader('Content-Length', metadata.size);
  res.setHeader('Cache-Control', 'no-cache');
  if (pathname === '/sw.js') res.setHeader('Service-Worker-Allowed', '/');
  if (req.method === 'HEAD') { await file.close(); res.end(); return; }
  try { await pipeline(file.createReadStream(), res); } finally { await file.close(); }
}

export function createApp({ dataDir, staticDir, setupToken, secureCookies = false, workspaceName = 'NitroBison' }) {
  if (typeof dataDir !== 'string' || typeof staticDir !== 'string') throw new Error('dataDir and staticDir are required.');
  if (typeof setupToken !== 'string' || !setupToken || setupToken.length > 1024) throw new Error('A nonempty setupToken of at most 1024 characters is required.');
  workspaceName = text(workspaceName, 'Workspace name');
  const staticRoot = resolve(staticDir);
  const dataPath = resolve(dataDir);
  if (inside(staticRoot, dataPath)) throw new Error('DATA_DIR must not be inside STATIC_DIR.');
  mkdirSync(dataPath, { recursive: true, mode: 0o700 });
  const dataRoot = realpathSync(dataPath);
  const databasePath = join(dataRoot, 'herd.sqlite');
  const db = new DatabaseSync(databasePath, { timeout: 5000 });
  try {
    chmodSync(databasePath, 0o600);
    db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA foreign_keys = ON; PRAGMA trusted_schema = OFF;');
    const version = db.prepare('PRAGMA user_version').get().user_version;
    if (version > 1) throw new Error('The database was created by a newer NitroBison version.');
    db.exec(`
      BEGIN IMMEDIATE;
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE, name TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('owner', 'editor', 'viewer')), password_hash TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS single_owner ON users(role) WHERE role = 'owner';
      CREATE TABLE IF NOT EXISTS workspace (
        id INTEGER PRIMARY KEY CHECK(id = 1), name TEXT NOT NULL, revision INTEGER NOT NULL CHECK(revision >= 0), snapshot TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
      CREATE TABLE IF NOT EXISTS invites (
        token_hash TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
        role TEXT NOT NULL CHECK(role IN ('editor', 'viewer')), expires_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS invites_expiry ON invites(expires_at);
      PRAGMA user_version = 1;
    `);
    db.prepare('INSERT OR IGNORE INTO workspace (id, name, revision, snapshot) VALUES (1, ?, 0, ?)').run(workspaceName, JSON.stringify({ notes: [], folders: [] }));
    db.exec('COMMIT');
  } catch (error) {
    if (db.isTransaction) db.exec('ROLLBACK');
    db.close();
    throw error;
  }
  const sql = {
    workspace: db.prepare('SELECT name, revision, snapshot FROM workspace WHERE id = 1'),
    anyUser: db.prepare('SELECT id FROM users LIMIT 1'),
    byEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
    byId: db.prepare('SELECT * FROM users WHERE id = ?'),
    session: db.prepare('SELECT users.* FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ? AND sessions.expires_at > ?'),
    invite: db.prepare('SELECT * FROM invites WHERE token_hash = ?'),
    insertUser: db.prepare('INSERT INTO users (id, email, name, role, password_hash) VALUES (?, ?, ?, ?, ?)'),
    insertSession: db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)'),
    deleteSession: db.prepare('DELETE FROM sessions WHERE token_hash = ?'),
    cleanSessions: db.prepare('DELETE FROM sessions WHERE expires_at <= ?'),
    cleanInvites: db.prepare('DELETE FROM invites WHERE expires_at <= ?'),
    deleteInvite: db.prepare('DELETE FROM invites WHERE token_hash = ?'),
    deleteEmailInvites: db.prepare('DELETE FROM invites WHERE email = ?'),
    insertInvite: db.prepare('INSERT INTO invites (token_hash, email, role, expires_at) VALUES (?, ?, ?, ?)'),
    members: db.prepare('SELECT id, email, name, role FROM users ORDER BY CASE role WHEN \'owner\' THEN 0 ELSE 1 END, email'),
    deleteUser: db.prepare('DELETE FROM users WHERE id = ?'),
    setupWorkspace: db.prepare('UPDATE workspace SET name = ? WHERE id = 1'),
    saveWorkspace: db.prepare('UPDATE workspace SET revision = revision + 1, snapshot = ? WHERE id = 1 AND revision = ?'),
  };
  const setupDigest = Buffer.from(digest(setupToken), 'hex');
  const attempts = new Map();
  let passwordJobs = 0;
  let closed = false;
  function transaction(action) {
    db.exec('BEGIN IMMEDIATE');
    try { const result = action(); db.exec('COMMIT'); return result; } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  function workspace() {
    const row = sql.workspace.get();
    return { revision: row.revision, ...JSON.parse(row.snapshot) };
  }
  function currentUser(req) {
    const token = sessionToken(req);
    return token ? sql.session.get(digest(token), Date.now()) : null;
  }
  function authorize(req, roles) {
    const user = currentUser(req);
    if (!user) fail(401, 'Sign in to this workspace.');
    if (roles && !roles.includes(user.role)) fail(403, 'Your workspace role does not allow this action.');
    return user;
  }
  function rateLimit(req, res) {
    const key = req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    let entry = attempts.get(key);
    if (!entry || entry.until <= now) {
      if (attempts.size >= 2048) attempts.delete(attempts.keys().next().value);
      entry = { count: 0, until: now + 15 * 60 * 1000 };
      attempts.set(key, entry);
    }
    if (++entry.count > 30) {
      res.setHeader('Retry-After', Math.max(1, Math.ceil((entry.until - now) / 1000)));
      fail(429, 'Too many authentication attempts. Try again later.');
    }
  }
  async function passwordHash(password, stored) {
    if (passwordJobs >= 4) fail(503, 'Password processing is busy. Try again.');
    passwordJobs++;
    try {
      if (stored === undefined) {
        const salt = randomBytes(16).toString('base64url');
        const key = await deriveKey(password, salt, 64, SCRYPT);
        return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt}$${key.toString('base64url')}`;
      }
      const [algorithm, n, r, p, salt, expected, ...extra] = (stored || DUMMY_PASSWORD).split('$');
      if (algorithm !== 'scrypt' || extra.length || !salt || !expected || Number(n) !== SCRYPT.N || Number(r) !== SCRYPT.r || Number(p) !== SCRYPT.p) throw new Error('Unsupported stored password format.');
      const key = await deriveKey(password, salt, 64, { ...SCRYPT, N: Number(n), r: Number(r), p: Number(p) });
      const expectedKey = Buffer.from(expected, 'base64url');
      return expectedKey.length === key.length && timingSafeEqual(key, expectedKey);
    } finally { passwordJobs--; }
  }
  function issueSession(req, userId) {
    const previous = sessionToken(req);
    if (previous) sql.deleteSession.run(digest(previous));
    sql.cleanSessions.run(Date.now());
    const token = randomBytes(32).toString('base64url');
    sql.insertSession.run(digest(token), userId, Date.now() + SESSION_TTL);
    return token;
  }
  async function handleApi(req, res, path) {
    res.setHeader('Cache-Control', 'no-store');
    const memberMatch = /^\/api\/members\/([^/]+)$/.exec(path);
    const methods = memberMatch ? ['DELETE'] : ROUTES[path];
    if (!methods) fail(404, 'Unknown API endpoint.');
    if (!methods.includes(req.method)) { res.setHeader('Allow', methods.join(', ')); fail(405, 'Method not allowed.'); }
    if (!['GET', 'HEAD'].includes(req.method)) protectOrigin(req);
    if (path === '/api/health') return json(res, 200, { ok: true });
    if (path === '/api/session' && req.method === 'GET') {
      const user = currentUser(req);
      return json(res, 200, { user: user ? publicUser(user) : null, setupRequired: !sql.anyUser.get(), workspaceName: sql.workspace.get().name });
    }
    if (path === '/api/setup') {
      rateLimit(req, res);
      const body = await readJson(req, AUTH_BODY_LIMIT);
      if (sql.anyUser.get()) fail(409, 'This workspace has already been set up.');
      if (typeof body.setupToken !== 'string' || !timingSafeEqual(Buffer.from(digest(body.setupToken), 'hex'), setupDigest)) fail(403, 'The setup token is incorrect.');
      const email = emailAddress(body.email);
      const password = passwordValue(body.password);
      const name = text(body.name, 'Name');
      const nameOfWorkspace = body.workspaceName === undefined ? sql.workspace.get().name : text(body.workspaceName, 'Workspace name');
      const hash = await passwordHash(password);
      const user = { id: randomUUID(), email, name, role: 'owner' };
      const token = transaction(() => {
        if (sql.anyUser.get()) fail(409, 'This workspace has already been set up.');
        sql.insertUser.run(user.id, email, name, user.role, hash);
        sql.setupWorkspace.run(nameOfWorkspace);
        return issueSession(req, user.id);
      });
      cookie(res, token, secureCookies);
      return json(res, 201, { user, workspaceName: nameOfWorkspace });
    }
    if (path === '/api/session') {
      rateLimit(req, res);
      const body = await readJson(req, AUTH_BODY_LIMIT);
      const email = emailAddress(body.email);
      const password = passwordValue(body.password, false);
      const user = sql.byEmail.get(email);
      if (!await passwordHash(password, user?.password_hash || null) || !user) fail(401, 'Email or password is incorrect.');
      const token = transaction(() => {
        const existing = sql.byId.get(user.id);
        if (!existing || existing.password_hash !== user.password_hash) fail(401, 'Email or password is incorrect.');
        return issueSession(req, user.id);
      });
      cookie(res, token, secureCookies);
      return json(res, 200, { user: publicUser(user), workspaceName: sql.workspace.get().name });
    }
    if (path === '/api/logout') {
      await readJson(req, AUTH_BODY_LIMIT);
      const token = sessionToken(req);
      if (token) sql.deleteSession.run(digest(token));
      cookie(res, null, secureCookies);
      return json(res, 200, { ok: true });
    }
    if (path === '/api/invites/accept') {
      rateLimit(req, res);
      const body = await readJson(req, AUTH_BODY_LIMIT);
      const email = emailAddress(body.email);
      const password = passwordValue(body.password);
      const name = text(body.name, 'Name');
      if (typeof body.token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(body.token)) fail(400, 'This invitation is invalid or expired.');
      const tokenHash = digest(body.token);
      const validInvite = () => {
        const invite = sql.invite.get(tokenHash);
        if (!invite || invite.email !== email || invite.expires_at <= Date.now() || sql.byEmail.get(email)) fail(400, 'This invitation is invalid, expired, or already used.');
        return invite;
      };
      validInvite();
      const hash = await passwordHash(password);
      let user;
      const token = transaction(() => {
        const invite = validInvite();
        user = { id: randomUUID(), email, name, role: invite.role };
        sql.insertUser.run(user.id, email, name, user.role, hash);
        sql.deleteInvite.run(tokenHash);
        return issueSession(req, user.id);
      });
      cookie(res, token, secureCookies);
      return json(res, 201, { user, workspaceName: sql.workspace.get().name });
    }
    if (path === '/api/invites') {
      authorize(req, ['owner']);
      const body = await readJson(req, AUTH_BODY_LIMIT);
      const email = emailAddress(body.email);
      if (!['editor', 'viewer'].includes(body.role)) fail(400, 'Invitations must grant the editor or viewer role.');
      const token = randomBytes(32).toString('base64url');
      const expiresAt = Date.now() + INVITE_TTL;
      transaction(() => {
        authorize(req, ['owner']);
        if (sql.byEmail.get(email)) fail(409, 'This email is already a workspace member.');
        sql.cleanInvites.run(Date.now());
        sql.deleteEmailInvites.run(email);
        sql.insertInvite.run(digest(token), email, body.role, expiresAt);
      });
      return json(res, 201, { token, expiresAt });
    }
    if (path === '/api/members') { authorize(req, ['owner']); return json(res, 200, { members: sql.members.all() }); }
    if (memberMatch) {
      let id;
      try { id = decodeURIComponent(memberMatch[1]); } catch { fail(400, 'Invalid member ID.'); }
      transaction(() => {
        const actor = authorize(req, ['owner']);
        const member = sql.byId.get(id);
        if (!member) fail(404, 'Workspace member not found.');
        if (member.id === actor.id || member.role === 'owner') fail(403, 'The workspace owner cannot be removed.');
        sql.deleteEmailInvites.run(member.email);
        sql.deleteUser.run(id);
      });
      req.resume();
      return json(res, 200, { ok: true });
    }
    if (path === '/api/workspace' && req.method === 'GET') { authorize(req); return json(res, 200, workspace()); }
    if (path === '/api/workspace') {
      authorize(req, ['owner', 'editor']);
      const body = await readJson(req, WORKSPACE_BODY_LIMIT);
      const snapshot = snapshotBody(body);
      const result = transaction(() => {
        authorize(req, ['owner', 'editor']);
        const current = workspace();
        if (body.revision !== current.revision) fail(409, 'This workspace changed. Merge the latest snapshot before saving.', { workspace: current });
        if (current.revision >= Number.MAX_SAFE_INTEGER) fail(409, 'This workspace has reached its revision limit.', { workspace: current });
        const nextIds = new Set(snapshot.notes.map(note => note.id));
        if (current.notes.some(note => !nextIds.has(note.id))) fail(400, 'Retain existing notes and mark deleted notes with a tombstone.');
        sql.saveWorkspace.run(JSON.stringify(snapshot), body.revision);
        return { revision: current.revision + 1, ...snapshot };
      });
      return json(res, 200, result);
    }
  }
  const server = createServer({ maxHeaderSize: 16 * 1024, requestTimeout: 30_000, headersTimeout: 15_000, keepAliveTimeout: 5000 }, (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    res.setHeader('Content-Security-Policy', CSP);
    if (secureCookies) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    const handle = async () => {
      const path = new URL(req.url, 'http://herd.local').pathname;
      if (path === '/api' || path.startsWith('/api/')) return handleApi(req, res, path);
      if (!['GET', 'HEAD'].includes(req.method)) { res.setHeader('Allow', 'GET, HEAD'); fail(405, 'Method not allowed.'); }
      return serveStatic(req, res, staticRoot, dataRoot);
    };
    handle().catch(error => {
      if (res.destroyed || res.writableEnded) return;
      if (res.headersSent) { res.destroy(); return; }
      const busy = [5, 6].includes(error.errcode);
      const status = error.status || (busy ? 503 : 500);
      if (status === 500) console.error('NitroBison request failed:', error);
      res.setHeader('Cache-Control', 'no-store');
      if ([400, 413, 415].includes(status)) { res.setHeader('Connection', 'close'); req.resume(); }
      json(res, status, { error: error.status ? error.message : busy ? 'Storage is busy. Try again.' : 'The server could not complete this request.', ...(error.details || {}) });
    });
  });
  server.maxRequestsPerSocket = 100;
  return { server, close() { if (!closed) { closed = true; db.close(); } } };
}
