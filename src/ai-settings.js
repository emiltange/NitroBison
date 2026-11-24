import { validateAIConfig } from './ai.js';

const STORAGE_KEY = 'nitrobison-ai-config';
const emptySettings = () => ({ endpoint: '', model: '', apiKey: '', remember: false });

function browserSettings() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === null) return null;
    const config = JSON.parse(value);
    return { ...validateAIConfig(config), remember: Object.hasOwn(config, 'apiKey') };
  } catch {
    throw new Error('Stored AI settings could not be loaded. Browser storage may be unavailable or the configuration may be corrupt; stored data was preserved.');
  }
}

export async function readAISettings(bridge = null) {
  if (bridge !== null) {
    if (typeof bridge.loadAISettings !== 'function') throw new Error('The desktop bridge cannot load AI settings. Update or reinstall the desktop app.');
    let saved;
    try { saved = await bridge.loadAISettings(); }
    catch { throw new Error('Remembered AI settings could not be loaded from secure desktop storage. Encryption may be unavailable or stored data may be corrupt.'); }
    if (saved !== null) {
      try { return { ...validateAIConfig(saved), remember: true }; }
      catch { throw new Error('Stored desktop AI configuration is invalid; stored data was preserved.'); }
    }
    const legacy = browserSettings();
    return legacy ? { ...legacy, remember: false } : emptySettings();
  }
  return browserSettings() || emptySettings();
}

export async function writeAISettings(config, remember, bridge = null) {
  if (typeof remember !== 'boolean') throw new Error('Remember AI settings must be an explicit boolean choice.');
  const checked = validateAIConfig(config);
  if (bridge !== null) {
    if (typeof bridge.saveAISettings !== 'function') throw new Error('The desktop bridge cannot save AI settings. Update or reinstall the desktop app.');
    try { await bridge.saveAISettings(remember ? checked : null); }
    catch { throw new Error('AI settings could not be saved in secure desktop storage. Check OS encryption and disk permissions; previous device settings were preserved.'); }
    try { localStorage.removeItem(STORAGE_KEY); }
    catch { throw new Error('Device AI settings were updated, but legacy browser settings could not be cleared. Retry before closing the app.'); }
  } else {
    try {
      if (remember) localStorage.setItem(STORAGE_KEY, JSON.stringify(checked));
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      throw new Error('AI settings could not be saved or cleared in browser storage; previous settings were preserved.');
    }
  }
  return checked;
}
