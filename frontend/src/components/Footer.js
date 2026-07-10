import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Heart, Mail } from 'lucide-react';

export default function Footer() {
  const { t } = useTranslation();
  return (
    <footer className="mt-16 md:mt-24 border-t border-[var(--line)] bg-white" data-testid="site-footer">
      <div className="mx-auto max-w-7xl px-4 md:px-8 py-10 md:py-14 grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-10">
        <div className="col-span-2 md:col-span-1">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-9 h-9 rounded-xl bg-pine text-white grid place-items-center font-display font-extrabold">১</div>
            <div className="font-display font-extrabold text-lg text-ink">{t('brand')}</div>
          </div>
          <p className="text-sm text-ink-soft leading-relaxed">{t('brand_tagline')}</p>
          <p className="mt-4 text-xs text-ink-soft flex items-center gap-1"><Heart size={12} className="text-flag" /> {t('footer.made')}</p>
        </div>
        <div>
          <h4 className="font-display font-bold text-sm mb-3 text-ink">{t('nav.discover')}</h4>
          <ul className="space-y-2 text-sm text-ink-soft">
            <li><Link to="/spots">{t('nav.spots')}</Link></li>
            <li><Link to="/homestays">{t('nav.homestays')}</Link></li>
            <li><Link to="/drivers">{t('nav.drivers')}</Link></li>
            <li><Link to="/cafes">{t('nav.cafes')}</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="font-display font-bold text-sm mb-3 text-ink">Darjeeling</h4>
          <ul className="space-y-2 text-sm text-ink-soft">
            <li><Link to="/events">{t('nav.events')}</Link></li>
            <li><Link to="/biodiversity">{t('nav.biodiversity')}</Link></li>
            <li><Link to="/responsible">{t('nav.responsible')}</Link></li>
            <li><Link to="/provider/onboard">{t('nav.provider')}</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="font-display font-bold text-sm mb-3 text-ink">Legal</h4>
          <ul className="space-y-2 text-sm text-ink-soft">
            <li><Link to="/privacy">{t('nav.privacy')}</Link></li>
            <li className="flex items-center gap-1"><Mail size={12} /> hello@1darjeeling.in</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-[var(--line)] py-5 text-center text-xs text-ink-soft">© 2026 {t('brand')}. {t('footer.rights')}.</div>
    </footer>
  );
}
