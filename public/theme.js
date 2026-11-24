(() => {
  let preference = 'system';
  try { preference = localStorage.getItem('herd-theme') || 'system'; } catch {}
  const theme = ['light', 'dark'].includes(preference) ? preference : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme;
})();
