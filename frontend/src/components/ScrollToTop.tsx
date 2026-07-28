import { useLayoutEffect } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

// Route changes should land at the top of the new page. Back/forward (POP) is
// left alone so the browser can restore the previous scroll position.
export default function ScrollToTop() {
  const { pathname, search, hash } = useLocation();
  const navigationType = useNavigationType();

  useLayoutEffect(() => {
    if (navigationType === 'POP') return;

    if (hash) {
      // A hash isn't guaranteed to be a valid selector, and pages that load
      // their content asynchronously won't have the target yet - both cases
      // fall through to the top, and the page scrolls itself once it's ready.
      let el: Element | null = null;
      try { el = document.querySelector(hash); } catch { /* not a selector */ }
      if (el) {
        el.scrollIntoView();
        return;
      }
    }

    window.scrollTo(0, 0);
  }, [pathname, search, hash, navigationType]);

  return null;
}
