import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowUpRight, Globe, Heart, Info, Lifebuoy, Path, SealCheck, Storefront, Suitcase, User,
} from '@phosphor-icons/react';
import { useAuth } from '@/context/AuthContext';
import { useSeo } from '@/components/Seo';
import { isSupportActive } from '@/lib/support';
import { rupees, usePassPrice } from '@/lib/prices';
import { Box, Button, ButtonLink, MenuIcon, PageHead, SecHead, Status } from '@/components/ag';
import BlockedPeople from '@/components/BlockedPeople';
import SignOutButton from '@/components/SignOutButton';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import TravellerPanels from '@/components/TravellerPanels';

/** The circled arrow at the end of a menu row. */
const GoLink = () => <ArrowUpRight weight="bold" size={20} className="flex-none text-[var(--r)]" aria-hidden="true" />;

function MenuLabel({ title, sub }: { title: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <span className="ag-mlab">
      {title}
      {sub != null && <span className="ag-small">{sub}</span>}
    </span>
  );
}

/**
 * The Account tab (prototype V.me): who you are, the business box, then the menu. Always
 * reachable, so a signed-out visitor gets the guest version with a Log in button instead of a
 * redirect. Trips live on the My trip tab.
 */
export default function TouristDashboard() {
  const { t } = useTranslation();
  useSeo({ title: t('nav.account'), noindex: true });
  const { user, loading, setMode, provider } = useAuth();
  const nav = useNavigate();
  const [avatarError, setAvatarError] = useState(false);
  const pass = usePassPrice(user);

  if (loading) return <div className="ag-wrap"><div className="ag-main"><p className="ag-small">{t('common.loading')}</p></div></div>;

  const passOn = !!user && isSupportActive(user);
  const isHost = user?.role === 'provider';
  const live = provider?.status === 'active';
  const toPanels = () => document.getElementById('traveller-dashboard')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className="ag-wrap">
      <div className="ag-main">
        <PageHead eyebrow={t('ui.account.eyebrow', 'Your account')} title={t('nav.account')} />

        {/* Who you are */}
        {user ? (
          <Box className="!flex-row items-center !gap-4">
            <span className="w-16 h-16 flex-none rounded-full overflow-hidden bg-[var(--r)] text-[var(--on-r)] grid place-items-center text-[27px] font-medium">
              {user.avatar && !avatarError ? (
                <img src={user.avatar} alt={user.name || ''} onError={() => setAvatarError(true)} data-testid="account-avatar" className="w-full h-full object-cover" />
              ) : (user.name?.trim().charAt(0).toUpperCase() || <User size={28} aria-hidden="true" />)}
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="truncate">{user.name || t('dashboard.traveller')}</h2>
              <p className="ag-small whitespace-nowrap">{user.phone}</p>
              <Status tone="info" className="mt-1" data-testid="account-mode">{t('dashboard.traveller')}</Status>
            </div>
          </Box>
        ) : (
          <Box data-testid="account-guest">
            <div className="flex items-center gap-4">
              <span className="w-16 h-16 flex-none rounded-full bg-[var(--r-tint)] text-[var(--r)] grid place-items-center"><User size={28} aria-hidden="true" /></span>
              <div className="min-w-0">
                <h2>{t('dashboard.traveller')}</h2>
                <p className="ag-small">{t('ui.account.not_in', 'Not logged in')}</p>
              </div>
            </div>
            <p className="ag-small">{t('ui.account.login_lead', 'Log in to see your trips, saved places, points and aangan pass.')}</p>
            <ButtonLink to="/login?next=/dashboard" variant="primary" go block data-testid="account-login">{t('nav.login')}</ButtonLink>
          </Box>
        )}

        {/* For businesses */}
        <div className="flex flex-col gap-2">
          <span className="ag-eyebrow">{t('ui.account.for_business', 'For businesses')}</span>
          <Box tone="blush">
            <div className="flex items-center gap-3">
              <MenuIcon><Storefront /></MenuIcon>
              {isHost ? (
                <div className="min-w-0 flex-1">
                  <b className="block font-medium text-[var(--ink-strong)] truncate">{provider?.business_name || t('nav.mode_business')}</b>
                  {provider && (
                    <Status tone={live ? 'ok' : 'pending'} className="mt-1" data-testid="account-business-status">
                      {live ? t('verify.step_live') : t('provider.pending_review')}
                    </Status>
                  )}
                </div>
              ) : (
                <div className="min-w-0 flex-1">
                  <b className="block font-medium text-[var(--ink-strong)]">{t('ui.account.biz_start', 'Start your business on aangan')}</b>
                  <span className="ag-small">{t('ui.account.biz_start_s', 'Homestay, driver, guide, cafe or shop. No booking commission.')}</span>
                </div>
              )}
            </div>
            {isHost ? (
              <Button go className="self-start" onClick={() => { setMode('provider'); nav('/provider/dashboard'); }} data-testid="account-switch-business">
                {t('ui.account.check_biz', 'Check your business')}
              </Button>
            ) : (
              <ButtonLink to="/provider/onboard" go className="self-start" data-testid="account-switch-business">
                {t('ui.account.list_now', 'List now')}
              </ButtonLink>
            )}
          </Box>
        </div>

        {/* Menu */}
        <Box className="!gap-0 !py-1">
          <nav className="ag-menu" aria-label={t('nav.account')}>
            {user && (
              <Link to="/profile/edit" data-testid="account-edit-profile">
                <MenuIcon><User /></MenuIcon>
                <MenuLabel title={t('nav.profile')} sub={t('nav.edit_profile')} />
                <GoLink />
              </Link>
            )}
            <div className="!flex-wrap !gap-y-2 cursor-default">
              <MenuIcon><Globe /></MenuIcon>
              <MenuLabel title={t('lang.choose', 'Language')} />
              <LanguageSwitcher className="basis-full" />
            </div>
            {user && (
              <button type="button" onClick={toPanels} data-testid="account-traveller-dashboard">
                <MenuIcon><Path /></MenuIcon>
                <MenuLabel title={t('ui.account.tdash', 'Traveller dashboard')} />
                <GoLink />
              </button>
            )}
            {user && (
              <Link to="/my-trips" data-testid="dashboard-my-trips">
                <MenuIcon><Suitcase /></MenuIcon>
                <MenuLabel title={t('nav.my_trips')} />
                <GoLink />
              </Link>
            )}
            {user && (
              <Link to="/saved" data-testid="dashboard-saved">
                <MenuIcon><Heart /></MenuIcon>
                <MenuLabel title={t('nav.saved')} />
                <GoLink />
              </Link>
            )}
            {user && (passOn ? (
              <div className="cursor-default" data-testid="account-pass">
                <MenuIcon><SealCheck /></MenuIcon>
                <MenuLabel title={t('ui.travellerPanels.pass_title')} />
                <Status tone="ok">{t('ui.travellerPanels.pass_active')}</Status>
              </div>
            ) : (
              <Link to="/support" data-testid="account-pass">
                <MenuIcon><SealCheck /></MenuIcon>
                <MenuLabel title={t('ui.travellerPanels.pass_title')} sub={t('ui.travellerPanels.get_pass', { price: rupees(pass.total) })} />
                <GoLink />
              </Link>
            ))}
            <Link to="/about" data-testid="account-about">
              <MenuIcon><Info /></MenuIcon>
              <MenuLabel title={t('footer.about_aangan')} />
              <GoLink />
            </Link>
            <Link to="/contact" data-testid="account-help">
              <MenuIcon><Lifebuoy /></MenuIcon>
              <MenuLabel title={t('ui.account.help', 'Help and contact')} />
              <GoLink />
            </Link>
          </nav>
        </Box>

        {user && (
          <section id="traveller-dashboard" className="scroll-mt-20 flex flex-col" aria-labelledby="tdash-title">
            <SecHead id="tdash-title" eyebrow={t('ui.account.eyebrow', 'Your account')} title={t('ui.account.tdash', 'Traveller dashboard')} className="!mt-0" />
            <TravellerPanels />
          </section>
        )}

        {user && <BlockedPeople />}

        {user && <SignOutButton className="mt-2" />}
      </div>
    </div>
  );
}
