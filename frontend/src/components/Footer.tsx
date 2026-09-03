import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Heart, Mail } from 'lucide-react';
import Logo from '@/components/Logo';

export default function Footer() {
  const { t } = useTranslation();
  return (
    <footer className="mt-16 md:mt-24 border-t border-[var(--line)] bg-white pb-20 lg:pb-0" data-testid="site-footer">
      {/* Every column heading was an <h4> under a page <h1>, so the outline read
          H1 → H4 → H4 → H4 with H2 and H3 skipped entirely (QA 5.2). They are the
          top-level sections of the footer, so h2 is the honest level; the visual
          size is set by the class and is unchanged. */}
      <div className="mx-auto max-w-7xl px-4 md:px-8 py-10 md:py-14 grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-10">
        <div className="col-span-2 md:col-span-1">
          <div className="flex items-center gap-2 mb-3">
            <Logo className="w-9 h-9" />
            <div>
              <div className="font-display font-extrabold text-lg text-ink">{t('brand')}</div>
              <div className="text-[10px] font-semibold tracking-wide text-ink-soft">By studio 1947</div>
            </div>
          </div>
          <p className="text-sm text-ink-soft leading-relaxed">{t('brand_tagline')}</p>
          <p className="mt-4 text-xs text-ink-soft flex items-center gap-1"><Heart size={12} className="text-flag" /> {t('footer.made')}</p>
        </div>
        <div>
          <h2 className="font-display font-bold text-sm mb-3 text-ink">{t('nav.discover')}</h2>
          <ul className="space-y-2 text-sm text-ink-soft">
            <li><Link to="/spots" className="hover:text-pine transition-colors">{t('nav.spots')}</Link></li>
            <li><Link to="/homestays" className="hover:text-pine transition-colors">{t('nav.homestays')}</Link></li>
            <li><Link to="/drivers" className="hover:text-pine transition-colors">{t('nav.drivers')}</Link></li>
            <li><Link to="/cafes" className="hover:text-pine transition-colors">{t('nav.cafes')}</Link></li>
          </ul>
        </div>
        <div>
          <h2 className="font-display font-bold text-sm mb-3 text-ink">{t('footer.darjeeling')}</h2>
          <ul className="space-y-2 text-sm text-ink-soft">
            <li><Link to="/events" className="hover:text-pine transition-colors">{t('nav.events')}</Link></li>
            <li><Link to="/biodiversity" className="hover:text-pine transition-colors">{t('nav.biodiversity')}</Link></li>
            <li><Link to="/responsible" className="hover:text-pine transition-colors">{t('nav.responsible')}</Link></li>
            <li><Link to="/about" className="hover:text-pine transition-colors">{t('nav.about')}</Link></li>
            <li><Link to="/provider/onboard" className="hover:text-pine transition-colors">{t('nav.provider')}</Link></li>
          </ul>
        </div>
        <div>
          <h2 className="font-display font-bold text-sm mb-3 text-ink">{t('footer.legal')}</h2>
          <ul className="space-y-2 text-sm text-ink-soft">
            <li><Link to="/privacy" className="hover:text-pine transition-colors">{t('nav.privacy')}</Link></li>
            <li><Link to="/terms" className="hover:text-pine transition-colors">{t('nav.terms')}</Link></li>
            <li><Link to="/refunds" className="hover:text-pine transition-colors">{t('nav.refunds')}</Link></li>
            <li><Link to="/contact" className="hover:text-pine transition-colors">{t('nav.contact')}</Link></li>
            <li><Link to="/delete-account" className="hover:text-pine transition-colors">{t('nav.delete_account')}</Link></li>
            <li className="flex items-center gap-1 mt-2 text-ink/80 font-medium"><Mail size={12} className="text-pine flex-shrink-0" /> 1darjeelingapp@gmail.com</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-[var(--line)] py-5 text-center text-xs text-ink-soft">© 2026 {t('brand')}. {t('footer.rights')}.</div>
    </footer>
  );
}
