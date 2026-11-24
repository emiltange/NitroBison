import test from 'node:test';
import assert from 'node:assert/strict';
import { readAISettings, writeAISettings } from '../src/ai-settings.js';

const key = 'nitrobison-ai-config';
const config = { endpoint: 'https://example.com/v1/chat/completions', model: 'test-model', apiKey: 'approved-test-key' };
const empty = { endpoint: '', model: '', apiKey: '', remember: false };

function browserStorage(t, value = null) {
  const entries = new Map(value === null ? [] : [[key, value]]);
  const storage = {
    getItem: name => entries.get(name) ?? null,
    setItem: (name, value) => entries.set(name, String(value)),
    removeItem: name => entries.delete(name),
  };
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else delete globalThis.localStorage;
  });
  return storage;
}

test('absent AI settings default to empty session configuration', async t => {
  browserStorage(t);
  assert.deepEqual(await readAISettings(null), empty);
  assert.deepEqual(await readAISettings({ loadAISettings: async () => null }), empty);
});

test('explicit browser remembering reloads the validated configuration and approved key', async t => {
  const storage = browserStorage(t);
  assert.deepEqual(await writeAISettings(config, true, null), config);
  assert.deepEqual(JSON.parse(storage.getItem(key)), config);
  assert.deepEqual(await readAISettings(null), { ...config, remember: true });
  await writeAISettings({ ...config, apiKey: '' }, true, null);
  assert.deepEqual(await readAISettings(null), { ...config, apiKey: '', remember: true });
});

test('session choice removes saved browser settings and never retains the current key', async t => {
  const storage = browserStorage(t, JSON.stringify(config));
  assert.deepEqual(await writeAISettings({ ...config, apiKey: 'session-test-key' }, false, null), { ...config, apiKey: 'session-test-key' });
  assert.equal(storage.getItem(key), null);
  assert.deepEqual(await readAISettings(null), empty);
});

test('legacy public endpoint and model remain readable without claiming remembering consent', async t => {
  const legacy = { endpoint: config.endpoint, model: config.model };
  const storage = browserStorage(t, JSON.stringify(legacy));
  assert.deepEqual(await readAISettings(null), { ...legacy, apiKey: '', remember: false });
  assert.deepEqual(await readAISettings({ loadAISettings: async () => null }), { ...legacy, apiKey: '', remember: false });
  assert.deepEqual(JSON.parse(storage.getItem(key)), legacy);
});

test('native remembering stores only through its bridge and clears legacy storage after success', async t => {
  const storage = browserStorage(t, JSON.stringify({ endpoint: config.endpoint, model: config.model }));
  let saved = null;
  const bridge = { loadAISettings: async () => saved, saveAISettings: async value => { saved = structuredClone(value); } };
  await writeAISettings(config, true, bridge);
  assert.equal(storage.getItem(key), null);
  assert.deepEqual(await readAISettings(bridge), { ...config, remember: true });
  storage.setItem(key, JSON.stringify(config));
  await writeAISettings(config, false, bridge);
  assert.equal(storage.getItem(key), null);
  assert.deepEqual(await readAISettings(bridge), empty);
});

test('native write failures preserve both previous native settings and legacy public settings', async t => {
  const previous = { ...config, model: 'previous-model' };
  const legacy = JSON.stringify({ endpoint: config.endpoint, model: config.model });
  const storage = browserStorage(t, legacy);
  const bridge = { loadAISettings: async () => previous, saveAISettings: async () => { throw new Error('Native settings could not be saved.'); } };
  await assert.rejects(writeAISettings(config, true, bridge), /sav/i);
  assert.equal(storage.getItem(key), legacy);
  assert.deepEqual(await readAISettings(bridge), { ...previous, remember: true });
  await assert.rejects(writeAISettings(config, false, bridge), /sav/i);
  assert.equal(storage.getItem(key), legacy);
});

test('corrupt or unavailable settings fail visibly instead of silently falling back', async t => {
  const storage = browserStorage(t, '{broken');
  await assert.rejects(readAISettings(null), /settings|configuration/i);
  storage.setItem(key, JSON.stringify({ ...config, endpoint: 'http://remote.example.com' }));
  await assert.rejects(readAISettings(null), /settings|configuration|HTTPS/i);
  storage.setItem(key, JSON.stringify(config));
  await assert.rejects(readAISettings({ loadAISettings: async () => { throw new Error('Encrypted settings unavailable.'); } }), /unavailable/i);
  await assert.rejects(readAISettings({ loadAISettings: async () => ({ ...config, secret: 'extra' }) }), /settings|configuration/i);
  t.mock.method(storage, 'getItem', () => { throw new Error('Storage unavailable.'); });
  await assert.rejects(readAISettings(null), /settings|storage/i);
});

test('browser write and clear failures preserve previous stored configuration', async t => {
  const previous = JSON.stringify({ ...config, model: 'previous-model' });
  const storage = browserStorage(t, previous);
  t.mock.method(storage, 'setItem', () => { throw new Error('Quota exceeded.'); });
  await assert.rejects(writeAISettings(config, true, null), /sav|storage/i);
  assert.equal(storage.getItem(key), previous);
  t.mock.method(storage, 'removeItem', () => { throw new Error('Storage unavailable.'); });
  await assert.rejects(writeAISettings(config, false, null), /clear|sav|storage/i);
  assert.equal(storage.getItem(key), previous);
});

test('validation and explicit boolean lifetime are required before persisted settings change', async t => {
  const previous = JSON.stringify(config);
  const storage = browserStorage(t, previous);
  for (const remember of [undefined, null, 0, 1, 'true', {}, []]) {
    await assert.rejects(writeAISettings(config, remember, null), /remember|boolean/i);
  }
  await assert.rejects(writeAISettings({ ...config, apiKey: 'not a valid key' }, true, null));
  await assert.rejects(writeAISettings({ ...config, extra: true }, false, null));
  await assert.rejects(writeAISettings(config, true, {}), /desktop|native|bridge/i);
  assert.equal(storage.getItem(key), previous);
});
