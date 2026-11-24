import fs from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { validateAIConfig } from '../src/ai.js';

const settingsFile = userData => join(userData, 'ai-settings.enc');

async function requireEncryption(safeStorage) {
  try {
    const available = await safeStorage.isAsyncEncryptionAvailable();
    const backend = typeof safeStorage.getSelectedStorageBackend === 'function' ? safeStorage.getSelectedStorageBackend() : null;
    if (available && backend !== 'basic_text') return;
  } catch { /* A locked or unavailable OS key store must never become plaintext storage. */ }
  throw new Error('Secure OS encryption is unavailable. Use session-only AI settings or enable the operating-system key store.');
}

export async function loadAISettings(userData, safeStorage) {
  let encrypted;
  try { encrypted = await fs.readFile(settingsFile(userData)); }
  catch (error) {
    if (error.code === 'ENOENT') return null;
    throw new Error('Remembered AI settings could not be read from device storage; stored data was preserved.');
  }
  await requireEncryption(safeStorage);
  try {
    const { result } = await safeStorage.decryptStringAsync(encrypted);
    return validateAIConfig(JSON.parse(result));
  } catch {
    throw new Error('Remembered AI settings could not be decrypted or the configuration is corrupt; stored data was preserved.');
  }
}

export async function saveAISettings(config, userData, safeStorage) {
  const file = settingsFile(userData);
  if (config === null) {
    try { await fs.unlink(file); }
    catch (error) {
      if (error.code !== 'ENOENT') throw new Error('Remembered AI settings could not be cleared; previous settings were preserved.');
    }
    return null;
  }
  const checked = validateAIConfig(config);
  await requireEncryption(safeStorage);
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    const encrypted = await safeStorage.encryptStringAsync(JSON.stringify(checked));
    await fs.mkdir(userData, { recursive: true, mode: 0o700 });
    const handle = await fs.open(temporary, 'wx', 0o600);
    try { await handle.writeFile(encrypted); await handle.sync(); }
    finally { await handle.close(); }
    await fs.rename(temporary, file);
  } catch {
    try { await fs.unlink(temporary); } catch { /* The previous settings file remains untouched. */ }
    throw new Error('AI settings could not be saved to encrypted device storage; previous settings were preserved. Check the OS key store and disk permissions.');
  }
  return checked;
}
