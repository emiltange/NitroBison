import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, net, protocol, safeStorage, session, shell } from 'electron';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_URL, isAppPage, serveApp } from './protocol.js';
import { authorize } from './auth.js';
import { directoryAccess, exportMarkdown, createFolderDirectory } from './files.js';
import { inspectDirectory, syncLinkedFolders } from './linked-folders.js';
import { generateAI, chatAI } from '../src/ai.js';
import { loadAISettings, saveAISettings } from './ai-settings.js';

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
app.enableSandbox();
app.setName('NitroBison');
// Keep this profile and app origin stable across upgrades; never borrow a browser profile.
app.setPath('userData', resolve(app.commandLine.getSwitchValue('user-data-dir') || join(app.getPath('appData'), 'NitroBison')));
app.setAppUserModelId('org.nitrobison.app');
let window;
let authorization;
let aiGeneration;
let fileWrites = Promise.resolve();
let pendingFileWrites = 0;
const windowsTitlebar = process.platform === 'win32';
const titlebarHeight = 66;

function serializeFileWrite(action) {
  pendingFileWrites++;
  const operation = fileWrites.then(action);
  fileWrites = operation.catch(() => {});
  return operation.finally(() => { pendingFileWrites--; });
}

async function directoryPath(value) {
  return (await directoryAccess(value)).root;
}

async function chooseFolder(title) {
  const result = await dialog.showOpenDialog(window, { title, properties: ['openDirectory'] });
  return result.canceled ? null : directoryPath(result.filePaths[0]);
}

function handle(channel, action) {
  ipcMain.handle(channel, (event, ...args) => {
    if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || !isAppPage(event.senderFrame.url)) throw new Error('Native access is restricted to the local application window.');
    return action(...args);
  });
}

function titlebarColors(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value)) || Object.keys(value).length !== 2 || Object.keys(value).some(key => key !== 'color' && key !== 'symbolColor') || ![value.color, value.symbolColor].every(color => typeof color === 'string' && color.length === 7 && /^#[0-9a-f]{6}$/i.test(color))) throw new Error('Invalid title bar colors.');
  return { color: value.color, symbolColor: value.symbolColor, height: titlebarHeight };
}

function openExternal(url) {
  try {
    const parsed = new URL(url);
    if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password || url.length > 8192) return;
    void shell.openExternal(parsed.href).catch(() => dialog.showErrorBox('Cannot open link', 'Open this HTTP or HTTPS address in your browser.'));
  } catch { /* Invalid navigation remains blocked. */ }
}

async function createWindow() {
  const darkTheme = nativeTheme.shouldUseDarkColors;
  const win = new BrowserWindow({
    width: 1360, height: 900, minWidth: 390, minHeight: 540, title: 'NitroBison',
    backgroundColor: darkTheme ? '#1e3434' : '#f3f0e8', icon: join(app.getAppPath(), 'dist/icon-512.png'), show: true,
    ...(windowsTitlebar ? { titleBarStyle: 'hidden', titleBarOverlay: { color: darkTheme ? '#2f4f4f' : '#fffefa', symbolColor: darkTheme ? '#f6efdf' : '#252621', height: titlebarHeight } } : {}),
    webPreferences: { preload: fileURLToPath(new URL('./preload.cjs', import.meta.url)), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, webviewTag: false },
  });
  window = win;
  win.webContents.once('did-finish-load', async () => {
    if (!windowsTitlebar || win.isDestroyed()) return;
    try {
      const colors = await win.webContents.executeJavaScript(`(() => { const style = getComputedStyle(document.documentElement); return { color: style.getPropertyValue('--card').trim(), symbolColor: style.getPropertyValue('--ink').trim() }; })()`);
      if (!win.isDestroyed()) win.setTitleBarOverlay(titlebarColors(colors));
    } catch (error) { console.error('Cannot match the native title bar to the startup theme.', error); }
  });
  win.webContents.setWindowOpenHandler(({ url }) => { openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', event => { if (!isAppPage(event.url)) { event.preventDefault(); openExternal(event.url); } });
  win.webContents.on('will-redirect', event => event.preventDefault());
  win.webContents.on('will-attach-webview', event => event.preventDefault());
  win.webContents.on('will-prevent-unload', () => {
    void dialog.showMessageBox(win, { type: 'warning', title: 'Your notes need saving', message: 'NitroBison is staying open to protect unsaved changes.', detail: 'Wait for saving to finish, or retry the failed save before closing the app.', buttons: ['Keep editing'] });
  });
  win.on('close', event => {
    if (!pendingFileWrites) return;
    event.preventDefault();
    void dialog.showMessageBox(win, { type: 'warning', title: 'Device data is saving', message: 'Wait for device settings and linked-folder saving to finish before closing.', detail: 'Your local notes remain in NitroBison. Any device-saving error will be shown in the workspace.', buttons: ['Keep editing'] });
  });
  win.on('closed', () => { authorization?.abort(new Error('Sign-in cancelled because the application window closed.')); aiGeneration?.abort(); window = null; });
  try { await win.loadURL(APP_URL); }
  catch { dialog.showErrorBox('Cannot open NitroBison', 'The bundled application could not load. Run npm run build before npm run desktop, or reinstall a complete package. Your saved notes have not been removed.'); app.quit(); }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.show(); window.focus(); } });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
  app.on('activate', () => { if (!window && app.isReady()) void createWindow(); });
  app.on('before-quit', () => { authorization?.abort(new Error('Sign-in cancelled.')); aiGeneration?.abort(); });
  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    session.defaultSession.setDevicePermissionHandler(() => false);
    protocol.handle('app', request => serveApp(request, join(app.getAppPath(), 'dist')));
    handle('desktop:set-titlebar-colors', colors => {
      const overlay = titlebarColors(colors);
      if (!windowsTitlebar) return false;
      window.setTitleBarOverlay(overlay);
      return true;
    });
    handle('desktop:choose-directory', () => chooseFolder('Choose a local folder location'));
    handle('desktop:create-folder-directory', (directory, folder) => serializeFileWrite(() => createFolderDirectory(directory, folder, app.getPath('userData'))));
    handle('desktop:inspect-directory', directory => inspectDirectory(directory));
    handle('desktop:sync-linked-folders', (snapshot, bindings) => serializeFileWrite(() => syncLinkedFolders(snapshot, bindings, app.getPath('userData'))));
    handle('desktop:open-directory', async value => {
      const error = await shell.openPath(await directoryPath(value));
      if (error) throw new Error('The local folder could not be opened. Check that it still exists and you have permission.');
    });
    handle('desktop:export-markdown', async snapshot => {
      const directory = await chooseFolder('Export Markdown — choose a destination folder');
      return directory === null ? null : serializeFileWrite(() => exportMarkdown(snapshot, directory));
    });
    handle('desktop:authorize', async config => {
      if (authorization) throw new Error('A cloud sign-in is already pending. Finish or cancel it first.');
      const controller = new AbortController();
      authorization = controller;
      try { return await authorize(config, { openExternal: url => shell.openExternal(url), signal: controller.signal }); }
      finally { if (authorization === controller) authorization = null; }
    });
    handle('desktop:cancel-authorization', () => { authorization?.abort(new Error('Cloud sign-in was cancelled.')); });
    handle('desktop:load-ai-settings', () => fileWrites.then(() => loadAISettings(app.getPath('userData'), safeStorage)));
    handle('desktop:save-ai-settings', config => serializeFileWrite(() => saveAISettings(config, app.getPath('userData'), safeStorage)));
    handle('desktop:generate-ai', async input => {
      if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['config', 'prompt', 'messages'].includes(key))) throw new Error('Invalid AI request.');
      const hasPrompt = Object.hasOwn(input, 'prompt');
      const hasMessages = Object.hasOwn(input, 'messages');
      if (hasPrompt === hasMessages) throw new Error('Invalid AI request.');
      if (aiGeneration) aiGeneration.abort();
      const controller = new AbortController();
      aiGeneration = controller;
      try {
        return hasMessages
          ? await chatAI(input.config, input.messages, { signal: controller.signal, fetch: net.fetch })
          : await generateAI(input.config, input.prompt, { signal: controller.signal, fetch: net.fetch });
      } finally { if (aiGeneration === controller) aiGeneration = null; }
    });
    handle('desktop:cancel-ai', () => { aiGeneration?.abort(); });
    handle('desktop:confirm-google-vault', async () => {
      const result = await dialog.showMessageBox(window, {
        type: 'warning', title: 'Create a separate Google vault?', buttons: ['Cancel', 'Create new cloud vault'], defaultId: 0, cancelId: 0, noLink: true,
        message: 'No existing NitroBison vault is visible to this desktop client.',
        detail: 'A Google Desktop client may not see a vault authorized by the web client, even in the same project. Cancel and export a JSON backup from the web app first if you already use it. Create only if you intentionally want a new cloud vault; this does not merge an invisible web copy.',
      });
      return result.response === 1;
    });
    await createWindow();
  }).catch(error => { dialog.showErrorBox('Cannot start NitroBison', error.message); app.quit(); });
}
