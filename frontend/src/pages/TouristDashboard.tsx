import React from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/AuthContext';
import { useSeo } from '@/components/Seo';
import { isSupportActive } from '@/lib/support';
import { isFreeHostType, rupees, useHostPlanPrice, usePassPrice } from '@/lib/prices';
import { LANGUAGES, setLanguage, type LangCode } from '@/i18n';
import { PALETTES, accentOf, mix, useTheme } from '@/lib/theme';
import { Box, Button, ButtonA, ButtonLink, PageHead, Status } from '@/components/ag';
import { Icon, type IconName } from '@/components/ag/Icon';
import Wordmark from '@/components/Wordmark';
import TravellerPanels, { Avatar } from '@/components/TravellerPanels';
import { BusinessModeNotice } from '@/components/TravellerOnly';
import { COMPANY } from '@/constants/company';

/** Prototype language order and labels (V.language). */
const LANG_ORDER: LangCode[] = ['en', 'hi', 'ne', 'bn'];
const langName = (code: string) => LANGUAGES.find((l) => l.code === code)?.label || 'English';

const GoLink = () => <span className="ag-account-golink" aria-hidden="true"><Icon name="arrowne" /></span>;

/** One row of the menu card: icon circle, label with a small line under it, then the grey arrow. */
function Row({ icon, title, sub, end }: { icon: IconName; title: React.ReactNode; sub?: React.ReactNode; end?: React.ReactNode }) {
  return (
    <>
      <span className="ag-micon" aria-hidden="true"><Icon name={icon} /></span>
      <span className="ag-mlab">
        {title}
        {sub != null && sub !== '' && <span className="ag-small">{sub}</span>}
      </span>
      {end ?? <GoLink />}
    </>
  );
}

/** The help card that closes the Account tab (prototype footer({hours:true})). */
function AccountFoot() {
  const { t } = useTranslation();
  const links: Array<{ to: string; label: string; ext?: boolean; testId?: string }> = [
    { to: '/about', label: t('footer.about_aangan'), testId: 'account-about' },
    { to: 'https://www.1947.io', label: t('about.know_studio', 'Know Studio 1947'), ext: true },
    { to: '/responsible', label: t('ui.account.travel_resp', 'Travel responsibly') },
    { to: '/policies', label: t('ui.account.policies', 'Terms, Privacy & Refund Policy') },
  ];
  return (
    <footer className="ag-account-foot" data-testid="account-foot">
      <div className="brand">
        <Wordmark className="h-[18px] w-auto text-[var(--ink-strong)]" still />
        <span className="ag-small">{t('ui.account.by_studio', 'A Product by Studio 1947')}</span>
      </div>
      <nav className="ag-account-footlinks" aria-label={t('footer.links')}>
        {links.map((l) => l.ext ? (
          <a key={l.to} href={l.to} target="_blank" rel="noopener noreferrer">{l.label}<GoLink /></a>
        ) : (
          <Link key={l.to} to={l.to} data-testid={l.testId}>{l.label}<GoLink /></Link>
        ))}
      </nav>
      <p className="ag-account-help">
        {t('ui.account.help1', 'Need help? Call us on')} <b>+91 90932 77919</b><br />
        <span className="hrs"><Icon name="bell" /> {t('ui.account.callhrs', 'Calls: Monday to Friday, 9 am to 6 pm')}</span><br />
        {t('ui.account.help2', 'or email:')} <a href={`mailto:${COMPANY.email}`} data-testid="account-help-email"><b>{COMPANY.email}</b></a>
      </p>
      <div className="ag-account-contact">
        <ButtonA href="tel:+919093277919" icon={<Icon name="phone" />} data-testid="account-help"
          aria-label={t('ui.footer.call_us', { phone: '+91 90932 77919' })}>{t('ui.footer.call')}</ButtonA>
        <ButtonA href={`mailto:${COMPANY.email}`} icon={<Icon name="mail" />}
          aria-label={t('ui.footer.email_us', { email: COMPANY.email })}>{t('ui.footer.email')}</ButtonA>
        <a className="ag-iconbtn" href="https://www.instagram.com/aanganerp?dlrf=MWRnZ2tneHBqM2JiaQ%3D%3D" target="_blank" rel="noreferrer"
          aria-label={t('ui.footer.follow_instagram')}><Icon name="insta" /></a>
        <a className="ag-iconbtn" href="https://www.facebook.com/profile.php?id=61594349938326" target="_blank" rel="noreferrer"
          aria-label={t('ui.footer.follow_facebook')}><Icon name="fb" /></a>
      </div>
    </footer>
  );
}

/** Account → Language (prototype V.language): one pill per language, the current one filled. */
function LanguageScreen() {
  const { t, i18n } = useTranslation();
  return (
    <div className="ag-wrap">
      <div className="ag-main">
        <PageHead eyebrow={t('ui.account.eyebrow', 'Your account')} title={t('lang.choose', 'Language')} />
        <div className="ag-account-langs" role="group" aria-label={t('lang.choose', 'Language')} data-testid="language-switcher">
          {LANG_ORDER.map((code) => {
            const on = i18n.language === code;
            return (
              <button key={code} type="button" lang={code} aria-pressed={on} data-testid={`lang-option-${code}`} onClick={() => setLanguage(code)}>
                <span className="dot" aria-hidden="true">{on && <Icon name="check" />}</span>
                {langName(code)}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Account -> Traveller dashboard (prototype V.tdash): its own screen at /dashboard?s=tdash. */
function TravellerDashScreen() {
  const { t } = useTranslation();
  const { user, loading, isHostMode } = useAuth();
  const nav = useNavigate();
  React.useEffect(() => { if (!loading && !user) nav('/login?next=' + encodeURIComponent('/dashboard?s=tdash'), { replace: true }); }, [loading, user, nav]);
  if (isHostMode) return <BusinessModeNotice />;
  if (loading || !user) return <div className="ag-wrap"><div className="ag-main"><p className="ag-small">{t('common.loading')}</p></div></div>;
  return (
    <div className="ag-wrap">
      <div className="ag-main" id="traveller-dashboard" data-testid="traveller-dashboard">
        <PageHead eyebrow={t('ui.account.eyebrow', 'Your account')} title={t('ui.account.tdash', 'Traveller dashboard')} />
        <TravellerPanels />
      </div>
    </div>
  );
}

/** "+918012345678" -> "+91 8012345678", as the prototype writes a number. */
const shownPhone = (p?: string | null) => (p && /^\+91\d{10}$/.test(p) ? `+91 ${p.slice(3)}` : p || '');

/**
 * The Account tab (prototype V.me): who you are, the menu (profile, theme colour, language, traveller
 * dashboard, membership), the business card, then the help card. Always reachable, so a signed-out
 * visitor gets the guest version with a Log in button. In business mode it is the same page with the
 * business up top: the business photo and name, Business profile and My listings in the menu, and a
 * card to switch back to travelling, so switching modes does not drop the host on a different screen. The traveller dashboard and Language open as
 * their own screens (/dashboard?s=tdash, ?s=language); Log out and blocked people live on Profile.
 */
export default function TouristDashboard() {
  const { t, i18n } = useTranslation();
  useSeo({ title: t('nav.account'), noindex: true });
  const { user, loading, setMode, provider, isHostMode } = useAuth();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const pass = usePassPrice(user);
  const planPrice = useHostPlanPrice(provider?.business_type);
  const [theme] = useTheme();

  if (sp.get('s') === 'language') return <LanguageScreen />;
  if (sp.get('s') === 'tdash') return <TravellerDashScreen />;
  if (loading) return <div className="ag-wrap"><div className="ag-main"><p className="ag-small">{t('common.loading')}</p></div></div>;

  const passOn = !!user && isSupportActive(user);
  const isHost = user?.role === 'provider';
  // Live = travellers can find it: active (same rule as the Business Dashboard and the public
  // listing filter; the team's document check earns the Verified tick, it does not hide anyone).
  const live = provider?.status === 'active';

  const pal = PALETTES.find((p) => p.key === theme);
  const accent = accentOf(theme);
  const themeName = pal ? `${pal.name} · ${pal.en}` : accent;
  const biz = isHostMode && isHost && !!provider;
  const pe = provider?.extras || {};
  const headName: string | undefined = biz ? (pe.host_name || provider?.business_name) : user?.name;
  const headPhoto: string | undefined = biz ? (pe.host_avatar || user?.avatar) : user?.avatar;
  // Business mode: Membership is the business's yearly plan (on My listings), not the traveller pass.
  const planYear = rupees((provider?.plan_price ?? planPrice).base);
  const planUntil = provider?.plan_expires_at
    ? new Date(provider.plan_expires_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  const planSub = !biz ? ''
    : isFreeHostType(provider?.business_type) ? t('ui.account.plan_free', 'Free for local shops')
    : !provider?.plan_expires_at ? t('ui.account.plan_start', { price: planYear, defaultValue: 'Free start · then {{price}} a year' })
    : provider?.plan_active ? t('ui.account.plan_until', { date: planUntil, defaultValue: 'Business plan · active until {{date}}' })
    : t('ui.account.plan_ended', { price: planYear, defaultValue: 'Ended · renew for {{price}} a year' });

  return (
    <div className="ag-wrap">
      <div className="ag-main">
        <PageHead eyebrow={t('ui.account.eyebrow', 'Your account')} title={t('nav.account')} />

        {/* Who you are */}
        <Box className="ag-account-head" data-testid={user ? 'account-me' : 'account-guest'}>
          <div className="row">
            <Avatar name={headName} src={headPhoto} size={64} />
            <div className="min-w-0 flex-1">
              <h2>{headName || t('dashboard.traveller')}</h2>
              {biz ? (
                <Status tone={live ? 'ok' : 'pending'} className="mt-1" data-testid="account-mode">
                  {live ? t('verify.step_live') : t('provider.pending_review')}
                </Status>
              ) : user ? (
                passOn ? (
                  <Status tone="ok" className="mt-1" data-testid="account-mode"><Icon name="check" size={14} /> {t('ui.travellerPanels.pass_title')}</Status>
                ) : (
                  <p className="ag-small" data-testid="account-mode">
                  {user.phone ? t('ui.account.signed_wa', 'Signed in with WhatsApp') : user.email ? t('ui.account.signed_gg', 'Signed in with Google') : t('dashboard.traveller')}
                </p>
                )
              ) : (
                <p className="ag-small">{t('ui.account.not_in', 'Not logged in')}</p>
              )}
            </div>
          </div>
          {!user && (
            <ButtonLink to="/login?next=/dashboard" go className="self-start" data-testid="account-login">{t('nav.login')}</ButtonLink>
          )}
        </Box>

        {/* Menu */}
        <nav className="ag-box ag-account-menu" aria-label={t('nav.account')}>
          {biz && (
            <>
              <Link to="/provider/profile" data-testid="account-business-profile">
                <Row icon="bag" title={t('ui.account.biz_profile', 'Business profile')} sub={provider?.business_name || undefined} />
              </Link>
              <Link to="/my-listings" data-testid="account-my-listings">
                <Row icon="home" title={t('nav.my_listings', 'My Listings')} />
              </Link>
            </>
          )}
          <Link to={user ? '/profile/edit' : '/login?next=/profile/edit'} data-testid="account-edit-profile">
            <Row icon="person" title={t('nav.profile')} sub={shownPhone(user?.phone)} />
          </Link>
          <Link to="/theme" data-testid="account-theme">
            <Row icon="sun" title={t('theme.title', 'Theme colour')} sub={themeName}
              end={(
                <span className="ag-account-palmini" aria-hidden="true">
                  {[accent, mix(accent, '#0B0A08', 0.68), mix(accent, '#FFFFFF', 0.86)].map((c, i) => <i key={i} style={{ background: c }} />)}
                </span>
              )} />
          </Link>
          <Link to="/dashboard?s=language" data-testid="account-language">
            <Row icon="globe" title={t('lang.choose', 'Language')} sub={langName(i18n.language)} />
          </Link>
          {!biz && <Link to={user ? '/dashboard?s=tdash' : '/login?next=' + encodeURIComponent('/dashboard?s=tdash')} data-testid="account-traveller-dashboard">
            <Row icon="t_trip" title={t('ui.account.tdash', 'Traveller dashboard')} />
          </Link>}
          {biz ? (
            <Link to="/my-listings#plan" data-testid="account-plan">
              <Row icon="badge" title={t('ui.account.biz_member', 'Business membership')} sub={planSub} />
            </Link>
          ) : (
            <Link to="/support" data-testid="account-pass">
              <Row icon="badge" title={t('ui.account.member', 'Membership')}
                sub={passOn ? `${t('ui.travellerPanels.pass_title')} · ${t('ui.travellerPanels.pass_active')}` : t('ui.travellerPanels.get_pass', { price: rupees(pass.total) })} />
            </Link>
          )}
        </nav>

        {biz ? (
          <>
            <span className="ag-eyebrow ag-account-bizeye">{t('ui.account.for_travel', 'Going somewhere?')}</span>
            <section className="ag-account-biz" aria-label={t('ui.account.for_travel', 'Going somewhere?')}>
              <div className="row">
                <span className="ag-micon" aria-hidden="true"><Icon name="t_trip" /></span>
                <div className="min-w-0 flex-1">
                  <b>{t('nav.mode_traveller', 'Traveller')}</b>
                  <span className="ag-small">{t('ui.account.travel_box_s', 'Book stays, drivers and guides, see your trips and saved places.')}</span>
                </div>
              </div>
              <Button go onClick={() => setMode('tourist')} data-testid="account-switch-traveller">
                {t('nav.switch_traveller', 'Switch to Traveller')}
              </Button>
            </section>
          </>
        ) : (<>
        {/* For businesses */}
        <span className="ag-eyebrow ag-account-bizeye">{t('ui.account.for_business', 'For businesses')}</span>
        <section className="ag-account-biz" aria-label={t('ui.account.for_business', 'For businesses')}>
          <div className="row">
            <span className="ag-micon" aria-hidden="true"><Icon name="bag" /></span>
            <div className="min-w-0 flex-1">
              {isHost ? (
                <>
                  <b className="truncate">{provider?.business_name || t('nav.mode_business')}</b>
                  <span className="ag-small">{t('nav.business_dashboard')}</span>
                </>
              ) : (
                <>
                  <b>{t('ui.account.biz_start', 'Start your business on aangan')}</b>
                  <span className="ag-small">{t('ui.account.biz_box_s', 'Homestay, driver, guide, cafe or shop. Free to list, no booking commission.')}</span>
                </>
              )}
            </div>
            {isHost && provider && (
              <Status tone={live ? 'ok' : 'pending'} data-testid="account-business-status">
                {live ? t('verify.step_live') : t('provider.pending_review')}
              </Status>
            )}
          </div>
          {isHost ? (
            <Button go onClick={() => { setMode('provider'); nav('/provider/dashboard'); }} data-testid="account-switch-business">
              {t('ui.account.check_biz', 'Check your business')}
            </Button>
          ) : (
            <ButtonLink to="/provider/onboard" go data-testid="account-switch-business">
              {t('ui.account.list_now', 'List now')}
            </ButtonLink>
          )}
        </section>
        </>)}

        <AccountFoot />
      </div>
    </div>
  );
}

