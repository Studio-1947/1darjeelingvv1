/* Paints the arrival splash (index.html #app-splash) in the person's own theme colour and mode before
 * any bundle runs. lib/theme.ts saves the resolved colour as "aangan-accent" whenever it applies a
 * theme, so this file needs no copy of the palette list. Nothing saved: index.html's defaults
 * (Mitti on white) show. A separate file, not inline, because the CSP is script-src 'self'. */
(function () {
  try {
    var s = document.documentElement.style;
    var accent = localStorage.getItem('aangan-accent');
    if (accent && /^#[0-9a-f]{6}$/i.test(accent)) s.setProperty('--splash-ink', accent);
    if (localStorage.getItem('aangan-mode') === 'dark') {
      s.setProperty('--splash-bg', '#131313');
      s.setProperty('--splash-sub', '#A8A8A8');
    }
  } catch (e) { /* private mode: defaults */ }
})();
