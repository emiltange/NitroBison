import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { findAICommand, generateAI, chatAI, testAIConnection, isAIConfigured, formatChatContext } from '../src/ai.js';

const config = { endpoint: 'https://example.com/v1/chat/completions', model: 'local-model' };
const completion = content => ({ choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }] });

async function provider(t, handler) {
  const server = createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => {
    server.close(resolve);
    server.closeAllConnections();
  }));
  return { ...config, endpoint: `http://127.0.0.1:${server.address().port}/v1/chat/completions` };
}

function json(response, value, status = 200) {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(value));
}

function nativeBridge(t, bridge) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const restore = () => {
    if (descriptor) Object.defineProperty(globalThis, 'window', descriptor);
    else delete globalThis.window;
  };
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { nitrobisonDesktop: { isDesktop: true, ...bridge } } });
  t.after(restore);
  return restore;
}

test('AI command selection replaces only the caret line and preserves CRLF and adjacent notes', () => {
  const content = 'Before\r\n  /aI Draft a plan  \r\nAfter';
  assert.deepEqual(findAICommand(content, 14), { start: 8, end: 28, prompt: 'Draft a plan' });
  const command = findAICommand(content, 28);
  assert.equal(content.slice(0, command.start) + '# Generated' + content.slice(command.end), 'Before\r\n# Generated\r\nAfter');
  assert.equal(findAICommand(content, 7), null);
  assert.equal(findAICommand(content, 30), null);
  assert.equal(findAICommand(content, 29), null);
  assert.deepEqual(findAICommand('/AI\nnext', 3), { start: 0, end: 3, prompt: '' });
  assert.deepEqual(findAICommand('   /AI\t hello\n', 8), { start: 0, end: 13, prompt: 'hello' });
});

test('AI commands reject inline, escaped, indented, lookalike and invalid caret inputs', () => {
  for (const content of ['prefix /AI prompt', '\\n/AIword prompt', '/AIword', '\\/AI prompt', '    /AI prompt', '\t/AI prompt', ' /AI/prompt', '> /AI prompt', '- /AI prompt']) {
    assert.equal(findAICommand(content, content.length), null, content);
  }
  for (const cursor of [-1, 4, 1.5, NaN, '1']) assert.equal(findAICommand('/AI', cursor), null);
  assert.equal(findAICommand(null, 0), null);
});

test('AI commands ignore fenced code until a matching sufficiently long closing fence', () => {
  for (const content of [
    '```md\n/AI hidden\n```\n/AI visible',
    '  ~~~~text\r\n/AI hidden\r\n~~~\r\n/AI also hidden\r\n  ~~~~\r\n/AI visible',
    '````\n/AI hidden\n```\n/AI also hidden\n~~~~\n/AI still hidden\n````\n/AI visible',
  ]) {
    const hidden = content.indexOf('/AI hidden');
    assert.equal(findAICommand(content, hidden + 4), null);
    const alsoHidden = content.indexOf('/AI also hidden');
    if (alsoHidden >= 0) assert.equal(findAICommand(content, alsoHidden + 4), null);
    const start = content.lastIndexOf('/AI visible');
    assert.deepEqual(findAICommand(content, content.length), { start, end: content.length, prompt: 'visible' });
  }
  assert.deepEqual(findAICommand('    ```\n/AI yes', 15), { start: 8, end: 15, prompt: 'yes' });
  assert.equal(findAICommand('```\n/AI hidden\n``` trailing\n/AI hidden too', 40), null);
});

test('AI posts exactly one user prompt and returns generated Markdown from a real local endpoint', async t => {
  let received;
  const local = await provider(t, async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    received = { method: request.method, url: request.url, authorization: request.headers.authorization, contentType: request.headers['content-type'], body: JSON.parse(body) };
    json(response, completion('# Plan\n\n- One 🐄'));
  });
  assert.equal(await generateAI({ ...local, apiKey: 'session-key' }, 'Only this prompt'), '# Plan\n\n- One 🐄');
  assert.deepEqual(received, {
    method: 'POST', url: '/v1/chat/completions', authorization: 'Bearer session-key', contentType: 'application/json',
    body: { model: 'local-model', messages: [{ role: 'user', content: 'Only this prompt' }], stream: false },
  });
});

test('AI local endpoints do not require or retain a bearer key between calls', async t => {
  const headers = [];
  const local = await provider(t, (request, response) => {
    headers.push(request.headers.authorization);
    json(response, completion('Local answer'));
  });
  await generateAI({ ...local, apiKey: 'session-key' }, 'First');
  await generateAI(local, 'Second');
  await generateAI({ ...local, apiKey: '' }, 'Third');
  assert.deepEqual(headers, ['Bearer session-key', undefined, undefined]);
});

test('AI provider HTTP and JSON error details never disclose provider bodies or credentials', async t => {
  for (const status of [401, 429, 500, 200]) {
    const local = await provider(t, (_request, response) => json(response, { error: { message: 'SECRET-provider-body session-key' } }, status));
    await assert.rejects(generateAI({ ...local, apiKey: 'session-key' }, 'Prompt'), error => {
      assert.doesNotMatch(error.message, /SECRET|session-key/);
      if (status !== 200) assert.match(error.message, new RegExp(String(status)));
      return true;
    });
  }
});

test('AI rejects malformed, absent, nontext, empty and oversized generated content', async t => {
  for (const value of [{}, { choices: [] }, completion(null), completion(['not text']), completion(''), completion('   '), completion('bad\u0000text'), completion('x'.repeat(262145))]) {
    const local = await provider(t, (_request, response) => json(response, value));
    await assert.rejects(generateAI(local, 'Prompt'), /response|Markdown/i);
  }
  const invalid = await provider(t, (_request, response) => response.end('{private-invalid-json'));
  await assert.rejects(generateAI(invalid, 'Prompt'), error => {
    assert.doesNotMatch(error.message, /private-invalid-json/);
    return true;
  });
});

test('AI bounds chunked response bytes even when no content length is supplied', async t => {
  let disconnected;
  const closed = new Promise(resolve => { disconnected = resolve; });
  const local = await provider(t, (_request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.on('close', disconnected);
    response.write('{"padding":"');
    const timer = setInterval(() => response.write('x'.repeat(32768)), 1);
    response.on('close', () => clearInterval(timer));
  });
  await assert.rejects(generateAI(local, 'Prompt'), /large|limit/i);
  await closed;
});

test('AI rejects oversized declared responses before reading their bodies', async t => {
  const local = await provider(t, (_request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': '1048577' });
    response.flushHeaders();
  });
  await assert.rejects(generateAI(local, 'Prompt'), /large|limit/i);
});

test('AI does not follow redirects or forward its bearer key to a redirected endpoint', async t => {
  let targetRequests = 0;
  const target = await provider(t, (_request, response) => {
    targetRequests++;
    json(response, completion('Should not be requested'));
  });
  const local = await provider(t, (_request, response) => {
    response.writeHead(307, { Location: target.endpoint });
    response.end();
  });
  await assert.rejects(generateAI({ ...local, apiKey: 'session-key' }, 'Prompt'), /redirect|307/i);
  assert.equal(targetRequests, 0);
});

test('AI rejects unsafe endpoint URLs, hidden query credentials and header injection before native dispatch', async t => {
  let requests = 0;
  nativeBridge(t, { generateAI: () => { requests++; return Promise.resolve('unexpected'); }, cancelAI() {} });
  for (const endpoint of [
    'http://example.com/v1/chat/completions', 'http://localhost.evil/v1/chat/completions',
    'http://127.0.0.2/v1/chat/completions', 'http://127.1/v1/chat/completions', 'http://2130706433/v1/chat/completions',
    'file:///private', 'https://user:password@example.com/chat', 'https://@example.com/chat',
    'https://example.com/chat#private', 'https://example.com/chat#', ' https://example.com/chat',
    'https://example.com/chat?api_key=session-key', 'https://example.com/chat?access_token=secret',
    'https://example.com/chat?X-Amz-Signature=secret', 'https://example.com/chat?%61pi%5Fkey=secret',
    'https://example.com/chat?authorization=secret', 'https://example.com/chat?payload=Bearer%20secret',
    'https://example.com/chat?custom=session-key', 'https://example.com/\\evil',
  ]) {
    await assert.rejects(generateAI({ ...config, endpoint, apiKey: 'session-key' }, 'Prompt'), error => {
      assert.doesNotMatch(error.message, /session-key|password|Bearer secret/);
      return true;
    });
  }
  for (const apiKey of ['key\r\nInjected: yes', 'key with spaces', 'é', 'x'.repeat(8193), 123]) {
    await assert.rejects(generateAI({ ...config, apiKey }, 'Prompt'));
  }
  assert.equal(requests, 0);
});

test('AI validates bounded plain configuration and prompt without invoking accessors', async t => {
  let requests = 0;
  let getterCalls = 0;
  nativeBridge(t, { generateAI: () => { requests++; return Promise.resolve('unexpected'); }, cancelAI() {} });
  const accessor = { ...config, get apiKey() { getterCalls++; throw new Error('secret-getter'); } };
  for (const invalid of [null, [], new Date(), { ...config, extra: true }, { ...config, model: '' }, { ...config, model: 'x'.repeat(257) }, { ...config, model: 'bad\nmodel' }, { ...config, endpoint: 'https://example.com/' + 'x'.repeat(4096) }, accessor]) {
    await assert.rejects(generateAI(invalid, 'Prompt'));
  }
  for (const prompt of ['', ' \n ', null, {}, 'x'.repeat(65537), 'bad\u0000prompt']) await assert.rejects(generateAI(config, prompt));
  assert.equal(requests, 0);
  assert.equal(getterCalls, 0);
});

test('AI accepts HTTPS and exact local HTTP hosts with noncredential query settings through the native bridge', async t => {
  const inputs = [];
  nativeBridge(t, { generateAI: input => { inputs.push(input); return Promise.resolve('## Native'); }, cancelAI() {} });
  for (const endpoint of ['https://provider.example/custom/chat?api-version=2026-01-01', 'http://localhost:1234/v1/chat/completions', 'http://127.0.0.1:1234/v1/chat/completions', 'http://[::1]:1234/v1/chat/completions']) {
    assert.equal(await generateAI({ endpoint, model: 'model', apiKey: '' }, 'Native prompt'), '## Native');
    assert.deepEqual(inputs.at(-1), { config: { endpoint, model: 'model', apiKey: '' }, prompt: 'Native prompt' });
  }
});

test('AI cancellation aborts a live streamed HTTP response instead of inserting a partial answer', async t => {
  const controller = new AbortController();
  let began;
  const started = new Promise(resolve => { began = resolve; });
  let disconnected;
  const closed = new Promise(resolve => { disconnected = resolve; });
  const local = await provider(t, (_request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.on('close', disconnected);
    response.write('{"choices":[');
    began();
  });
  const result = generateAI(local, 'Prompt', { signal: controller.signal });
  await started;
  controller.abort(new Error('private cancellation reason'));
  await assert.rejects(result, error => error.name === 'AbortError' && !error.message.includes('private'));
  await closed;
});

test('AI pre-aborted requests never reach the native bridge and running requests cancel exactly once', async t => {
  let requests = 0;
  let cancellations = 0;
  nativeBridge(t, { generateAI: () => { requests++; return new Promise(() => {}); }, cancelAI: () => { cancellations++; } });
  const preAborted = new AbortController();
  preAborted.abort();
  await assert.rejects(generateAI(config, 'Prompt', { signal: preAborted.signal }), { name: 'AbortError' });
  assert.equal(requests, 0);
  const active = new AbortController();
  const result = generateAI(config, 'Prompt', { signal: active.signal });
  active.abort();
  active.abort();
  await assert.rejects(result, { name: 'AbortError' });
  assert.equal(requests, 1);
  assert.equal(cancellations, 1);
});

test('AI completed native requests remove abort listeners so later aborts cannot cancel another request', async t => {
  let cancellations = 0;
  nativeBridge(t, { generateAI: () => Promise.resolve('Completed Markdown'), cancelAI: () => { cancellations++; } });
  const controller = new AbortController();
  assert.equal(await generateAI(config, 'Prompt', { signal: controller.signal }), 'Completed Markdown');
  controller.abort();
  assert.equal(cancellations, 0);
});

test('AI native timeout is finite and cancels the bridge without exposing its errors', async t => {
  let cancellations = 0;
  nativeBridge(t, { generateAI: () => new Promise(() => {}), cancelAI: () => { cancellations++; throw new Error('session-key'); } });
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const result = generateAI(config, 'Prompt');
  const rejection = assert.rejects(result, error => /timed out after 120 seconds/i.test(error.message) && !error.message.includes('session-key'));
  t.mock.timers.tick(120000);
  await rejection;
  assert.equal(cancellations, 1);
});

test('AI native responses are validated and rejected bridge messages cannot leak credentials', async t => {
  let mode = 'error';
  nativeBridge(t, { generateAI: () => mode === 'error' ? Promise.reject(new Error('SECRET session-key')) : Promise.resolve({ content: 'invalid' }), cancelAI() {} });
  await assert.rejects(generateAI(config, 'Prompt'), error => !/SECRET|session-key/.test(error.message));
  mode = 'invalid';
  await assert.rejects(generateAI(config, 'Prompt'), /response|Markdown/i);
});

test('AI transport errors give actionable browser CORS or desktop guidance without endpoint secrets', async t => {
  const unavailable = await provider(t, (_request, response) => response.destroy());
  await assert.rejects(generateAI({ ...unavailable, apiKey: 'session-key' }, 'Prompt'), error => {
    assert.match(error.message, /CORS/);
    assert.match(error.message, /desktop/i);
    assert.doesNotMatch(error.message, /session-key/);
    return true;
  });
});

test('isAIConfigured verifies valid endpoint, model, and remote vs loopback API key requirements', () => {
  assert.equal(isAIConfigured(null), false);
  assert.equal(isAIConfigured({ endpoint: '', model: '', apiKey: '' }), false);
  assert.equal(isAIConfigured({ endpoint: 'https://api.openai.com/v1/chat/completions', model: 'gpt-6-astra', apiKey: '' }), false);
  assert.equal(isAIConfigured({ endpoint: 'https://api.openai.com/v1/chat/completions', model: 'gpt-6-astra', apiKey: 'sk-valid' }), true);
  assert.equal(isAIConfigured({ endpoint: 'http://127.0.0.1:11434/v1/chat/completions', model: 'qwen3:8b', apiKey: '' }), true);
});

test('chatAI sends multi-turn system, user, and assistant messages and validates bounds', async t => {
  let received;
  const local = await provider(t, async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    received = JSON.parse(body);
    json(response, completion('Here is a concise summary of your workspace.'));
  });
  const messages = [
    { role: 'system', content: 'Workspace: Personal workspace\nActive view: Task table' },
    { role: 'user', content: 'Summarize my open tasks' },
    { role: 'assistant', content: 'You have 2 open tasks.' },
    { role: 'user', content: 'Which one should I tackle first?' },
  ];
  const reply = await chatAI({ ...local, apiKey: 'chat-key' }, messages);
  assert.equal(reply, 'Here is a concise summary of your workspace.');
  assert.deepEqual(received, { model: 'local-model', messages, stream: false });

  await assert.rejects(chatAI(local, []), /message/i);
  await assert.rejects(chatAI(local, [{ role: 'tool', content: 'bad role' }]), /role|message/i);
  await assert.rejects(chatAI(local, [{ role: 'user', content: '   ' }]), /message/i);
});

test('formatChatContext builds bounded page and workspace context without leaking private device paths', () => {
  const context = formatChatContext({
    workspaceName: 'Personal workspace',
    viewLabel: 'Notes',
    folder: 'Projects',
    activeNote: { title: 'Roadmap', folder: 'Projects', content: '# Q4 Roadmap\n\nShip Kanban pills and AI chat.' },
    notes: [
      { id: '1', title: 'Roadmap', folder: 'Projects', content: '# Q4 Roadmap', updatedAt: 20 },
      { id: '2', title: 'Hummus Recipe', folder: 'WIP', content: 'Chickpeas and tahini', updatedAt: 10 },
    ],
  });
  assert.match(context, /Personal workspace/);
  assert.match(context, /Roadmap/);
  assert.match(context, /Ship Kanban pills/);
  assert.match(context, /Hummus Recipe/);
});

test('AI provider HTTP errors include actionable status guidance and safely redact keys from provider error messages', async t => {
  const invalidModel = await provider(t, (_request, response) => json(response, {
    error: { message: 'The model `gpt-nonexistent` does not exist or you do not have access to it. Key sk-proj-1234567890abcdef session-key' },
  }, 404));
  await assert.rejects(generateAI({ ...invalidModel, apiKey: 'session-key' }, 'Prompt'), error => {
    assert.match(error.message, /404/);
    assert.match(error.message, /gpt-nonexistent/);
    assert.doesNotMatch(error.message, /sk-proj-1234567890abcdef|session-key/);
    return true;
  });
});

test('AI native desktop bridge preserves sanitized Electron IPC errors while redacting unknown secrets', async t => {
  const cases = [
    [
      new Error("Error invoking remote method 'desktop:generate-ai': Error: AI provider returned HTTP 401 (Unauthorized — invalid or expired API key). Check the endpoint, model and API key."),
      /HTTP 401.*invalid or expired API key/i,
    ],
    [
      new Error("Error invoking remote method 'desktop:generate-ai': Error: An AI request is already running. Finish or cancel it first."),
      /already running/i,
    ],
    [
      new Error("Error invoking remote method 'desktop:generate-ai': Error: AI request timed out after 120 seconds."),
      /timed out after 120 seconds/i,
    ],
  ];
  for (const [bridgeErr, expected] of cases) {
    const restore = nativeBridge(t, { generateAI: () => Promise.reject(bridgeErr), cancelAI() {} });
    try {
      await assert.rejects(generateAI({ ...config, apiKey: 'session-key' }, 'Prompt'), error => {
        assert.match(error.message, expected);
        assert.doesNotMatch(error.message, /Error invoking remote method|session-key/);
        return true;
      });
    } finally {
      restore();
    }
  }
});

test('AI retries transient HTTP 503 and 529 responses with bounded backoff and includes high-availability model fallback hint when retries exhaust', async t => {
  let attempts = 0;
  const recovering = await provider(t, (_request, response) => {
    attempts++;
    if (attempts < 3) {
      json(response, { error: { message: 'This model is currently experiencing high demand. Spikes in demand are usually temporary.' } }, attempts === 1 ? 503 : 529);
      return;
    }
    json(response, completion('Recovered after transient overload.'));
  });
  const reply = await generateAI({ ...recovering, model: 'gemini-4-hydrogen', apiKey: 'session-key' }, 'Prompt');
  assert.equal(reply, 'Recovered after transient overload.');
  assert.equal(attempts, 3);

  let failAttempts = 0;
  const overloaded = await provider(t, (_request, response) => {
    failAttempts++;
    json(response, { error: { message: 'This model is currently experiencing high demand.' } }, 503);
  });
  await assert.rejects(generateAI({ ...overloaded, model: 'gemini-4-hydrogen', apiKey: 'session-key' }, 'Prompt'), error => {
    assert.match(error.message, /503/);
    assert.match(error.message, /gemini-3\.5-flash-lite/i);
    assert.doesNotMatch(error.message, /session-key/);
    return true;
  });
  assert.equal(failAttempts, 3);
});

test('AI transient 503 backoff aborts promptly when cancelled mid-wait', async t => {
  const controller = new AbortController();
  let attempts = 0;
  const overloaded = await provider(t, (_request, response) => {
    attempts++;
    setTimeout(() => controller.abort(), 20);
    json(response, { error: { message: 'Overloaded' } }, 503);
  });
  await assert.rejects(generateAI(overloaded, 'Prompt', { signal: controller.signal }), { name: 'AbortError' });
  assert.equal(attempts, 1);
});

test('testAIConnection sends a minimal ping, returns model, bounded reply preview and latency, and rejects unconfigured remote endpoints', async t => {
  assert.equal(typeof testAIConnection, 'function');
  let received;
  const local = await provider(t, async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    received = JSON.parse(body);
    json(response, completion('  OK.\nExtra line that should collapse cleanly.  '));
  });
  const result = await testAIConnection(local);
  assert.equal(result.model, 'local-model');
  assert.equal(result.reply, 'OK. Extra line that should collapse cleanly.');
  assert.equal(Number.isInteger(result.latencyMs) && result.latencyMs >= 0, true);
  assert.equal(received.model, 'local-model');
  assert.equal(received.stream, false);
  assert.equal(received.messages.length, 1);
  assert.equal(received.messages[0].role, 'user');

  await assert.rejects(
    testAIConnection({ endpoint: 'https://api.openai.com/v1/chat/completions', model: 'gpt-6.1-sol', apiKey: '' }),
    /API key/i
  );
});
