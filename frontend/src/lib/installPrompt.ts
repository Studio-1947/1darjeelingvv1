/**
 * Installing the website as an app (the Get-the-app sheet, components/AppComingSoon.tsx).
 *
 * Chrome and Edge fire `beforeinstallprompt` once, early, usually long before anyone opens the
 * sheet, so it is caught here when the app starts (imported from index.tsx) and kept until used.
 * Safari never fires it: an iPhone installs by hand, from the Share menu.
 */

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

let deferred: InstallPrompt | null = null;
let installed = false;
const listeners = new Set<() => void>();
const ping = () => listeners.forEach((f) => f());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPrompt;
    ping();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    deferred = null;
    ping();
  });
}

/** Re-render when the prompt arrives or the app gets installed. Returns the unsubscribe. */
export function onInstallChange(f: () => void): () => void {
  listeners.add(f);
  return () => { listeners.delete(f); };
}

export const canPromptInstall = () => deferred !== null;
export const justInstalled = () => installed;

/** Opened from the installed app (home-screen icon), not a browser tab. */
export const isStandalone = () =>
  typeof window !== 'undefined' &&
  ((window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true);

/** Shows the browser's own install dialog. Usable once; the browser decides when it offers another. */
export function promptInstall(): void {
  const p = deferred;
  if (!p) return;
  deferred = null;
  p.prompt().catch(() => {});
  p.userChoice
    .then((c) => { if (c.outcome === 'accepted') installed = true; ping(); })
    .catch(() => ping());
}
