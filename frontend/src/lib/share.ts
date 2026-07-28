/** Outcome of a share attempt, so callers can show the right feedback. */
export type ShareOutcome = 'shared' | 'copied' | 'failed';

/**
 * Copy fallback for browsers that don't hand us `navigator.clipboard`.
 *
 * Both the Web Share API and the async clipboard are gated on a secure context,
 * so on a phone hitting the dev server over plain http (or any non-HTTPS host)
 * they are simply undefined - which is why sharing looked dead on mobile while
 * working on desktop localhost. The deprecated execCommand path has no such
 * requirement, so it covers exactly that gap.
 */
function legacyCopy(text: string): boolean {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    // Keep it off-screen and non-focusable-looking, but still selectable:
    // display:none or visibility:hidden would make the selection a no-op.
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length); // iOS ignores select() on its own
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/**
 * Share a link: the native sheet where it exists, otherwise the clipboard.
 * Never throws - the outcome is the return value.
 */
export async function shareLink({ title, text, url }: {
  title?: string;
  text?: string;
  url: string;
}): Promise<ShareOutcome> {
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return 'shared';
    } catch (e: any) {
      // Dismissing the sheet is a deliberate cancel, not a failure - don't fall
      // through and copy the link behind the visitor's back.
      if (e?.name === 'AbortError') return 'shared';
    }
  }

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(url);
      return 'copied';
    } catch {
      // Fall through to the legacy path below.
    }
  }

  return legacyCopy(url) ? 'copied' : 'failed';
}
