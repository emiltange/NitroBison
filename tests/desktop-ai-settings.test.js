import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { loadAISettings, saveAISettings } from '../desktop/ai-settings.js';

const config = { endpoint: 'https://example.com/v1/chat/completions', model: 'test-model', apiKey: 'approved-test-key' };

// Electron's main-process OS key store cannot run inside Node's test runner.
function encryptionProvider() {
  const key = randomBytes(32);
  return {
    isAsyncEncryptionAvailable: async () => true,
    getSelectedStorageBackend: () => 'gnome_libsecret',
    encryptStringAsync: async value => {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
    },
    decryptStringAsync: async value => {
      const decipher = createDecipheriv('aes-256-gcm', key, value.subarray(0, 12));
      decipher.setAuthTag(value.subarray(12, 28));
      return { result: Buffer.concat([decipher.update(value.subarray(28)), decipher.final()]).toString('utf8'), shouldReEncrypt: false };
    },
  };
}

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nitrobison-ai-settings-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return { root, file: path.join(root, 'ai-settings.enc'), encryption: encryptionProvider() };
}

test('remembered native settings reload from a private encrypted file without plaintext credentials', async t => {
  const { root, file, encryption } = await fixture(t);
  assert.equal(await loadAISettings(root, encryption), null);
  await saveAISettings(config, root, encryption);
  assert.deepEqual(await loadAISettings(root, encryption), config);
  const bytes = await fs.readFile(file);
  assert.equal(bytes.includes(Buffer.from(config.apiKey)), false);
  assert.equal(bytes.includes(Buffer.from(config.endpoint)), false);
  assert.equal(bytes.includes(Buffer.from(config.model)), false);
  if (process.platform !== 'win32') assert.equal((await fs.stat(file)).mode & 0o777, 0o600);
  assert.deepEqual(await fs.readdir(root), ['ai-settings.enc']);
  await saveAISettings({ ...config, apiKey: '' }, root, encryption);
  assert.deepEqual(await loadAISettings(root, encryption), { ...config, apiKey: '' });
});

test('native null clears saved settings even when encryption becomes unavailable', async t => {
  const { root, encryption } = await fixture(t);
  await saveAISettings(config, root, encryption);
  t.mock.method(encryption, 'isAsyncEncryptionAvailable', async () => false);
  await saveAISettings(null, root, encryption);
  assert.equal(await loadAISettings(root, encryption), null);
  await saveAISettings(null, root, encryption);
  assert.deepEqual(await fs.readdir(root), []);
});

test('unavailable encryption and Linux basic_text never write insecure settings or replace old settings', async t => {
  const { root, file, encryption } = await fixture(t);
  await saveAISettings(config, root, encryption);
  const previous = await fs.readFile(file);
  const unavailable = { ...encryption, isAsyncEncryptionAvailable: async () => false };
  const basicText = { ...encryption, getSelectedStorageBackend: () => 'basic_text' };
  for (const provider of [unavailable, basicText]) {
    await assert.rejects(saveAISettings({ ...config, apiKey: 'new-test-key' }, root, provider), /encryption|secure|storage/i);
    await assert.rejects(loadAISettings(root, provider), /encryption|secure|storage/i);
    assert.deepEqual(await fs.readFile(file), previous);
  }
});

test('corrupt ciphertext or invalid decrypted configuration surfaces instead of fake empty settings', async t => {
  const { root, file, encryption } = await fixture(t);
  await fs.writeFile(file, 'not encrypted');
  await assert.rejects(loadAISettings(root, encryption), /settings|decrypt|corrupt/i);
  for (const value of ['{invalid', 'null', JSON.stringify({ ...config, extra: true }), JSON.stringify({ ...config, endpoint: 'http://remote.example.com' })]) {
    const bytes = await encryption.encryptStringAsync(value);
    await fs.writeFile(file, bytes);
    await assert.rejects(loadAISettings(root, encryption), /settings|configuration|decrypt|corrupt/i);
    assert.deepEqual(await fs.readFile(file), bytes);
  }
});

test('native boundary validation rejects invalid payloads without touching previous settings', async t => {
  const { root, file, encryption } = await fixture(t);
  await saveAISettings(config, root, encryption);
  const previous = await fs.readFile(file);
  for (const value of [undefined, [], 'config', { ...config, extra: true }, { ...config, apiKey: 'bad key' }]) {
    await assert.rejects(saveAISettings(value, root, encryption));
    assert.deepEqual(await fs.readFile(file), previous);
  }
});

test('failed encryption preserves the previous file and does not expose credentials in errors', async t => {
  const { root, file, encryption } = await fixture(t);
  await saveAISettings(config, root, encryption);
  const previous = await fs.readFile(file);
  t.mock.method(encryption, 'encryptStringAsync', async () => { throw new Error(`Cannot encrypt ${config.apiKey}`); });
  await assert.rejects(saveAISettings(config, root, encryption), error => {
    assert.match(error.message, /settings|encrypt/i);
    assert.doesNotMatch(error.message, /approved-test-key/);
    return true;
  });
  assert.deepEqual(await fs.readFile(file), previous);
  assert.deepEqual(await fs.readdir(root), ['ai-settings.enc']);
});

test('interrupted private writes preserve previous configuration and remove temporary ciphertext', async t => {
  const { root, file, encryption } = await fixture(t);
  await saveAISettings(config, root, encryption);
  const previous = await fs.readFile(file);
  const open = fs.open.bind(fs);
  t.mock.method(fs, 'open', async (target, flags, ...rest) => {
    const handle = await open(target, flags, ...rest);
    if (String(target).endsWith('.tmp')) {
      const write = handle.writeFile.bind(handle);
      t.mock.method(handle, 'writeFile', async bytes => {
        await write(bytes.subarray(0, 3));
        throw Object.assign(new Error('Interrupted write.'), { code: 'EIO' });
      });
    }
    return handle;
  });
  await assert.rejects(saveAISettings({ ...config, apiKey: 'new-test-key' }, root, encryption), /sav|settings|write/i);
  assert.deepEqual(await fs.readFile(file), previous);
  assert.deepEqual(await loadAISettings(root, encryption), config);
  assert.deepEqual(await fs.readdir(root), ['ai-settings.enc']);
});

test('failed atomic replacement preserves previous configuration and removes temporary ciphertext', async t => {
  const { root, file, encryption } = await fixture(t);
  await saveAISettings(config, root, encryption);
  const previous = await fs.readFile(file);
  t.mock.method(fs, 'rename', async () => { throw Object.assign(new Error('Cannot replace file.'), { code: 'EACCES' }); });
  await assert.rejects(saveAISettings({ ...config, model: 'new-model' }, root, encryption), /sav|settings|write/i);
  assert.deepEqual(await fs.readFile(file), previous);
  assert.deepEqual(await loadAISettings(root, encryption), config);
  assert.deepEqual(await fs.readdir(root), ['ai-settings.enc']);
});

test('failed native clearing preserves the saved configuration', async t => {
  const { root, file, encryption } = await fixture(t);
  await saveAISettings(config, root, encryption);
  const previous = await fs.readFile(file);
  t.mock.method(fs, 'unlink', async () => { throw Object.assign(new Error('Cannot delete file.'), { code: 'EACCES' }); });
  await assert.rejects(saveAISettings(null, root, encryption), /clear|settings|sav/i);
  assert.deepEqual(await fs.readFile(file), previous);
  assert.deepEqual(await loadAISettings(root, encryption), config);
});
