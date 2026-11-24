(() => {
  const parameters = new URLSearchParams(location.search);
  const response = {
    type: 'herd-oauth-callback',
    state: parameters.get('state'),
    code: parameters.get('code'),
    error: parameters.get('error'),
  };
  // Remove the one-use authorization code before displaying any result.
  history.replaceState(null, '', location.pathname);
  if (!window.opener || window.opener.closed) {
    document.getElementById('status').textContent = 'The original NitroBison window is unavailable. Close this window and reconnect from NitroBison. Allow popups and keep both windows open.';
    return;
  }
  window.opener.postMessage(response, location.origin);
  document.getElementById('status').textContent = 'Response sent to NitroBison. This window will close after the security check; otherwise close it and reconnect.';
})();
