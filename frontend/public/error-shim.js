// Suppresses a benign DataCloneError some browsers raise when structured-cloning a
// PerformanceServerTiming entry. Cosmetic — it only stops the console filling with an error the
// app cannot act on.
//
// This lives in its own file rather than inline in index.html so that the Content-Security-Policy
// in deploy/nginx/app.conf can stay strict. As an inline <script> it was blocked outright by
// `script-src 'self'`, and the alternatives were worse: `'unsafe-inline'` would have re-opened the
// door to injected scripts, and a `'sha256-...'` hash would silently break the moment anyone
// edited this line. A separate file is covered by 'self' and needs no maintenance.
//
// Loaded synchronously in <head>, ahead of the deferred app bundle, so it is listening before
// anything else can throw.
window.addEventListener(
  'error',
  function (e) {
    if (
      e.error instanceof DOMException &&
      e.error.name === 'DataCloneError' &&
      e.message &&
      e.message.includes('PerformanceServerTiming')
    ) {
      e.stopImmediatePropagation();
      e.preventDefault();
    }
  },
  true
);
