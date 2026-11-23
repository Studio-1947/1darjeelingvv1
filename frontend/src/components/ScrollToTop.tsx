import { useEffect, useLayoutEffect, useState } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';
import { ArrowUp } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';

// Route changes should land at the top of the new page. Back/forward (POP) is
// left alone so the browser can restore the previous scroll position.
export default function ScrollToTop() {
  const { t } = useTranslation();
  const { pathname, search, hash } = useLocation();
  const navigationType = useNavigationType();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const update = () => setVisible(window.scrollY > 420);
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);

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

  // Listing pages and the business profile keep their own bar at the bottom of a phone screen
  // (price + directions, save + preview); the round button would sit on top of it there.
  const ownBottomBar = /^\/(listing|stay|business)\/|^\/provider\//.test(pathname);

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label={t('ui.scrollToTop.back_to_top')}
      title={t('ui.scrollToTop.back_to_top')}
      data-testid="back-to-top"
      className={`fixed bottom-[calc(var(--bottom-nav-h)+1rem)] right-4 z-40 grid h-12 w-12 place-items-center rounded-full border-2 border-[var(--surface)] bg-[var(--r)] text-[var(--on-r)] shadow-[0_6px_20px_rgb(0_0_0/.35)] transition-all duration-200 hover:bg-[var(--r-press)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--r)] focus-visible:ring-offset-2 lg:bottom-6 ${ownBottomBar ? 'max-lg:hidden ' : ''}${visible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-3 opacity-0'}`}
    >
      <ArrowUp size={20} weight="bold" aria-hidden="true" />
    </button>
  );
}
