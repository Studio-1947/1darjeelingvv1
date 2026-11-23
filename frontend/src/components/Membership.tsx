import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Box, Button, ButtonLink } from '@/components/ag';
import { Icon } from '@/components/ag/Icon';
import Wordmark from '@/components/Wordmark';
import { Avatar } from '@/components/TravellerPanels';
import { useHostSignupInfo } from '@/components/provider/onboard/QuickFill';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';
import { isSupportActive } from '@/lib/support';
import { rupees, useHostPlanPrice } from '@/lib/prices';

/**
 * Membership, as the prototype draws it (app.js member()): the pass holder's membership card, or
 * the "Verified traveller" offer.
 */

type Membership = { active: boolean; expires_at: string | null; since: string | null; paid: number | null; member_id: string };

const day = (iso: string | null | undefined, lang: string) =>
  iso ? new Date(iso).toLocaleDateString(lang === 'en' ? 'en-IN' : lang, { day: 'numeric', month: 'short', year: 'numeric' }) : '';

/** The red membership card: logo, Verified traveller, face, name, member ID, since / valid till / paid. */
export function MemberCard() {
  const { t, i18n } = useTranslation();
  const { user, refresh } = useAuth();
  const [m, setM] = useState<Membership | null>(null);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => {
    let live = true;
    api.get('/payments/membership').then(({ data }) => { if (live) setM(data); }).catch(() => {});
    return () => { live = false; };
  }, [user?.supportExpiresAt]);

  const active = isSupportActive(user);
  const end = async () => {
    setBusy(true);
    setErr('');
    try {
      await api.post('/payments/membership/end');
      await refresh();
      setAsking(false);
    } catch (e: any) {
      setErr(e?.response?.data?.detail || t('support.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="ag-mcard" data-testid="membership-card">
        <div className="mtop">
          <Wordmark className="mlogo" still />
          <span className="mtag"><Icon name="check" />{active ? t('member.verified', 'Verified traveller') : t('member.included', 'Included with your business plan')}</span>
        </div>
        <div className="mwho">
          <span className="mface">
            <Avatar name={user?.name} src={user?.avatar} size={52} />
            <span className="vb" aria-hidden="true"><Icon name="check" /></span>
          </span>
          <div className="min-w-0">
            <b className="mname">{user?.name || t('member.traveller', 'Traveller')}</b>
            <span className="msmall" data-testid="membership-id">{t('member.id', 'Member ID')} {m?.member_id || '…'}</span>
          </div>
        </div>
        {active && (
          <div className="mfoot">
            <span><span className="msmall">{t('member.since', 'Member since')}</span><b>{day(m?.since, i18n.language) || '—'}</b></span>
            <span><span className="msmall">{t('member.valid_till', 'Valid till')}</span><b data-testid="membership-until">{day(user?.supportExpiresAt, i18n.language)}</b></span>
            <span className="end"><span className="msmall">{t('member.paid', 'Paid')}</span><b>{m?.paid != null ? rupees(m.paid) : '—'}</b></span>
          </div>
        )}
      </div>

      {active && (
        <>
          <p className="ag-small m-0">{t('member.why2', 'Pay ₹1 a year to aangan and get a verified badge. Hosts and drivers see it on your booking requests, so they say yes faster.')}</p>
          {!asking ? (
            <Button go className="self-start" onClick={() => setAsking(true)} data-testid="membership-end">{t('member.end', 'End membership')}</Button>
          ) : (
            <Box flat data-testid="membership-end-confirm">
              <p className="m-0"><b>{t('member.end_q', 'End your membership now?')}</b></p>
              <p className="ag-small m-0">{t('member.end_s', 'The verified badge goes at once and what you paid is not refunded. Getting the pass again costs the yearly price.')}</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="stop" onClick={end} disabled={busy} data-testid="membership-end-yes">{busy ? t('common.loading') : t('member.end_yes', 'Yes, end it')}</Button>
                <Button onClick={() => setAsking(false)} data-testid="membership-end-keep">{t('member.keep', 'Keep it')}</Button>
              </div>
              {err && <p className="ag-err m-0" role="alert">{err}</p>}
            </Box>
          )}
        </>
      )}
    </>
  );
}

/** The offer to a traveller without the pass (prototype passcard: Verified traveller, ₹1 / year). */
/** The pass offer: what it gives, then the caller's price breakup and Pay button (the price shows there). */
export function PassJoinCard({ children }: { price?: number; renewing?: boolean; children: React.ReactNode }) {
  const { t } = useTranslation();
  return (
    <Box className="ag-passcard" data-testid="pass-offer">
      <div className="ptop">
        <span className="pbadge"><Icon name="badge" /></span>
        <div>
          <p className="ag-eyebrow m-0">{t('member.title_short', 'Membership')}</p>
          <h2 className="m-0">{t('member.verified', 'Verified traveller')}</h2>
        </div>
      </div>
      <p className="ag-small m-0">{t('member.offer', 'Get the aangan pass and a verified badge. Hosts and drivers see it on your booking requests, so they say yes faster.')}</p>
      <ul className="pchecks">
        <li><Icon name="check" />{t('member.vt1', 'Verified badge on every booking request')}</li>
        <li><Icon name="check" />{t('member.vt2', 'Membership card on your phone')}</li>
        <li><Icon name="check" />{t('member.vt3b', 'Still no booking fees, ever')}</li>
        <li><Icon name="check" />{t('support.reassurance_gst', 'Valid for one year, GST included. Nothing auto-charges.')}</li>
      </ul>
      {children}
    </Box>
  );
}

/** For businesses: the hosts' yearly pass instead of a commission (prototype PASSCARD). */
export function BusinessPassCard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { grace_bookings } = useHostSignupInfo();
  const big = useHostPlanPrice('homestay');
  const small = useHostPlanPrice('cafe');
  const yr = t('member.year', 'year');
  const rows: Array<[Parameters<typeof Icon>[0]['name'], string, string, boolean]> = [
    ['person', t('member.r_trav2', 'Travellers'), t('member.free', 'Free'), false],
    ['home', t('member.r_big2', 'Homestays, drivers and guides'), `${rupees(big.base)} / ${yr}`, true],
    ['cup', t('member.r_cafe', 'Restaurants and cafes'), `${rupees(small.base)} / ${yr}`, true],
    ['bag', t('member.r_shop', 'Local shops'), t('member.free', 'Free'), false],
  ];
  const isHost = user?.role === 'provider';
  return (
    <Box className="ag-passcard" data-testid="business-pass">
      <div className="ptop">
        <span className="pbadge"><Icon name="t_trip" /></span>
        <div>
          <p className="ag-eyebrow m-0">{t('member.pass', 'aangan pass')}</p>
          <h2 className="m-0">{t('member.passh', 'A yearly pass, not a commission')}</h2>
        </div>
      </div>
      <p className="ag-small m-0">{t('member.passS2', 'aangan takes no commission on any booking. Homestays, drivers, guides and restaurants pay one small yearly pass instead. It is what lets aangan build and keep running for the hills.')}</p>
      <div className="pprice">
        <span className="pfrom">{t('member.from', 'From')}</span><b>{rupees(small.base)}</b><span>/ {yr}</span>
        <span className="pnote">{t('member.nocomm', 'No commission')}</span>
      </div>
      <div className="prows">
        {rows.map(([icon, who, val, hl]) => (
          <div key={who} className={`prow${hl ? ' hl' : ''}`}><span className="picon"><Icon name={icon} /></span><span className="pwho">{who}</span><b className="pval">{val}</b></div>
        ))}
      </div>
      <p className="ag-small m-0">{t('member.gst', 'Business prices plus 18% GST.')}</p>
      <ul className="pchecks">
        <li><Icon name="check" />{t('member.pass1', 'No commission per booking')}</li>
        <li><Icon name="check" />{t('member.pass2', 'Guests pay the host directly')}</li>
        <li><Icon name="check" />{t('member.pass3', { count: grace_bookings, defaultValue: 'Pay at the start or after your first {{count}} bookings' })}</li>
      </ul>
      <div className="flex flex-col gap-2">
        {isHost ? (
          user?.providerPaid
            ? <p className="pstate ok"><Icon name="check" />{t('member.biz_paid', 'Your business pass is paid')}</p>
            : null
        ) : null}
        {isHost
          ? <ButtonLink to="/provider/dashboard" go block data-testid="business-pass-open">{t('member.check_biz', 'Check your business')}</ButtonLink>
          : <ButtonLink to="/provider/onboard" variant="primary" go block data-testid="business-pass-list">{t('member.list_biz', 'List your business')}</ButtonLink>}
        {!isHost && <p className="ag-small m-0 text-center"><Link to="/about">{t('member.passforhosts', 'For homestays and drivers. Travellers never pay.')}</Link></p>}
      </div>
    </Box>
  );
}
