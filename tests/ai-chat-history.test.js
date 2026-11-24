import test from 'node:test';
import assert from 'node:assert/strict';
import { createChatHistoryStore } from '../src/ai-chat-history.js';
import { createAIChatController } from '../src/ai-chat.js';
function memoryStorage() {
  const map = new Map();
  return {
    getItem: key => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: key => map.delete(key),
    raw: map,
  };
}

test('ChatGPT-style page history and Pill Drop history stay strictly separated and persist across reloads', () => {
  const storage = memoryStorage();
  const store = createChatHistoryStore({ storage, workspaceId: 'ws-alpha' });

  const pageThread = store.appendTurn('page', null, { role: 'user', content: 'Draft Q4 OKRs for NitroBison' });
  store.appendTurn('page', pageThread.id, { role: 'assistant', content: '# Q4 OKRs\n- Ship dual history' });

  const pillThread = store.appendTurn('pill', null, { role: 'user', content: 'Summarize Welcome to NitroBison', contextLabel: 'Welcome to NitroBison' });
  store.appendTurn('pill', pillThread.id, { role: 'assistant', content: 'It introduces notes, links and local storage.' });

  assert.equal(store.listThreads('page').length, 1);
  assert.equal(store.listThreads('pill').length, 1);
  assert.equal(store.listThreads('page')[0].title, 'Draft Q4 OKRs for NitroBison');
  assert.equal(store.listThreads('pill')[0].title, 'Summarize Welcome to NitroBison');
  assert.equal(store.listThreads('pill')[0].contextLabel, 'Welcome to NitroBison');
  assert.notEqual(store.getActiveThread('page')?.id, store.getActiveThread('pill')?.id);

  // Reload from same storage: both channels retain their own conversations independently
  const reloaded = createChatHistoryStore({ storage, workspaceId: 'ws-alpha' });
  assert.equal(reloaded.getActiveThread('page')?.messages.length, 2);
  assert.equal(reloaded.getActiveThread('page')?.messages[1].content, '# Q4 OKRs\n- Ship dual history');
  assert.equal(reloaded.getActiveThread('pill')?.messages.length, 2);
  assert.equal(reloaded.getActiveThread('pill')?.messages[0].content, 'Summarize Welcome to NitroBison');
});

test('each channel supports multiple talks, switching active talk, starting a fresh talk, and deleting talks without affecting the other channel', () => {
  const storage = memoryStorage();
  const store = createChatHistoryStore({ storage, workspaceId: 'ws-alpha' });

  const talk1 = store.appendTurn('page', null, { role: 'user', content: 'First full chat topic' });
  store.appendTurn('page', talk1.id, { role: 'assistant', content: 'Reply 1' });

  // Start a new blank talk in page channel
  store.startNewThread('page');
  assert.equal(store.getActiveThread('page'), null);

  const talk2 = store.appendTurn('page', null, { role: 'user', content: 'Second full chat topic' });
  store.appendTurn('page', talk2.id, { role: 'assistant', content: 'Reply 2' });

  // Meanwhile add two pill talks
  const pill1 = store.appendTurn('pill', null, { role: 'user', content: 'Quick pill question 1' });
  store.startNewThread('pill');
  const pill2 = store.appendTurn('pill', null, { role: 'user', content: 'Quick pill question 2' });

  assert.equal(store.listThreads('page').length, 2);
  assert.equal(store.listThreads('pill').length, 2);
  assert.equal(store.getActiveThread('page')?.id, talk2.id);
  assert.equal(store.getActiveThread('pill')?.id, pill2.id);

  // Switch page back to talk1
  store.selectThread('page', talk1.id);
  assert.equal(store.getActiveThread('page')?.id, talk1.id);
  assert.equal(store.getActiveThread('pill')?.id, pill2.id);

  // Delete talk1 in page -> falls back to talk2, pill untouched
  store.deleteThread('page', talk1.id);
  assert.deepEqual(store.listThreads('page').map(item => item.id), [talk2.id]);
  assert.equal(store.getActiveThread('page')?.id, talk2.id);
  assert.equal(store.listThreads('pill').length, 2);
  assert.equal(store.listThreads('pill').some(item => item.id === pill1.id), true);
});

test('workspace scoping isolates talks per workspace and corrupt storage recovers cleanly', () => {
  const storage = memoryStorage();
  storage.setItem('nitrobison-ai-history:ws-broken', '{not-json');
  const broken = createChatHistoryStore({ storage, workspaceId: 'ws-broken' });
  assert.deepEqual(broken.listThreads('page'), []);
  assert.deepEqual(broken.listThreads('pill'), []);

  const wsA = createChatHistoryStore({ storage, workspaceId: 'ws-a' });
  wsA.appendTurn('pill', null, { role: 'user', content: 'Alpha pill talk' });

  const wsB = createChatHistoryStore({ storage, workspaceId: 'ws-b' });
  assert.deepEqual(wsB.listThreads('pill'), []);
  assert.equal(wsA.listThreads('pill').length, 1);
});

test('Full AI Chat sidebar lists both Full AI chats and Page (Ask AI) talks and switches cleanly between them', () => {
  const storage = memoryStorage();
  const store = createChatHistoryStore({ storage, workspaceId: 'ws-unified' });
  const fullTalk = store.appendTurn('page', null, { role: 'user', content: 'Full chat architecture roadmap' });
  store.appendTurn('page', fullTalk.id, { role: 'assistant', content: 'Roadmap outline.' });
  const pageTalk = store.appendTurn('pill', null, { role: 'user', content: 'Summarize Welcome page', contextLabel: 'Welcome to NitroBison' });
  store.appendTurn('pill', pageTalk.id, { role: 'assistant', content: 'Welcome summary.' });

  let renderedHtml = '';
  const fakeHost = {
    set innerHTML(val) { renderedHtml = val; },
    get innerHTML() { return renderedHtml; },
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  const controller = createAIChatController({
    storage,
    getSettings: () => ({ endpoint: 'http://127.0.0.1:11434/v1/chat/completions', model: 'llama3.2', apiKey: '' }),
    getVisibleNotes: () => [],
    getContext: () => ({ workspaceId: 'ws-unified', workspaceName: 'Unified Vault', viewLabel: 'NitroBison AI', activeNote: null, notes: [] }),
    icon: name => `[${name}]`,
  });

  controller.renderPage(fakeHost);
  assert.match(renderedHtml, /Chats \(2\)/);
  assert.match(renderedHtml, /Full AI chats \(1\)/);
  assert.match(renderedHtml, /Page talks · Ask AI \(1\)/);
  assert.match(renderedHtml, /Full chat architecture roadmap/);
  assert.match(renderedHtml, /Summarize Welcome page/);
  assert.match(renderedHtml, /Welcome to NitroBison/);
});

test('Ask AI support widget persists expanded reading view preference in storage', () => {
  const storage = memoryStorage();
  storage.setItem('nitrobison-ai-support-size', 'expanded');
  let panelNode = null;
  const fakeRoot = {
    className: '',
    hidden: false,
    classList: {
      contains: () => false,
      toggle: () => {},
    },
    setAttribute: () => {},
    set innerHTML(val) { this._html = val; },
    get innerHTML() { return this._html || ''; },
    querySelector: sel => {
      if (sel === '[data-support-open]') return { addEventListener: (_ev, fn) => { fakeRoot._openFn = fn; } };
      if (sel === '.ai-support-panel') return panelNode;
      return null;
    },
    querySelectorAll: () => [],
    replaceChildren: node => { panelNode = node; },
  };
  const fakeContainer = { append: () => {} };
  const prevDoc = globalThis.document;
  globalThis.document = {
    createElement: () => ({
      className: '',
      style: { setProperty: () => {}, removeProperty: () => {} },
      classList: {
        toggle(cls, force) {
          const parts = new Set(this._owner.className.split(/\s+/).filter(Boolean));
          if (force) parts.add(cls); else parts.delete(cls);
          this._owner.className = [...parts].join(' ');
        },
        add(cls) { this.toggle(cls, true); },
        remove(cls) { this.toggle(cls, false); },
      },
      setAttribute: () => {},
      addEventListener: () => {},
      set innerHTML(val) { this._html = val; },
      get innerHTML() { return this._html || ''; },
    }),
  };
  try {
    const origCreate = globalThis.document.createElement;
    globalThis.document.createElement = tag => {
      if (tag === 'aside') return fakeRoot;
      const el = origCreate(tag);
      el.classList._owner = el;
      return el;
    };
    const controller = createAIChatController({
      storage,
      getSettings: () => ({ endpoint: 'http://127.0.0.1:11434/v1/chat/completions', model: 'llama3.2', apiKey: '' }),
      getVisibleNotes: () => [],
      getContext: () => ({ view: 'note', workspaceId: 'ws-size', workspaceName: 'Vault', viewLabel: 'Notes', activeNote: { title: 'AI assistant', content: '# AI' }, notes: [] }),
      icon: name => `[${name}]`,
    });
    controller.mountSupportWidget(fakeContainer);
    fakeRoot._openFn();
    assert.match(panelNode.className, /\bis-expanded\b/);
    assert.match(panelNode.innerHTML, /Reading view/);
    assert.match(panelNode.innerHTML, /Compact/);
    assert.match(panelNode.innerHTML, /<textarea id="ai-support-input"/);
  } finally {
    globalThis.document = prevDoc;
  }
});
