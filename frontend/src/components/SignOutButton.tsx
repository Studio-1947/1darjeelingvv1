import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SignOut } from '@phosphor-icons/react';
import { useAuth } from '@/context/AuthContext';

/**
 * Log out (phones and tablets) and Delete account (every width), at the foot of the account pages on phones and tablets. Below `lg` the profile menu in
 * the top bar is hidden (the photo lives in the bottom bar's Account tab), so without this there
 * was no way to sign out there.
 */
export default function SignOutButton() {
  const { t } = useTranslation();
  const { logout } = useAuth();
  const nav = useNavigate();
  return (
    <>
    <button
      type="button"
      onClick={() => { logout(); nav('/'); }}
      data-testid="account-sign-out"
      className="lg:hidden mt-8 w-full inline-flex items-center justify-center gap-2 h-[50px] rounded-full border border-flag/40 text-flag font-bold text-[15px] bg-white btn-hover"
    >
      <SignOut size={18} /> {t('nav.logout')}
    </button>
    {/* The Terms (§11) and Contact (§7) say an account can be deleted from the dashboard: this is where. */}
    <div className="mt-5 text-center">
      <Link to="/delete-account" data-testid="account-delete" className="text-sm font-semibold text-ink-soft underline hover:text-flag">
        {t('nav.delete_account')}
      </Link>
    </div>
    </>
  );
}
