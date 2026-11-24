import './titlebar.css';

let themeObserver;

export function mountTitlebar(nativeDesktop) {
  if (!nativeDesktop?.isDesktop || !nativeDesktop.hasNativeTitlebar) return;
  const root = document.documentElement;
  root.classList.add('native-titlebar');
  themeObserver?.disconnect();
  const updateColors = () => {
    const style = getComputedStyle(root);
    const color = style.getPropertyValue('--card').trim();
    const symbolColor = style.getPropertyValue('--ink').trim();
    void nativeDesktop.setTitlebarColors({ color, symbolColor }).catch(error => {
      console.error('Cannot match the native title bar to the workspace theme.', error);
    });
  };
  updateColors();
  themeObserver = new MutationObserver(updateColors);
  themeObserver.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
}
