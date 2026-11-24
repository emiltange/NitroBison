const STORAGE_PREFIX = 'nitrobison-ai-history:';
const MAX_THREADS_PER_CHANNEL = 40;
const MAX_MESSAGES_PER_THREAD = 64;
const CHANNELS = new Set(['page', 'pill']);

function assertChannel(channel) {
  if (!CHANNELS.has(channel)) throw new Error(`Invalid AI chat history channel: ${channel}`);
}

function summarizeTitle(text) {
  const clean = String(text || '')
    .replace(/^#+\s*/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return 'Untitled chat';
  return clean.length > 60 ? `${clean.slice(0, 59).trimEnd()}…` : clean;
}

function sanitizeMessage(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const role = entry.role === 'assistant' ? 'assistant' : entry.role === 'user' ? 'user' : null;
  const content = typeof entry.content === 'string' ? entry.content.slice(0, 65536) : '';
  if (!role || !content.trim()) return null;
  return {
    role,
    content,
    createdAt: Number.isFinite(entry.createdAt) ? entry.createdAt : Date.now(),
  };
}

function sanitizeThread(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !raw.id.trim()) return null;
  const messages = Array.isArray(raw.messages)
    ? raw.messages.map(sanitizeMessage).filter(Boolean).slice(-MAX_MESSAGES_PER_THREAD)
    : [];
  if (!messages.length) return null;
  return {
    id: raw.id.slice(0, 80),
    title: typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim().slice(0, 80) : summarizeTitle(messages[0].content),
    contextLabel: typeof raw.contextLabel === 'string' ? raw.contextLabel.trim().slice(0, 120) : '',
    scope: ['workspace', 'page', 'general'].includes(raw.scope) ? raw.scope : 'workspace',
    updatedAt: Number.isFinite(raw.updatedAt) ? raw.updatedAt : messages.at(-1).createdAt,
    messages,
  };
}

function emptyState() {
  return {
    page: { activeId: null, threads: [] },
    pill: { activeId: null, threads: [] },
  };
}

export function createChatHistoryStore({
  storage = globalThis.localStorage,
  workspaceId = 'default',
} = {}) {
  let currentWorkspace = String(workspaceId || 'default');
  let state = emptyState();

  function keyFor(id) {
    return `${STORAGE_PREFIX}${id}`;
  }

  function load(id = currentWorkspace) {
    currentWorkspace = String(id || 'default');
    try {
      const raw = storage?.getItem?.(keyFor(currentWorkspace));
      if (!raw) {
        state = emptyState();
        return;
      }
      const parsed = JSON.parse(raw);
      const next = emptyState();
      for (const channel of ['page', 'pill']) {
        const threads = Array.isArray(parsed?.[channel]?.threads)
          ? parsed[channel].threads.map(sanitizeThread).filter(Boolean)
          : [];
        threads.sort((a, b) => b.updatedAt - a.updatedAt);
        next[channel].threads = threads.slice(0, MAX_THREADS_PER_CHANNEL);
        const requestedActive = parsed?.[channel]?.activeId;
        next[channel].activeId = requestedActive === null
          ? null
          : next[channel].threads.some(item => item.id === requestedActive)
            ? requestedActive
            : (next[channel].threads[0]?.id ?? null);
      }
      state = next;
    } catch {
      state = emptyState();
    }
  }

  function persist() {
    try {
      storage?.setItem?.(keyFor(currentWorkspace), JSON.stringify(state));
    } catch {
      // Storage quota or private mode: keep in-memory state working without crashing chat.
    }
  }

  load(currentWorkspace);

  return {
    setWorkspace(nextWorkspaceId) {
      const normalized = String(nextWorkspaceId || 'default');
      if (normalized === currentWorkspace) return;
      load(normalized);
    },

    listThreads(channel) {
      assertChannel(channel);
      return state[channel].threads.map(thread => ({
        ...thread,
        messages: thread.messages.map(msg => ({ ...msg })),
      }));
    },

    getActiveThread(channel) {
      assertChannel(channel);
      const activeId = state[channel].activeId;
      if (!activeId) return null;
      const found = state[channel].threads.find(item => item.id === activeId);
      return found ? { ...found, messages: found.messages.map(msg => ({ ...msg })) } : null;
    },

    startNewThread(channel) {
      assertChannel(channel);
      state[channel].activeId = null;
      persist();
    },

    selectThread(channel, threadId) {
      assertChannel(channel);
      if (threadId === null) {
        state[channel].activeId = null;
        persist();
        return null;
      }
      const found = state[channel].threads.find(item => item.id === threadId);
      if (!found) return null;
      state[channel].activeId = found.id;
      persist();
      return { ...found, messages: found.messages.map(msg => ({ ...msg })) };
    },

    appendTurn(channel, threadId, { role, content, contextLabel = '', scope = 'workspace' }) {
      assertChannel(channel);
      const msg = sanitizeMessage({ role, content, createdAt: Date.now() });
      if (!msg) throw new Error('Cannot record an empty AI chat turn.');
      const bucket = state[channel];
      const targetId = threadId || bucket.activeId;
      let thread = targetId ? bucket.threads.find(item => item.id === targetId) : null;
      if (!thread) {
        thread = {
          id: globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          title: summarizeTitle(msg.content),
          contextLabel: String(contextLabel || '').trim().slice(0, 120),
          scope: ['workspace', 'page', 'general'].includes(scope) ? scope : 'workspace',
          updatedAt: msg.createdAt,
          messages: [msg],
        };
        bucket.threads.unshift(thread);
      } else {
        thread.messages = [...thread.messages, msg].slice(-MAX_MESSAGES_PER_THREAD);
        thread.updatedAt = msg.createdAt;
        if (contextLabel) thread.contextLabel = String(contextLabel).trim().slice(0, 120);
        if (['workspace', 'page', 'general'].includes(scope)) thread.scope = scope;
        bucket.threads = [thread, ...bucket.threads.filter(item => item.id !== thread.id)];
      }
      bucket.threads = bucket.threads.slice(0, MAX_THREADS_PER_CHANNEL);
      bucket.activeId = thread.id;
      persist();
      return { ...thread, messages: thread.messages.map(item => ({ ...item })) };
    },

    deleteThread(channel, threadId) {
      assertChannel(channel);
      const bucket = state[channel];
      bucket.threads = bucket.threads.filter(item => item.id !== threadId);
      if (bucket.activeId === threadId) {
        bucket.activeId = bucket.threads[0]?.id ?? null;
      }
      persist();
    },
  };
}
