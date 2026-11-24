import { escapeHtml } from './markdown-model.js';
import { renderMarkdown } from './markdown.js';
import { chatAI, formatChatContext, isAIConfigured } from './ai.js';
import { createChatHistoryStore } from './ai-chat-history.js';

const html = escapeHtml;

export const AI_PROVIDER_CATALOG = [
  {
    id: 'openai',
    label: 'ChatGPT (OpenAI)',
    shortLabel: 'OpenAI',
    setupUrl: 'https://platform.openai.com/api-keys',
    setupLinkText: 'Get OpenAI API key ↗',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-6.1-sol',
    summary: 'Connect your OpenAI Platform API key to chat with GPT models.',
  },
  {
    id: 'claude',
    label: 'Claude (Anthropic)',
    shortLabel: 'Claude',
    setupUrl: 'https://platform.claude.com/settings/keys',
    setupLinkText: 'Get Claude API key ↗',
    endpoint: 'https://api.anthropic.com/v1/chat/completions',
    model: 'claude-haiku-5-5',
    summary: 'Connect an Anthropic workspace API key for Claude models.',
  },
  {
    id: 'gemini',
    label: 'Gemini (Google)',
    shortLabel: 'Gemini',
    setupUrl: 'https://aistudio.google.com/apikey',
    setupLinkText: 'Get Gemini API key ↗',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    model: 'gemini-3.5-flash-lite',
    summary: 'Generate a free or billed Google AI Studio API key (high-availability Flash Lite default).',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    shortLabel: 'DeepSeek',
    setupUrl: 'https://platform.deepseek.com/api_keys',
    setupLinkText: 'Get DeepSeek API key ↗',
    endpoint: 'https://api.deepseek.com/chat/completions',
    model: 'deepseek-flash',
    summary: 'Connect your DeepSeek API key with standard Bearer auth.',
  },
  {
    id: 'copilot',
    label: 'GitHub / Foundry',
    shortLabel: 'Foundry',
    setupUrl: 'https://learn.microsoft.com/en-us/azure/foundry/foundry-models/how-to/quickstart-github-models',
    setupLinkText: 'Microsoft Foundry setup guide ↗',
    endpoint: 'https://YOUR-RESOURCE.services.ai.azure.com/models/chat/completions?api-version=2024-05-01-preview',
    model: 'gpt-6.1-sol',
    summary: 'Deploy GitHub or Azure Foundry models with your endpoint & key.',
  },
  {
    id: 'local',
    label: 'Local AI (Ollama / LM Studio)',
    shortLabel: 'Local AI',
    setupUrl: 'https://ollama.com/download',
    setupLinkText: 'Download Ollama (offline) ↗',
    endpoint: 'http://127.0.0.1:11434/v1/chat/completions',
    model: 'qwen3:8b',
    summary: 'Run 100% locally on your machine with no API key required.',
  },
];

export function detectProviderLabel(aiSettings) {
  if (!isAIConfigured(aiSettings)) return 'Connect AI';
  const endpoint = (aiSettings?.endpoint || '').toLowerCase();
  if (endpoint.includes('openai.com')) return `OpenAI · ${aiSettings.model}`;
  if (endpoint.includes('anthropic.com')) return `Claude · ${aiSettings.model}`;
  if (endpoint.includes('generativelanguage.googleapis.com')) return `Gemini · ${aiSettings.model}`;
  if (endpoint.includes('deepseek.com')) return `DeepSeek · ${aiSettings.model}`;
  if (endpoint.includes('azure.com')) return `Foundry · ${aiSettings.model}`;
  if (endpoint.includes('127.0.0.1') || endpoint.includes('localhost') || endpoint.includes('[::1]')) return `Local · ${aiSettings.model}`;
  return aiSettings.model || 'Custom AI';
}

const DEFAULT_SUGGESTIONS = [
  { icon: 'search', label: 'Summarize my recent pages and open tasks', prompt: 'Summarize my recent workspace pages and highlight any open tasks.' },
  { icon: 'notes', label: 'Help me brainstorm or draft a new note', prompt: 'Help me outline a structured Markdown page based on my current workspace topics.' },
  { icon: 'views', label: 'Suggest next priorities from my projects', prompt: 'Review my folders and pages and suggest the clearest next 3 priorities.' },
  { icon: 'graph', label: 'Find connections across my notes', prompt: 'Look across my workspace pages and point out interesting connections or missing links.' },
];

function formatRelativeStamp(timestamp) {
  if (!Number.isFinite(timestamp)) return '';
  const diffSec = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (diffSec < 60) return 'Just now';
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function createAIChatController({
  getSettings,
  getContext,
  getVisibleNotes,
  onOpenConnectPopup,
  onOpenSettings,
  onCreateNoteFromReply,
  icon,
  storage = globalThis.localStorage,
}) {
  const history = createChatHistoryStore({ storage, workspaceId: getContext()?.workspaceId || 'personal' });

  let pageBusy = false;
  let pageError = '';
  let pageController = null;
  let scopeChoice = 'workspace';
  let pageHistoryOpen = true;
  let activePageChannel = 'page';
  let supportBusy = false;
  let supportError = '';
  let supportOpen = false;
  let supportHistoryOpen = false;
  let supportController = null;
  let supportExpanded = false;
  let supportCustomWidth = 0;
  let supportCustomHeight = 0;
  try {
    supportExpanded = storage?.getItem?.('nitrobison-ai-support-size') === 'expanded';
  } catch {}
  let pageHost = null;
  let supportRoot = null;

  function syncWorkspaceHistory() {
    const ctx = getContext();
    history.setWorkspace(ctx?.workspaceId || 'personal');
    return ctx;
  }

  function renderTurnMarkdown(container, markdown) {
    renderMarkdown(container, markdown, getVisibleNotes(), null, false, { readOnly: true });
  }
  function buildPayload(thread, modeScope = 'workspace') {
    const ctx = getContext();
    const systemPrompt = formatChatContext({
      workspaceName: ctx.workspaceName,
      viewLabel: ctx.viewLabel,
      folder: ctx.folder,
      activeNote: modeScope === 'general' ? null : ctx.activeNote,
      notes: modeScope === 'general' ? [] : ctx.notes,
    });
    const recentTurns = thread.slice(-20).map(item => ({ role: item.role, content: item.content }));
    return [{ role: 'system', content: systemPrompt }, ...recentTurns];
  }

  function renderPage(host = pageHost) {
    if (!host) return;
    pageHost = host;
    const ctx = syncWorkspaceHistory();
    const settings = getSettings();
    const configured = isAIConfigured(settings);
    const providerBadge = detectProviderLabel(settings);
    const pageThreads = history.listThreads('page');
    const pillThreads = history.listThreads('pill');
    const totalChats = pageThreads.length + pillThreads.length;
    if (activePageChannel === 'pill' && !history.getActiveThread('pill')) activePageChannel = 'page';
    const activePageThread = history.getActiveThread(activePageChannel);
    const pageTurns = activePageThread ? activePageThread.messages : [];
    const hasTurns = pageTurns.length > 0 || pageBusy || pageError;

    host.innerHTML = `
      <div class="ai-chat-shell ${hasTurns ? 'has-conversation' : 'is-landing'} ${pageHistoryOpen ? 'has-history-open' : 'is-history-collapsed'}">
        <header class="ai-chat-topbar">
          <div class="ai-chat-topbar-left">
            <button type="button" class="fb-btn fb-btn--secondary ai-chat-history-toggle" data-ai-history-toggle aria-expanded="${pageHistoryOpen}" title="${pageHistoryOpen ? 'Hide chat history' : 'Show chat history'}">
              ${icon('panel')}
              <span>Chats${totalChats ? ` (${totalChats})` : ''}</span>
            </button>
            <button type="button" class="ai-provider-pill ${configured ? 'is-connected' : 'is-disconnected'}" data-ai-chat-connect>
              <span class="ai-provider-dot" aria-hidden="true"></span>
              <span>${html(providerBadge)}</span>
              ${icon('chevrons')}
            </button>
          </div>
          <div class="ai-chat-topbar-actions">
            <button type="button" class="fb-btn fb-btn--secondary ai-chat-new-btn" data-ai-chat-new>${icon('plus')}New chat</button>
            <button type="button" class="fb-icon-btn" data-ai-chat-settings aria-label="AI provider settings" title="AI provider settings">${icon('settings')}</button>
          </div>
        </header>

        <div class="ai-chat-body">
          <aside class="ai-chat-history" aria-label="AI chat history" ${pageHistoryOpen ? '' : 'hidden'}>
            <div class="ai-chat-history-header">
              <span class="fb-eyebrow">Chat history</span>
              <button type="button" class="fb-icon-btn" data-ai-chat-new aria-label="Start new chat" title="New chat">${icon('plus')}</button>
            </div>
            ${totalChats ? `
              <div class="ai-chat-history-scroll">
                ${pageThreads.length ? `
                  <div class="ai-chat-history-section">
                    ${pillThreads.length ? `<div class="ai-chat-history-group-label">Full AI chats (${pageThreads.length})</div>` : ''}
                    <div class="ai-chat-history-list" role="list">
                      ${pageThreads.map(item => {
                        const isCurrent = activePageChannel === 'page' && activePageThread?.id === item.id;
                        return `
                          <div class="ai-history-row ${isCurrent ? 'is-active' : ''}" role="listitem">
                            <button type="button" class="ai-history-select" data-ai-select-thread="${html(item.id)}" data-ai-select-channel="page" aria-current="${isCurrent ? 'true' : 'false'}">
                              <span class="ai-history-title">${html(item.title)}</span>
                              <small class="ai-history-meta">${item.messages.length} msg · ${html(formatRelativeStamp(item.updatedAt))}</small>
                            </button>
                            <button type="button" class="fb-icon-btn ai-history-delete" data-ai-delete-thread="${html(item.id)}" data-ai-delete-channel="page" aria-label="Delete conversation ${html(item.title)}" title="Delete chat">${icon('trash')}</button>
                          </div>
                        `;
                      }).join('')}
                    </div>
                  </div>
                ` : ''}
                ${pillThreads.length ? `
                  <div class="ai-chat-history-section">
                    <div class="ai-chat-history-group-label">Page talks · Ask AI (${pillThreads.length})</div>
                    <div class="ai-chat-history-list" role="list">
                      ${pillThreads.map(item => {
                        const isCurrent = activePageChannel === 'pill' && activePageThread?.id === item.id;
                        return `
                          <div class="ai-history-row ${isCurrent ? 'is-active' : ''}" role="listitem">
                            <button type="button" class="ai-history-select" data-ai-select-thread="${html(item.id)}" data-ai-select-channel="pill" aria-current="${isCurrent ? 'true' : 'false'}">
                              <span class="ai-history-title">${html(item.title)}</span>
                              <small class="ai-history-meta">${html(item.contextLabel ? `${item.contextLabel} · ` : '')}${item.messages.length} msg · ${html(formatRelativeStamp(item.updatedAt))}</small>
                            </button>
                            <button type="button" class="fb-icon-btn ai-history-delete" data-ai-delete-thread="${html(item.id)}" data-ai-delete-channel="pill" aria-label="Delete page talk ${html(item.title)}" title="Delete talk">${icon('trash')}</button>
                          </div>
                        `;
                      }).join('')}
                    </div>
                  </div>
                ` : ''}
              </div>
            ` : `
              <p class="ai-history-empty">Your AI chats and page talks in <b>${html(ctx.workspaceName)}</b> appear here.</p>
            `}
          </aside>

          <div class="ai-chat-stage">
            ${!hasTurns ? `
              <div class="ai-chat-hero">
                <div class="ai-chat-avatar" aria-hidden="true">
                  <img src="/logo.png" alt="" width="52" height="52" />
                  <span class="ai-chat-avatar-badge">${icon('ai')}</span>
                </div>
                <h1>How can I help you today?</h1>
                <p class="ai-chat-subtitle">${configured
                  ? `Connected to <b>${html(providerBadge)}</b> · Grounded in <b>${html(ctx.workspaceName)}</b>.`
                  : 'Connect your preferred AI provider — ChatGPT, Claude, Gemini, DeepSeek, Microsoft Foundry, or offline Local AI.'}</p>
                ${!configured ? `<button type="button" class="fb-btn fb-btn--primary ai-chat-connect-cta" data-ai-chat-connect>${icon('ai')}Connect your AI provider</button>` : ''}
              </div>
            ` : `
              <div class="ai-chat-log" id="ai-chat-log" role="log" aria-live="polite">
                ${pageTurns.map((turn, idx) => `
                  <article class="ai-turn ai-turn--${turn.role}">
                    ${turn.role === 'assistant' ? `<div class="ai-turn-avatar" aria-hidden="true"><img src="/logo.png" alt="" width="26" height="26" /></div>` : ''}
                    <div class="ai-turn-bubble">
                      ${turn.role === 'user'
                        ? `<p class="ai-turn-user-text">${html(turn.content)}</p>`
                        : `<div class="ai-turn-markdown markdown-body" data-ai-turn-index="${idx}"></div>
                           <div class="ai-turn-actions">
                             <button type="button" class="fb-btn fb-btn--text" data-ai-save-note="${idx}">${icon('new-page')}Save as page</button>
                           </div>`}
                    </div>
                  </article>
                `).join('')}
                ${pageBusy ? `
                  <article class="ai-turn ai-turn--assistant is-thinking">
                    <div class="ai-turn-avatar" aria-hidden="true"><img src="/logo.png" alt="" width="26" height="26" /></div>
                    <div class="ai-turn-bubble"><span class="ai-thinking-dots">Thinking…</span></div>
                  </article>
                ` : ''}
                ${pageError ? `<p class="fb-error ai-chat-error" role="alert">${html(pageError)}</p>` : ''}
              </div>
            `}

            <div class="ai-composer-wrap">
              <form class="ai-composer" id="ai-page-composer">
                <label class="sr-only" for="ai-page-input">Ask, search, or make anything</label>
                <textarea id="ai-page-input" name="prompt" rows="2" maxlength="32000" placeholder="Ask, search, or make anything…" ${pageBusy ? 'disabled' : ''}></textarea>
                <div class="ai-composer-bar">
                  <div class="ai-composer-scopes" role="group" aria-label="Context scope">
                    <button type="button" class="ai-scope-chip ${scopeChoice === 'workspace' ? 'is-active' : ''}" data-ai-scope="workspace" aria-pressed="${scopeChoice === 'workspace'}">
                      ${icon('workspace')}<span>${html(ctx.workspaceName)} (${ctx.notes.length})</span>
                    </button>
                    ${ctx.activeNote ? `
                      <button type="button" class="ai-scope-chip ${scopeChoice === 'page' ? 'is-active' : ''}" data-ai-scope="page" aria-pressed="${scopeChoice === 'page'}">
                        ${icon('notes')}<span>${html(ctx.activeNote.title)}</span>
                      </button>
                    ` : ''}
                    <button type="button" class="ai-scope-chip ${scopeChoice === 'general' ? 'is-active' : ''}" data-ai-scope="general" aria-pressed="${scopeChoice === 'general'}">
                      ${icon('ai')}<span>General only</span>
                    </button>
                  </div>
                  <div class="ai-composer-submit">
                    ${pageBusy
                      ? `<button type="button" class="ai-stop-btn" data-ai-stop aria-label="Stop response">Stop</button>`
                      : `<button type="submit" class="ai-send-btn" aria-label="Send message" title="Send message">↑</button>`}
                  </div>
                </div>
              </form>

              ${!hasTurns ? `
                <div class="ai-suggestions" aria-label="Suggested prompts">
                  ${DEFAULT_SUGGESTIONS.map((item, index) => `
                    <button type="button" class="ai-suggestion-row" data-ai-suggestion="${index}">
                      <span class="ai-suggestion-icon">${icon(item.icon)}</span>
                      <span>${html(item.label)}</span>
                    </button>
                  `).join('')}
                </div>
              ` : ''}
            </div>
          </div>
        </div>
      </div>
    `;

    host.querySelectorAll('[data-ai-turn-index]').forEach(node => {
      const turn = pageTurns[Number(node.dataset.aiTurnIndex)];
      if (turn) renderTurnMarkdown(node, turn.content);
    });

    const log = host.querySelector('#ai-chat-log');
    if (log) log.scrollTop = log.scrollHeight;
    bindPageEvents(host, pageTurns);
  }

  async function submitPagePrompt(rawPrompt) {
    const prompt = String(rawPrompt || '').trim();
    const settings = getSettings();
    if (!isAIConfigured(settings)) {
      onOpenConnectPopup?.(prompt);
      return;
    }
    if (!prompt || pageBusy) return;
    const ctx = syncWorkspaceHistory();
    pageError = '';
    const targetChannel = activePageChannel === 'pill' && history.getActiveThread('pill') ? 'pill' : 'page';
    activePageChannel = targetChannel;
    const activeBefore = history.getActiveThread(targetChannel);
    const updatedThread = history.appendTurn(targetChannel, activeBefore?.id ?? null, {
      role: 'user',
      content: prompt,
      scope: scopeChoice,
    });
    const targetThreadId = updatedThread.id;
    pageBusy = true;
    pageController = new AbortController();
    renderPage();

    try {
      const turnsForModel = updatedThread.messages.slice(-20).map(item => ({ role: item.role, content: item.content }));
      const scopedCtx = scopeChoice === 'page'
        ? [{ role: 'system', content: formatChatContext({ workspaceName: ctx.workspaceName, viewLabel: ctx.viewLabel, folder: ctx.folder, activeNote: ctx.activeNote, notes: [] }) }, ...turnsForModel]
        : buildPayload(updatedThread.messages, scopeChoice);
      const reply = await chatAI(settings, scopedCtx, { signal: pageController.signal });
      history.appendTurn(targetChannel, targetThreadId, { role: 'assistant', content: reply, scope: scopeChoice });
    } catch (error) {
      pageError = error.name === 'AbortError' ? 'Response stopped.' : error.message;
    } finally {
      pageBusy = false;
      pageController = null;
      renderPage();
      pageHost?.querySelector('#ai-page-input')?.focus();
    }
  }

  function bindPageEvents(host, pageTurns) {
    const form = host.querySelector('#ai-page-composer');
    const textarea = host.querySelector('#ai-page-input');
    form?.addEventListener('submit', event => {
      event.preventDefault();
      void submitPagePrompt(textarea.value);
    });
    textarea?.addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        void submitPagePrompt(textarea.value);
      }
    });
    host.querySelectorAll('[data-ai-chat-connect]').forEach(btn => {
      btn.addEventListener('click', () => onOpenConnectPopup?.(textarea?.value?.trim() || ''));
    });
    host.querySelector('[data-ai-chat-settings]')?.addEventListener('click', () => onOpenSettings?.());
    host.querySelector('[data-ai-history-toggle]')?.addEventListener('click', () => {
      pageHistoryOpen = !pageHistoryOpen;
      const draftVal = textarea?.value || '';
      renderPage();
      const nextInput = host.querySelector('#ai-page-input');
      if (nextInput) nextInput.value = draftVal;
    });
    host.querySelectorAll('[data-ai-chat-new]').forEach(btn => {
      btn.addEventListener('click', () => {
        pageController?.abort();
        activePageChannel = 'page';
        history.startNewThread('page');
        pageError = '';
        renderPage();
        pageHost?.querySelector('#ai-page-input')?.focus();
      });
    });
    host.querySelectorAll('[data-ai-select-thread]').forEach(btn => {
      btn.addEventListener('click', () => {
        pageController?.abort();
        const channel = btn.dataset.aiSelectChannel === 'pill' ? 'pill' : 'page';
        activePageChannel = channel;
        const chosen = history.selectThread(channel, btn.dataset.aiSelectThread);
        if (chosen?.scope) scopeChoice = chosen.scope;
        pageError = '';
        if (window.innerWidth <= 760) pageHistoryOpen = false;
        renderPage();
        pageHost?.querySelector('#ai-page-input')?.focus();
      });
    });
    host.querySelectorAll('[data-ai-delete-thread]').forEach(btn => {
      btn.addEventListener('click', event => {
        event.stopPropagation();
        const channel = btn.dataset.aiDeleteChannel === 'pill' ? 'pill' : 'page';
        const targetId = btn.dataset.aiDeleteThread;
        if (activePageChannel === channel && history.getActiveThread(channel)?.id === targetId) pageController?.abort();
        history.deleteThread(channel, targetId);
        if (activePageChannel === 'pill' && !history.getActiveThread('pill')) activePageChannel = 'page';
        pageError = '';
        renderPage();
      });
    });
    host.querySelector('[data-ai-stop]')?.addEventListener('click', () => pageController?.abort());
    host.querySelectorAll('[data-ai-scope]').forEach(btn => {
      btn.addEventListener('click', () => {
        scopeChoice = btn.dataset.aiScope;
        const draftVal = textarea?.value || '';
        renderPage();
        const nextInput = host.querySelector('#ai-page-input');
        if (nextInput) { nextInput.value = draftVal; nextInput.focus(); }
      });
    });
    host.querySelectorAll('[data-ai-suggestion]').forEach(btn => {
      btn.addEventListener('click', () => {
        const chosen = DEFAULT_SUGGESTIONS[Number(btn.dataset.aiSuggestion)];
        if (chosen) void submitPagePrompt(chosen.prompt);
      });
    });
    host.querySelectorAll('[data-ai-save-note]').forEach(btn => {
      btn.addEventListener('click', () => {
        const turn = pageTurns[Number(btn.dataset.aiSaveNote)];
        if (turn) onCreateNoteFromReply?.(turn.content);
      });
    });
  }
  function mountSupportWidget(container) {
    supportRoot = document.createElement('aside');
    supportRoot.id = 'ai-support-widget';
    supportRoot.className = 'ai-support-widget';
    supportRoot.setAttribute('aria-label', 'Workspace AI assistant');
    supportRoot.hidden = true;
    container.append(supportRoot);
    renderSupportWidget();
  }

  function renderSupportWidget() {
    if (!supportRoot) return;
    const ctx = syncWorkspaceHistory();
    const settings = getSettings();
    const configured = isAIConfigured(settings);
    const hideWidget = !configured || ctx.view === 'ai-chat';
    supportRoot.hidden = hideWidget;
    if (hideWidget) return;

    const contextBadge = ctx.activeNote
      ? `${ctx.activeNote.title}`
      : `${ctx.viewLabel}${ctx.folder ? ` · ${ctx.folder}` : ''}`;

    const pillThreads = history.listThreads('pill');
    const activePillThread = history.getActiveThread('pill');
    const supportTurns = activePillThread ? activePillThread.messages : [];

    const wasOpen = supportRoot.classList.contains('is-open');
    supportRoot.classList.toggle('is-open', supportOpen);
    if (!supportOpen) {
      supportRoot.innerHTML = `
        <button type="button" class="ai-support-fab" data-support-open aria-label="Ask AI about ${html(contextBadge)}" title="Ask AI about ${html(contextBadge)}">
          <img src="/logo.png" alt="" width="24" height="24" />
          <span class="ai-support-fab-sparkle">${icon('ai')}</span>
          <span class="ai-support-fab-label">Ask AI</span>
        </button>
      `;
      supportRoot.querySelector('[data-support-open]')?.addEventListener('click', () => {
        supportOpen = true;
        renderSupportWidget();
        supportRoot.querySelector('#ai-support-input')?.focus();
      });
      return;
    }

    let panel = supportRoot.querySelector('.ai-support-panel');
    const existingInput = supportRoot.querySelector('#ai-support-input');
    const draftText = existingInput && !supportBusy ? existingInput.value : '';
    if (!panel) {
      panel = document.createElement('section');
      panel.className = `ai-support-panel${supportExpanded ? ' is-expanded' : ''}${wasOpen ? '' : ' is-entering'}`;
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-label', 'Ask AI about this page');
      panel.addEventListener('animationend', event => {
        if (event.target === panel) panel.classList.remove('is-entering');
      });
      supportRoot.replaceChildren(panel);
    } else {
      panel.classList.toggle('is-expanded', supportExpanded);
    }
    if (supportCustomWidth > 0 && supportCustomHeight > 0) {
      panel.style.setProperty('--ai-support-w', `${supportCustomWidth}px`);
      panel.style.setProperty('--ai-support-h', `${supportCustomHeight}px`);
      panel.classList.add('has-custom-size');
    } else {
      panel.style.removeProperty('--ai-support-w');
      panel.style.removeProperty('--ai-support-h');
      panel.classList.remove('has-custom-size');
    }

    const contextCaption = supportExpanded ? `${contextBadge} · Reading view` : contextBadge;
    panel.innerHTML = `
      <div class="ai-support-resize-grip" data-support-resize title="Drag corner to resize"></div>
      <header class="ai-support-header">
        <div class="ai-support-title">
          <img src="/logo.png" alt="" width="22" height="22" />
          <div>
            <b>Ask AI</b>
            <span class="ai-support-context" title="${html(contextCaption)}">${html(contextCaption)}</span>
          </div>
        </div>
        <div class="ai-support-header-actions">
          <button type="button" class="ai-support-pill-btn ${supportHistoryOpen ? 'is-active' : ''}" data-support-history aria-expanded="${supportHistoryOpen}" title="Pill chat history (${pillThreads.length})">
            ${icon('list')}<span>${pillThreads.length}</span>
          </button>
          <button type="button" class="fb-icon-btn" data-support-new aria-label="New Ask AI talk" title="New Ask AI talk">${icon('plus')}</button>
          <button type="button" class="${supportExpanded ? 'ai-support-pill-btn is-active' : 'fb-icon-btn'}" data-support-size aria-pressed="${supportExpanded}" aria-label="${supportExpanded ? 'Switch to compact Ask AI view' : 'Expand Ask AI reading view'}" title="${supportExpanded ? 'Switch to compact view' : 'Larger reading view on this page'}">
            ${icon(supportExpanded ? 'collapse' : 'expand')}${supportExpanded ? '<span>Compact</span>' : ''}
          </button>
          <button type="button" class="fb-icon-btn" data-support-expand aria-label="Open full AI chat" title="Open in full AI chat">${icon('panel')}</button>
          <button type="button" class="fb-icon-btn" data-support-close aria-label="Minimize AI assistant" title="Minimize">${icon('close')}</button>
        </div>
      </header>
      <div class="ai-support-body">
        <div class="ai-support-history-drawer ${supportHistoryOpen ? 'is-open' : ''}" role="region" aria-label="Ask AI pill conversation history" aria-hidden="${!supportHistoryOpen}" ${supportHistoryOpen ? '' : 'inert'}>
          <div class="ai-support-history-head">
            <span>Ask AI talks (${pillThreads.length})</span>
            <button type="button" class="fb-btn fb-btn--text" data-support-new>${icon('plus')}New talk</button>
          </div>
          ${pillThreads.length ? `
            <div class="ai-support-history-list">
              ${pillThreads.map(item => {
                const isCurrent = activePillThread?.id === item.id;
                return `
                  <div class="ai-support-history-item ${isCurrent ? 'is-active' : ''}">
                    <button type="button" class="ai-support-history-select" data-support-select="${html(item.id)}" aria-current="${isCurrent ? 'true' : 'false'}">
                      <span class="ai-support-history-title">${html(item.title)}</span>
                      <small>${html(item.contextLabel ? `${item.contextLabel} · ` : '')}${html(formatRelativeStamp(item.updatedAt))}</small>
                    </button>
                    <button type="button" class="fb-icon-btn ai-support-history-delete" data-support-delete="${html(item.id)}" aria-label="Delete Ask AI talk ${html(item.title)}" title="Delete talk">${icon('trash')}</button>
                  </div>
                `;
              }).join('')}
            </div>
          ` : `<p class="ai-support-history-empty">No saved Ask AI talks yet.</p>`}
        </div>
        <div class="ai-support-messages" id="ai-support-log" role="log" aria-live="polite">
          ${!supportTurns.length && !supportBusy ? `
            <div class="ai-support-welcome">
              <p>Ask anything about <b>${html(contextBadge)}</b> or <b>${html(ctx.workspaceName)}</b>.</p>
              <div class="ai-support-quick">
                <button type="button" data-support-quick="Summarize what is on this page right now.">Summarize this page</button>
                <button type="button" data-support-quick="What are the key takeaways and action items in this workspace?">Key action items</button>
              </div>
            </div>
          ` : ''}
          ${supportTurns.map((turn, idx) => `
            <div class="ai-support-turn ai-support-turn--${turn.role}">
              ${turn.role === 'user'
                ? `<p class="ai-support-user">${html(turn.content)}</p>`
                : `<div class="ai-support-assistant-card">
                     <div class="ai-support-markdown markdown-body" data-support-turn="${idx}"></div>
                     <div class="ai-support-turn-actions">
                       <button type="button" class="fb-btn fb-btn--text" data-support-save-note="${idx}">${icon('new-page')}Save as page</button>
                     </div>
                   </div>`}
            </div>
          `).join('')}
          ${supportBusy ? `<div class="ai-support-turn ai-support-turn--assistant"><span class="ai-thinking-dots">Thinking…</span></div>` : ''}
          ${supportError ? `<p class="fb-error ai-support-error" role="alert">${html(supportError)}</p>` : ''}
        </div>
      </div>
      <form class="ai-support-form" id="ai-support-form">
        <div class="ai-support-input-wrap">
          <label class="sr-only" for="ai-support-input">Ask a question about this page or workspace</label>
          <textarea id="ai-support-input" rows="1" maxlength="16000" placeholder="Ask about ${html(contextBadge)}…" ${supportBusy ? 'disabled' : ''}>${html(draftText)}</textarea>
          ${supportExpanded ? `<small class="ai-support-hint">Enter to send · Shift+Enter for newline</small>` : ''}
        </div>
        ${supportBusy
          ? `<button type="button" class="ai-stop-btn" data-support-stop>Stop</button>`
          : `<button type="submit" class="ai-send-btn" aria-label="Send question">↑</button>`}
      </form>
    `;

    supportRoot.querySelectorAll('[data-support-turn]').forEach(node => {
      const turn = supportTurns[Number(node.dataset.supportTurn)];
      if (turn) renderTurnMarkdown(node, turn.content);
    });
    const log = supportRoot.querySelector('#ai-support-log');
    if (log) log.scrollTop = log.scrollHeight;

    const syncSupportTextareaHeight = el => {
      if (!el || typeof el.style?.setProperty !== 'function') return;
      el.style.height = 'auto';
      const cap = supportExpanded ? 148 : 108;
      el.style.height = `${Math.min(Math.max(el.scrollHeight || 32, 32), cap)}px`;
    };
    const supportInput = supportRoot.querySelector('#ai-support-input');
    if (supportInput) {
      syncSupportTextareaHeight(supportInput);
      supportInput.addEventListener('input', () => syncSupportTextareaHeight(supportInput));
      supportInput.addEventListener('keydown', event => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          void submitSupportPrompt(supportInput.value || '');
        }
      });
    }
    supportRoot.querySelector('[data-support-close]')?.addEventListener('click', () => {
      supportOpen = false;
      supportHistoryOpen = false;
      renderSupportWidget();
    });
    supportRoot.querySelector('[data-support-history]')?.addEventListener('click', () => {
      supportHistoryOpen = !supportHistoryOpen;
      const drawer = supportRoot.querySelector('.ai-support-history-drawer');
      const toggleBtn = supportRoot.querySelector('[data-support-history]');
      if (drawer && toggleBtn) {
        drawer.classList.toggle('is-open', supportHistoryOpen);
        drawer.setAttribute('aria-hidden', String(!supportHistoryOpen));
        drawer.toggleAttribute('inert', !supportHistoryOpen);
        toggleBtn.classList.toggle('is-active', supportHistoryOpen);
        toggleBtn.setAttribute('aria-expanded', String(supportHistoryOpen));
      } else {
        renderSupportWidget();
      }
    });
    supportRoot.querySelectorAll('[data-support-new]').forEach(btn => {
      btn.addEventListener('click', () => {
        supportController?.abort();
        history.startNewThread('pill');
        supportError = '';
        supportHistoryOpen = false;
        renderSupportWidget();
        supportRoot.querySelector('#ai-support-input')?.focus();
      });
    });
    supportRoot.querySelectorAll('[data-support-select]').forEach(btn => {
      btn.addEventListener('click', () => {
        supportController?.abort();
        history.selectThread('pill', btn.dataset.supportSelect);
        supportError = '';
        supportHistoryOpen = false;
        renderSupportWidget();
        supportRoot.querySelector('#ai-support-input')?.focus();
      });
    });
    supportRoot.querySelectorAll('[data-support-delete]').forEach(btn => {
      btn.addEventListener('click', event => {
        event.stopPropagation();
        const targetId = btn.dataset.supportDelete;
        if (history.getActiveThread('pill')?.id === targetId) supportController?.abort();
        history.deleteThread('pill', targetId);
        supportError = '';
        renderSupportWidget();
      });
    });
    supportRoot.querySelector('[data-support-size]')?.addEventListener('click', () => {
      supportExpanded = !supportExpanded;
      supportCustomWidth = 0;
      supportCustomHeight = 0;
      try {
        storage?.setItem?.('nitrobison-ai-support-size', supportExpanded ? 'expanded' : 'compact');
      } catch {}
      renderSupportWidget();
      supportRoot.querySelector('#ai-support-input')?.focus();
    });
    const resizeGrip = supportRoot.querySelector('[data-support-resize]');
    resizeGrip?.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      event.preventDefault();
      resizeGrip.setPointerCapture(event.pointerId);
      const rect = panel.getBoundingClientRect();
      const startX = event.clientX;
      const startY = event.clientY;
      const onMove = moveEvent => {
        const maxW = Math.max(340, window.innerWidth - 36);
        const maxH = Math.max(380, window.innerHeight - 96);
        supportCustomWidth = Math.round(Math.min(maxW, Math.max(340, rect.width + (startX - moveEvent.clientX))));
        supportCustomHeight = Math.round(Math.min(maxH, Math.max(380, rect.height + (startY - moveEvent.clientY))));
        supportExpanded = supportCustomWidth >= 480 || supportCustomHeight >= 580;
        panel.style.setProperty('--ai-support-w', `${supportCustomWidth}px`);
        panel.style.setProperty('--ai-support-h', `${supportCustomHeight}px`);
        panel.classList.add('has-custom-size');
        panel.classList.toggle('is-expanded', supportExpanded);
      };
      const onEnd = () => {
        resizeGrip.removeEventListener('pointermove', onMove);
        resizeGrip.removeEventListener('pointerup', onEnd);
        resizeGrip.removeEventListener('pointercancel', onEnd);
        renderSupportWidget();
      };
      resizeGrip.addEventListener('pointermove', onMove);
      resizeGrip.addEventListener('pointerup', onEnd);
      resizeGrip.addEventListener('pointercancel', onEnd);
    });
    supportRoot.querySelectorAll('[data-support-save-note]').forEach(btn => {
      btn.addEventListener('click', () => {
        const turn = supportTurns[Number(btn.dataset.supportSaveNote)];
        if (turn) onCreateNoteFromReply?.(turn.content);
      });
    });
    supportRoot.querySelector('[data-support-expand]')?.addEventListener('click', () => {
      if (activePillThread) activePageChannel = 'pill';
      supportOpen = false;
      supportHistoryOpen = false;
      ctx.onOpenFullChat?.();
    });
    supportRoot.querySelector('[data-support-stop]')?.addEventListener('click', () => supportController?.abort());
    supportRoot.querySelectorAll('[data-support-quick]').forEach(btn => {
      btn.addEventListener('click', () => void submitSupportPrompt(btn.dataset.supportQuick));
    });
    supportRoot.querySelector('#ai-support-form')?.addEventListener('submit', event => {
      event.preventDefault();
      const input = supportRoot.querySelector('#ai-support-input');
      void submitSupportPrompt(input?.value || '');
    });
  }

  async function submitSupportPrompt(rawPrompt) {
    const prompt = String(rawPrompt || '').trim();
    const settings = getSettings();
    if (!isAIConfigured(settings)) {
      onOpenConnectPopup?.(prompt);
      return;
    }
    if (!prompt || supportBusy) return;
    const ctx = syncWorkspaceHistory();
    const contextBadge = ctx.activeNote
      ? `${ctx.activeNote.title}`
      : `${ctx.viewLabel}${ctx.folder ? ` · ${ctx.folder}` : ''}`;
    supportError = '';
    supportHistoryOpen = false;
    const activeBefore = history.getActiveThread('pill');
    const updatedThread = history.appendTurn('pill', activeBefore?.id ?? null, {
      role: 'user',
      content: prompt,
      contextLabel: contextBadge,
    });
    const targetThreadId = updatedThread.id;
    supportBusy = true;
    supportController = new AbortController();
    renderSupportWidget();

    try {
      const reply = await chatAI(settings, buildPayload(updatedThread.messages, 'workspace'), { signal: supportController.signal });
      history.appendTurn('pill', targetThreadId, {
        role: 'assistant',
        content: reply,
        contextLabel: contextBadge,
      });
    } catch (error) {
      supportError = error.name === 'AbortError' ? 'Stopped.' : error.message;
    } finally {
      supportBusy = false;
      supportController = null;
      renderSupportWidget();
      supportRoot?.querySelector('#ai-support-input')?.focus();
    }
  }

  return {
    renderPage,
    mountSupportWidget,
    syncSupportWidget: renderSupportWidget,
    submitPendingPrompt(prompt) {
      if (prompt) void submitPagePrompt(prompt);
      else renderPage();
    },
  };
}
