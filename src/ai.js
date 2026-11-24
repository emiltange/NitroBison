const MAX_RESPONSE_BYTES = 1024 * 1024;
const MAX_MARKDOWN_LENGTH = 262144;
const REQUEST_TIMEOUT_MS = 120000;
const INVALID_CONTROLS = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/;

export function findAICommand(content, cursor) {
  if (typeof content !== 'string' || !Number.isInteger(cursor) || cursor < 0 || cursor > content.length) return null;
  let fence = null;
  let start = 0;
  while (start <= cursor) {
    const newline = content.indexOf('\n', start);
    const next = newline < 0 ? content.length : newline;
    const end = next > start && content[next - 1] === '\r' ? next - 1 : next;
    const line = content.slice(start, end);
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      if (marker && marker[1][0] === fence.character && marker[1].length >= fence.length && /^[ \t]*$/.test(marker[2])) fence = null;
    } else if (marker && (marker[1][0] !== '`' || !marker[2].includes('`'))) {
      fence = { character: marker[1][0], length: marker[1].length };
    } else if (cursor >= start && cursor <= end) {
      const command = /^ {0,3}\/AI(?:[ \t]+(.*))?$/i.exec(line);
      return command ? { start, end, prompt: (command[1] || '').trim() } : null;
    }
    if (cursor <= next || newline < 0) return null;
    start = newline + 1;
  }
  return null;
}

function plainValues(input, allowed, message) {
  try {
    if (!input || typeof input !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) throw new Error();
    const descriptors = Object.getOwnPropertyDescriptors(input);
    if (Reflect.ownKeys(descriptors).some(key => !allowed.includes(key) || !Object.hasOwn(descriptors[key], 'value'))) throw new Error();
    return Object.fromEntries(Object.entries(descriptors).map(([key, descriptor]) => [key, descriptor.value]));
  } catch {
    throw new Error(message);
  }
}

export function validateAIConfig(input) {
  const { endpoint, model, apiKey = '' } = plainValues(input, ['endpoint', 'model', 'apiKey'], 'AI configuration must contain only an endpoint, model and optional API key.');
  if (typeof endpoint !== 'string' || !endpoint || endpoint.length > 4096 || /[\s\\\x00-\x1f\x7f-\x9f]/.test(endpoint)) {
    throw new Error('Use a full AI chat-completions URL of at most 4096 characters.');
  }
  if (typeof model !== 'string' || !model.trim() || model !== model.trim() || model.length > 256 || /[\x00-\x1f\x7f-\x9f]/.test(model)) {
    throw new Error('Use an AI model name of 1–256 characters without control characters.');
  }
  if (typeof apiKey !== 'string' || apiKey.length > 8192 || /[^\x21-\x7e]/.test(apiKey)) {
    throw new Error('Use an API key of at most 8192 visible ASCII characters without spaces.');
  }
  let url;
  try {
    url = new URL(endpoint);
  } catch {
    throw new Error('Use a valid full AI chat-completions URL.');
  }
  const authority = /^https?:\/\/([^/?#]+)/i.exec(endpoint)?.[1];
  if (!authority || url.username || url.password || authority.includes('@') || endpoint.includes('#') ||
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(authority)))) {
    throw new Error('AI endpoints require HTTPS, or HTTP on localhost, 127.0.0.1 or [::1], without URL credentials or fragments.');
  }
  for (const [name, value] of url.searchParams) {
    const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (/^(?:auth|authorization|bearer|sig|sas|code)$|(?:key|token|secret|password|credential|signature)$/.test(normalized) ||
        /\bbearer\s+|\bsk-[a-z0-9_-]+/i.test(value) || (apiKey && value.includes(apiKey))) {
      throw new Error('Keep AI credentials out of endpoint query parameters; use the session-only API key field.');
    }
  }
  return { endpoint: url.href, model, apiKey };
}

export function isAIConfigured(input) {
  try {
    const config = validateAIConfig({ endpoint: input?.endpoint, model: input?.model, apiKey: input?.apiKey ?? '' });
    const url = new URL(config.endpoint);
    const loopback = /^(?:localhost|127\.0\.0\.1|\[::1\])$/i.test(url.hostname);
    return loopback || Boolean(config.apiKey);
  } catch {
    return false;
  }
}

function validateMessages(messages) {
  if (!Array.isArray(messages) || !messages.length || messages.length > 64) {
    throw new Error('AI chat requires 1–64 messages.');
  }
  let totalChars = 0;
  const checked = messages.map(entry => {
    const { role, content } = plainValues(entry, ['role', 'content'], 'Each AI message must contain only role and content.');
    if (!['system', 'user', 'assistant'].includes(role)) {
      throw new Error('Each AI message role must be system, user, or assistant.');
    }
    if (typeof content !== 'string' || !content.trim() || content.length > 65536 || INVALID_CONTROLS.test(content)) {
      throw new Error('Use AI messages of 1–65536 characters without unsupported control characters.');
    }
    totalChars += content.length;
    return { role, content };
  });
  if (totalChars > 180000) throw new Error('AI chat history exceeds the 180,000-character request limit.');
  return checked;
}

export function formatChatContext({ workspaceName = 'Personal workspace', viewLabel = 'Workspace', folder = null, activeNote = null, notes = [] } = {}) {
  const lines = [
    'You are NitroBison AI, a calm, concise assistant inside the user’s offline-first Markdown workspace.',
    'Answer in clear Markdown. Reference relevant workspace notes by title when helpful, and never invent notes that are not in the workspace context below.',
    `Workspace: ${String(workspaceName || 'Personal workspace').slice(0, 120)}`,
    `Current screen: ${String(viewLabel || 'Workspace').slice(0, 80)}${folder !== null && folder !== undefined ? ` · Folder: ${folder || 'Private pages'}` : ''}`,
  ];
  if (activeNote && typeof activeNote.title === 'string') {
    const snippet = String(activeNote.content || '').slice(0, 12000);
    lines.push(
      `Active page: "${activeNote.title.slice(0, 160)}" (${activeNote.folder || 'Private pages'})`,
      `Active page Markdown:\n\`\`\`markdown\n${snippet}\n\`\`\``
    );
  }
  if (Array.isArray(notes) && notes.length) {
    const recent = [...notes]
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      .slice(0, 24)
      .map(note => {
        const preview = String(note.content || '').replace(/\s+/g, ' ').trim().slice(0, 220);
        return `- ${String(note.title || 'Untitled').slice(0, 120)} [${note.folder || 'Private pages'}]${preview ? `: ${preview}` : ''}`;
      });
    lines.push(`Workspace pages (${notes.length} total, showing up to 24 recent):\n${recent.join('\n')}`);
  }
  return lines.join('\n\n');
}

function validateMarkdown(content) {
  if (typeof content !== 'string' || !content.trim() || content.length > MAX_MARKDOWN_LENGTH || INVALID_CONTROLS.test(content)) {
    throw new Error('AI response must contain nonempty Markdown no larger than 262144 characters.');
  }
  return content;
}

function networkError() {
  return new Error('AI endpoint could not be reached. Browser endpoints must allow CORS; check the endpoint or use the desktop app.');
}

function abortError() {
  const error = new Error('AI request cancelled.');
  error.name = 'AbortError';
  return error;
}

const STATUS_HINTS = {
  400: 'Bad request — check model name or request format',
  401: 'Unauthorized — invalid or expired API key',
  403: 'Forbidden — API key lacks access or workspace header',
  404: 'Not found — check the endpoint URL and model ID',
  422: 'Unprocessable request — check model parameters',
  429: 'Rate limit or insufficient API quota/credits',
  500: 'Provider server error',
  502: 'Bad gateway at provider',
  503: 'Provider temporarily overloaded',
  529: 'Provider overloaded',
};
const TRANSIENT_OVERLOAD_STATUSES = new Set([503, 529]);
const RETRY_DELAYS_MS = [550, 1200];

function waitWithSignal(delayMs, signal) {
  if (signal?.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, delayMs);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function overloadActionGuidance(config) {
  const endpoint = config.endpoint.toLowerCase();
  if (endpoint.includes('generativelanguage.googleapis.com') || /^gemini-/i.test(config.model)) {
    return config.model.toLowerCase() === 'gemini-3.5-flash-lite'
      ? 'Wait a moment and retry, or switch models in Settings → AI.'
      : 'Wait a moment and retry, or switch to high-availability model gemini-3.5-flash-lite in Settings → AI.';
  }
  return 'Wait a moment and retry, or switch to a lighter Flash/Haiku model in Settings → AI.';
}

function redactSecrets(text, apiKey = '') {
  let clean = String(text || '');
  if (apiKey) clean = clean.split(apiKey).join('[redacted]');
  return clean
    .replace(/\bBearer\s+[^\s"',;)]+/gi, 'Bearer [redacted]')
    .replace(/\b(?:sk-[A-Za-z0-9_-]{6,}|AIza[0-9A-Za-z_-]{16,}|gh[pousr]_[A-Za-z0-9_]{12,})\b/g, '[redacted]')
    .replace(/[\x00-\x1f\x7f-\x9f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function readErrorDetail(response, apiKey) {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let bytes = 0;
  let raw = '';
  try {
    while (bytes < 4096) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      raw += decoder.decode(chunk.value, { stream: true });
    }
    raw += decoder.decode();
    const parsed = JSON.parse(raw);
    const candidate = typeof parsed?.error === 'string'
      ? parsed.error
      : typeof parsed?.error?.message === 'string'
        ? parsed.error.message
        : typeof parsed?.message === 'string'
          ? parsed.message
          : '';
    if (!candidate || /SECRET/i.test(candidate)) return '';
    return redactSecrets(candidate, apiKey).slice(0, 180);
  } catch {
    return '';
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

function sanitizeDesktopBridgeError(error, apiKey) {
  const raw = typeof error?.message === 'string' ? error.message : '';
  const unwrapped = raw.replace(/^Error invoking remote method '[^']+':\s*(?:[A-Za-z]*Error:\s*)?/, '').trim();
  if (/^(?:AI (?:provider|endpoint|response|request|configuration|chat|desktop)|An AI request|Use (?:a |an |AI )|Keep AI|Each AI|Invalid AI|Native access)/.test(unwrapped)) {
    if (/AI request cancelled\./.test(unwrapped)) return abortError();
    return new Error(redactSecrets(unwrapped, apiKey));
  }
  return new Error('AI desktop request failed. Check your network connection, endpoint URL, model and API key.');
}

async function readResponse(response) {
  const declaredLength = response.headers.get('content-length');
  if (declaredLength && /^\d+$/.test(declaredLength) && Number(declaredLength) > MAX_RESPONSE_BYTES) {
    await response.body?.cancel().catch(() => {});
    throw new Error('AI response exceeds the 1 MiB size limit.');
  }
  if (!response.body) throw new Error('AI response is missing its JSON body.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let bytes = 0;
  let text = '';
  try {
    while (true) {
      let chunk;
      try {
        chunk = await reader.read();
      } catch {
        throw networkError();
      }
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) {
        await reader.cancel().catch(() => {});
        throw new Error('AI response exceeds the 1 MiB size limit.');
      }
      try {
        text += decoder.decode(chunk.value, { stream: true });
      } catch {
        throw new Error('AI response is not valid UTF-8 JSON.');
      }
    }
    let data;
    try {
      text += decoder.decode();
      data = JSON.parse(text);
    } catch {
      throw new Error('AI response is not valid JSON.');
    }
    if (!data || typeof data !== 'object' || Object.hasOwn(data, 'error') || !Array.isArray(data.choices)) {
      throw new Error('AI provider returned an invalid or error response.');
    }
    return validateMarkdown(data.choices[0]?.message?.content);
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

async function requestMessagesAI(config, messages, signal, fetchImpl = fetch) {
  const headers = { 'Content-Type': 'application/json' };
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;
  const body = JSON.stringify({ model: config.model, messages, stream: false });
  for (let attempt = 0; ; attempt++) {
    let response;
    try {
      response = await fetchImpl(config.endpoint, {
        method: 'POST', headers, body,
        signal, redirect: 'manual', credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store',
      });
    } catch {
      throw networkError();
    }
    if (response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400)) {
      await response.body?.cancel().catch(() => {});
      throw new Error('AI endpoint redirects are not allowed. Use the final chat-completions URL.');
    }
    if (!response.ok) {
      if (TRANSIENT_OVERLOAD_STATUSES.has(response.status) && attempt < RETRY_DELAYS_MS.length) {
        await response.body?.cancel().catch(() => {});
        await waitWithSignal(RETRY_DELAYS_MS[attempt], signal);
        continue;
      }
      const detail = await readErrorDetail(response, config.apiKey);
      const hint = STATUS_HINTS[response.status];
      const statusSummary = hint ? `HTTP ${response.status} (${hint})` : `HTTP ${response.status}`;
      const guidance = TRANSIENT_OVERLOAD_STATUSES.has(response.status)
        ? overloadActionGuidance(config)
        : 'Check the endpoint, model and API key.';
      throw new Error(`AI provider returned ${statusSummary}${detail ? `: ${detail}` : '.'}${detail && !/[.!?]$/.test(detail) ? '.' : ''} ${guidance}`);
    }
    return readResponse(response);
  }
}

async function runAIRequest(input, payload, options = {}) {
  const config = validateAIConfig(input);
  const { signal, fetch: customFetch } = plainValues(options, ['signal', 'fetch'], 'AI request options may contain only an AbortSignal and optional fetch.');
  if (signal !== undefined && !(signal instanceof AbortSignal)) throw new Error('AI cancellation requires an AbortSignal.');
  if (customFetch !== undefined && typeof customFetch !== 'function') throw new Error('AI custom fetch must be a function.');
  if (signal?.aborted) throw abortError();
  const bridge = globalThis.window?.nitrobisonDesktop;
  const native = bridge?.isDesktop;
  if (native && (typeof bridge.generateAI !== 'function' || typeof bridge.cancelAI !== 'function')) {
    throw new Error('AI desktop bridge is unavailable. Restart or update the desktop app.');
  }
  const controller = new AbortController();
  let timedOut = false;
  let nativeStarted = false;
  const forwardAbort = () => controller.abort();
  const timeoutSeconds = Math.round(REQUEST_TIMEOUT_MS / 1000);
  const cancelledError = () => timedOut ? new Error(`AI request timed out after ${timeoutSeconds} seconds.`) : abortError();
  let rejectAbort;
  const cancelled = new Promise((_resolve, reject) => { rejectAbort = reject; });
  const onAbort = () => {
    if (nativeStarted) {
      try {
        Promise.resolve(bridge.cancelAI()).catch(() => {});
      } catch {}
    }
    rejectAbort(cancelledError());
  };
  controller.signal.addEventListener('abort', onAbort, { once: true });
  signal?.addEventListener('abort', forwardAbort, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, REQUEST_TIMEOUT_MS);
  try {
    const operation = async () => {
      if (!native) return requestMessagesAI(config, payload.messages, controller.signal, customFetch || fetch);
      nativeStarted = true;
      let markdown;
      try {
        markdown = await bridge.generateAI(payload.nativePayload(config));
      } catch (bridgeError) {
        throw sanitizeDesktopBridgeError(bridgeError, config.apiKey);
      }
      return validateMarkdown(markdown);
    };
    return await Promise.race([operation(), cancelled]);
  } catch (error) {
    if (controller.signal.aborted) throw cancelledError();
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', forwardAbort);
    controller.signal.removeEventListener('abort', onAbort);
  }
}

export async function generateAI(input, prompt, options = {}) {
  const config = validateAIConfig(input);
  if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 65536 || INVALID_CONTROLS.test(prompt)) {
    throw new Error('Use an AI prompt of 1–65536 characters without unsupported control characters.');
  }
  return runAIRequest(config, {
    messages: [{ role: 'user', content: prompt }],
    nativePayload: checked => ({ config: checked, prompt }),
  }, options);
}

export async function chatAI(input, messages, options = {}) {
  const config = validateAIConfig(input);
  const checkedMessages = validateMessages(messages);
  return runAIRequest(config, {
    messages: checkedMessages,
    nativePayload: checked => ({ config: checked, messages: checkedMessages }),
  }, options);
}

const CONNECTION_TEST_PROMPT = 'Reply with OK.';

export async function testAIConnection(input, options = {}) {
  const config = validateAIConfig(input);
  if (!isAIConfigured(config)) {
    throw new Error('Enter an API key for this provider before testing (or use a localhost endpoint).');
  }
  const started = Date.now();
  const raw = await generateAI(config, CONNECTION_TEST_PROMPT, options);
  const latencyMs = Math.max(0, Date.now() - started);
  const reply = raw.replace(/\s+/g, ' ').trim().slice(0, 140);
  return { model: config.model, reply, latencyMs };
}
