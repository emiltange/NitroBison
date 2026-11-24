let prompt;
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  prompt = event;
});

export async function registerOffline(onStatus = () => {}) {
  if (window.nitrobisonDesktop?.isDesktop) { onStatus('Ready offline · bundled desktop app'); return; }
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;
  try {
    const registration = await navigator.serviceWorker.register('/sw.js');
    const report = () => {
      if (registration.waiting) onStatus('Update downloaded. Close all NitroBison tabs and app windows, then reopen. Your notes stay on this device.');
      else if (registration.active) onStatus('Ready offline');
      else onStatus('Preparing offline files…');
    };
    report();
    const watch = () => registration.installing?.addEventListener('statechange', report);
    watch();
    registration.addEventListener('updatefound', watch);
    navigator.serviceWorker.ready.then(report);
  } catch (error) {
    onStatus(`Offline files unavailable: ${error.message}`);
  }
}

export async function installApp() {
  if (window.nitrobisonDesktop?.isDesktop) return 'NitroBison is running as a desktop app. The interface and diagrams are bundled for offline use. Browser notes use a separate profile: export a JSON backup from the browser, then restore it here. Updates are manual; download and install a newer release without deleting app data.';
  if (window.matchMedia('(display-mode: standalone)').matches) return 'NitroBison is already running as an installed app.';
  if (prompt) {
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    prompt = undefined;
    return outcome === 'accepted' ? 'NitroBison was installed.' : 'Installation cancelled. Your notes remain on this device.';
  }
  return 'Use your browser’s Install app menu (Chrome/Edge), or Add to Dock / Add to Home Screen (Safari). Installation requires HTTPS or localhost. Open NitroBison once online and wait for “Ready offline” before disconnecting.';
}
