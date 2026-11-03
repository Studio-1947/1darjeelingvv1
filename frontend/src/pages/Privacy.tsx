import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Trash } from '@phosphor-icons/react';
import LegalDocument from '@/components/LegalDocument';

/** The privacy policy, with how to delete your account at the end (it used to sit in the footer). */
export default function Privacy() {
  const { t } = useTranslation();
  return (
    <>
      <LegalDocument ns="privacy" testId="privacy-page" />
      <section className="mx-auto max-w-3xl px-4 md:px-6 -mt-4 mb-10" data-testid="privacy-delete-account">
        <div className="rounded-2xl border border-[var(--line)] bg-white p-5 flex flex-col sm:flex-row sm:items-center gap-3">
          <span className="w-10 h-10 rounded-full bg-flag/10 text-flag grid place-items-center flex-shrink-0"><Trash size={18} /></span>
          <div className="flex-1">
            <h2 className="font-display font-bold text-ink">{t('nav.delete_account')}</h2>
            <p className="text-sm text-ink-soft mt-0.5">{t('footer.delete_account_note')}</p>
          </div>
          <Link to="/delete-account" className="inline-flex items-center gap-1.5 text-sm font-bold text-flag hover:underline">
            {t('nav.delete_account')} <ArrowRight size={14} />
          </Link>
        </div>
      </section>
    </>
  );
}
