const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nitrobisonDesktop', Object.freeze({
  isDesktop: true,
  hasNativeTitlebar: process.platform === 'win32',
  setTitlebarColors: colors => ipcRenderer.invoke('desktop:set-titlebar-colors', colors),
  chooseDirectory: () => ipcRenderer.invoke('desktop:choose-directory'),
  createFolderDirectory: (directory, folder) => ipcRenderer.invoke('desktop:create-folder-directory', directory, folder),
  inspectDirectory: directory => ipcRenderer.invoke('desktop:inspect-directory', directory),
  syncLinkedFolders: (snapshot, bindings) => ipcRenderer.invoke('desktop:sync-linked-folders', snapshot, bindings),
  openDirectory: path => ipcRenderer.invoke('desktop:open-directory', path),
  exportMarkdown: snapshot => ipcRenderer.invoke('desktop:export-markdown', snapshot),
  authorize: config => ipcRenderer.invoke('desktop:authorize', config),
  cancelAuthorization: () => ipcRenderer.invoke('desktop:cancel-authorization'),
  confirmGoogleVaultCreation: () => ipcRenderer.invoke('desktop:confirm-google-vault'),
  loadAISettings: () => ipcRenderer.invoke('desktop:load-ai-settings'),
  saveAISettings: config => ipcRenderer.invoke('desktop:save-ai-settings', config),
  generateAI: input => ipcRenderer.invoke('desktop:generate-ai', input),
  cancelAI: () => ipcRenderer.invoke('desktop:cancel-ai'),
}));
