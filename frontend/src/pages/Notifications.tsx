import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Seo from '@/components/Seo';
import { MobileScreen, Touch } from '@/components/mobile';

/**
 * Mobile-only Notifications / Activity page, matching RN's notifications.tsx
 * structurally - but RN's content is locally-seeded fake demo data, shown
 * even in RN's own "live" mode, and this app has no notification-generating
 * events wired anywhere (see the Phase 5 plan). Rather than port fabricated
 * content, this ships as a real, working, always-currently-empty inbox: a
 * genuine "mark all read" control and an honest empty state. Makes the
 * header bell (built in Phase 1) a real link instead of a dead one. Revisit
 * with real content once something generates notifications (e.g. booking-
 * status webhooks).
 */
export default function Notifications() {
  const { t } = useTranslation();
  const [allRead, setAllRead] = useState(true);

  return (
    <MobileScreen tone="light" className="lg:hidden min-h-screen pb-[calc(var(--bottom-nav-h)+1rem)]">
      <Seo title={t('mobileNotifications.title')} noindex />
      <div className="px-[var(--mu-gutter)] pt-6 flex items-center justify-between">
        <h1 className="font-[family-name:var(--mu-font-display)] font-black text-2xl text-[var(--mu-ink)] tracking-tight">
          {t('mobileNotifications.title')}
        </h1>
        <Touch
          onClick={() => setAllRead(true)}
          disabled={allRead}
          className="text-xs font-semibold disabled:opacity-40"
          style={{ color: 'var(--mu-green)' }}
        >
          {t('mobileNotifications.mark_all_read')}
        </Touch>
      </div>

      <div className="px-[var(--mu-gutter)] pt-16">
        <p className="text-center text-sm text-[var(--mu-text-muted)]">{t('mobileNotifications.empty')}</p>
      </div>
    </MobileScreen>
  );
}
