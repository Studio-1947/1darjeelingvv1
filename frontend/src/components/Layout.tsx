import React from 'react';
import { useTranslation } from 'react-i18next';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import BottomNav from '@/components/BottomNav';

export default function Layout({ children }) {
  const { t } = useTranslation();
  return (
    <div className="App min-h-screen flex flex-col bg-[var(--bg)]">
      {/* First thing in the tab order, hidden until it has focus. Without it a
          keyboard visitor tabbed through the brand, seven category circles, the
          language menu and sign-in before reaching the page - on every page
          (QA 5.3). `sr-only focus:not-sr-only` is the standard pairing: present
          for assistive tech, invisible to everyone else until it matters. */}
      <a
        href="#main"
        data-testid="skip-to-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60]
                   focus:px-4 focus:py-2.5 focus:rounded-full focus:bg-pine focus:text-white
                   focus:font-bold focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-white"
      >
        {t('a11y.skip_to_content')}
      </a>
      <Header />
      {/* tabIndex={-1} so the skip link can actually move focus here; browsers
          will not focus a plain <main> and the link would only scroll. */}
      <main id="main" tabIndex={-1} className="flex-1 pb-[var(--bottom-nav-h)] lg:pb-0 focus:outline-none">{children}</main>
      <Footer />
      <BottomNav />
    </div>
  );
}
