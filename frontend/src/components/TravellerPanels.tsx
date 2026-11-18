import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import { Copy, Medal, Star } from '@phosphor-icons/react';
import { toast } from 'sonner';
import InviteHostLink from '@/components/provider/InviteHostLink';
import api from '@/lib/api';
import { fetchFavorites } from '@/lib/favorites';
import PointsRules, { travellerPointsRows } from '@/components/PointsRules';
import { Box, Button, ButtonLink, IconButton, TextArea } from '@/components/ag';
import { Icon, type IconName } from '@/components/ag/Icon';

/**
 * The traveller dashboard (prototype travDash + the share row of V.tdash): Aangan Points, the six
 * figures, See my trips; then inviting a friend, Aangan Awards and feedback for aangan.
 * Numbers come from GET /users/me/dashboard; the app shows the same panels (app/profile.tsx).
 */
type Dashboard = {
  pass: { active: boolean; expires_at: string | null };
  points: number;
  points_breakdown?: Partial<Record<'trips' | 'reviews' | 'referrals' | 'profile' | 'pass', number>>;
  points_rules?: Partial<Record<'completedTrip' | 'review' | 'referral' | 'profileComplete' | 'pass', number>>;
  awards: { id: string; earned: boolean; progress: number; goal: number }[];
  totals: { trips: number; homestays: number; cafes: number; shops: number };
  referrals: { joined: number };
  profile: { complete: boolean; missing: string[] };
};

/** i18n keys (en.json ui.travellerPanels.awards) for each award's name and how to earn it. */
const award = (id: string) => ({ title: `ui.travellerPanels.awards.${id}.title`, how: `ui.travellerPanels.awards.${id}.how` });
export const AWARD_TEXT: Record<string, { title: string; how: string }> = {
  first_trip: award('first_trip'),
  homestay_explorer: award('homestay_explorer'),
  cafe_hopper: award('cafe_hopper'),
  local_supporter: award('local_supporter'),
  road_tripper: award('road_tripper'),
  storyteller: award('storyteller'),
  connector: award('connector'),
  pass_holder: award('pass_holder'),
  profile_complete: award('profile_complete'),
};

/** The person's avatar: their photo, else their initial, else the person icon (prototype avatar()). */
export function Avatar({ name, src, size }: { name?: string | null; src?: string | null; size: number }) {
  const [broken, setBroken] = useState(false);
  const initial = (name || '').trim().charAt(0).toUpperCase();
  return (
    <span className="ag-account-avatar" style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}>
      {src && !broken ? <img src={src} alt={name || ''} onError={() => setBroken(true)} data-testid="account-avatar" />
        : initial || <Icon name="person" />}
    </span>
  );
}

export default function TravellerPanels() {
  const { t } = useTranslation();
  const [data, setData] = useState<Dashboard | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [saved, setSaved] = useState<number | null>(null);
  const [fb, setFb] = useState({ rating: 0, message: '' });
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let live = true;
    api.get('/users/me/dashboard').then(({ data }) => live && setData(data)).catch(() => {});
    api.get('/users/me/referrals').then(({ data }) => live && setCode(data.code)).catch(() => {});
    fetchFavorites().then((l) => live && setSaved(l.length)).catch(() => live && setSaved(null));
    return () => { live = false; };
  }, []);

  // Opens sign-in with the code already filled in (Login reads ?ref=).
  const inviteLink = `${window.location.origin}/login?ref=${encodeURIComponent(code || '')}`;
  const share = async () => {
    if (!code) return;
    const text = t('ui.travellerPanels.share_text', { code, link: inviteLink });
    try {
      if (navigator.share) await navigator.share({ title: 'aangan', text, url: inviteLink });
      else { await navigator.clipboard.writeText(text); toast.success(t('ui.travellerPanels.invite_copied')); }
    } catch { /* closed */ }
  };

  const sendFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (fb.message.trim().length < 5) { toast.error(t('ui.travellerPanels.feedback_too_short')); return; }
    setSending(true);
    try {
      await api.post('/feedback/aangan', { message: fb.message.trim(), rating: fb.rating || null });
      setFb({ rating: 0, message: '' });
      toast.success(t('ui.travellerPanels.feedback_thanks'));
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || t('ui.travellerPanels.feedback_failed'));
    } finally {
      setSending(false);
    }
  };

  if (!data) return <div className="h-40 rounded-[22px] bg-[var(--creme2)] animate-pulse" data-testid="traveller-panels-loading" />;

  const earned = data.awards.filter((a) => a.earned).length;
  const stat = (icon: IconName, label: string, value: React.ReactNode) => (
    <><span className="ag-small"><Icon name={icon} />{label}</span><b>{value}</b></>
  );

  return (
    <div className="flex flex-col gap-4" data-testid="traveller-panels">
      {!data.profile.complete && (
        <Link to="/profile/edit" data-testid="panel-finish-profile" className="ag-box blush !flex-row items-center !gap-3 no-underline">
          <span className="ag-micon" aria-hidden="true"><Icon name="person" /></span>
          <span className="flex-1 min-w-0 text-[var(--ink-strong)]"><Trans i18nKey="ui.travellerPanels.finish_profile" values={{ left: data.profile.missing.length }} components={{ b: <b className="font-medium" /> }} /></span>
          <span className="ag-account-golink" aria-hidden="true"><Icon name="arrowne" /></span>
        </Link>
      )}

      {/* Traveller dashboard: points, the figures, See my trips */}
      <Box>
        <span className="ag-eyebrow">{t('ui.account.tdash', 'Traveller dashboard')}</span>
        <div className="ag-account-pts" data-testid="panel-points">
          <span className="ag-small">{t('ui.travellerPanels.points_title')}</span>
          <b><Icon name="star" /> {data.points.toLocaleString('en-IN')}</b>
          <PointsRules rows={travellerPointsRows(data.points_rules, data.points_breakdown)} tone="dark" testId="panel-points-rules" />
        </div>
        <div className="ag-account-stats" data-testid="panel-totals">
          <div className="ag-account-stat">{stat('bag', t('ui.travellerPanels.totals.trips'), data.totals.trips)}</div>
          <div className="ag-account-stat">{stat('home', t('ui.travellerPanels.totals.homestays'), data.totals.homestays)}</div>
          <div className="ag-account-stat">{stat('cup', t('ui.travellerPanels.totals.cafes'), data.totals.cafes)}</div>
          <div className="ag-account-stat">{stat('pin', t('ui.travellerPanels.totals.shops'), data.totals.shops)}</div>
          <Link to="/saved" className="ag-account-stat" data-testid="dashboard-saved">{stat('heart', t('nav.saved'), saved ?? '–')}</Link>
          <div className="ag-account-stat">{stat('person', t('ui.account.friends', 'Friends joined'), data.referrals.joined)}</div>
        </div>
        <ButtonLink to="/my-trips" go className="self-start" data-testid="dashboard-my-trips">{t('ui.account.seetrips', 'See my trips')}</ButtonLink>
      </Box>

      {/* Invite a friend (prototype share row), with the referral code */}
      <Box className="ag-account-share" data-testid="panel-referrals">
        <p>{t('ui.account.sharefriend', 'Share with a friend who runs a homestay, a coffee shop, is a tourist guide, or loves to explore locally')}</p>
        {code && (
          <div className="flex items-center gap-2 flex-wrap self-stretch">
            <code className="px-3 py-1.5 rounded-lg bg-[var(--creme2)] font-medium text-[var(--ink-strong)]">{code}</code>
            <span className="ag-small">{t('ui.travellerPanels.joined', { n: data.referrals.joined })}</span>
            <IconButton label={t('ui.travellerPanels.copy_code')} small className="ml-auto" onClick={() => { navigator.clipboard?.writeText(code); toast.success(t('ui.travellerPanels.code_copied')); }}>
              <Copy />
            </IconButton>
          </div>
        )}
        <IconButton label={t('ui.travellerPanels.invite')} onClick={share} disabled={!code} className="!text-[var(--r)]" data-testid="panel-share-invite">
          <Icon name="share" />
        </IconButton>
      </Box>

      <InviteHostLink />

      {/* Aangan Awards */}
      <Box as="section" data-testid="panel-awards" aria-labelledby="awards-title">
        <div className="flex items-center justify-between gap-3">
          <h2 id="awards-title" className="inline-flex items-center gap-2"><Medal size={20} className="text-[var(--r)]" aria-hidden="true" /> {t('ui.travellerPanels.awards_title')}</h2>
          <span className="ag-small whitespace-nowrap">{t('ui.travellerPanels.earned_of', { earned, total: data.awards.length })}</span>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          {data.awards.map((a) => {
            const keys = AWARD_TEXT[a.id];
            const text = keys ? { title: t(keys.title), how: t(keys.how) } : { title: a.id, how: '' };
            return (
              <div key={a.id} data-testid={`award-${a.id}`}
                className={`rounded-[12px] p-3 border flex flex-col gap-1 ${a.earned ? 'border-[var(--r)] bg-[var(--r-tint)]' : 'border-[var(--hairline)] bg-[var(--surface)]'}`}>
                <Medal size={22} weight={a.earned ? 'fill' : 'regular'} className={a.earned ? 'text-[var(--r)]' : 'text-[var(--ink-faint)]'} aria-hidden="true" />
                <div className="text-sm font-medium text-[var(--ink-strong)]">{text.title}</div>
                <div className="text-xs leading-4 text-[var(--ink-muted)]">{text.how}</div>
                {!a.earned && a.goal > 1 && (
                  <div className="mt-1 flex items-center gap-2" data-testid={`award-progress-${a.id}`}>
                    <div className="flex-1 h-1.5 rounded-full bg-[var(--hairline)] overflow-hidden" role="progressbar"
                      aria-valuemin={0} aria-valuemax={a.goal} aria-valuenow={a.progress}>
                      <div className="h-full bg-[var(--r)]" style={{ width: `${(a.progress / a.goal) * 100}%` }} />
                    </div>
                    <span className="text-xs font-medium text-[var(--ink-muted)] tabular-nums">{a.progress}/{a.goal}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Box>

      {/* Feedback for aangan */}
      <Box as="section" data-testid="panel-feedback" aria-labelledby="feedback-title">
        <form onSubmit={sendFeedback} className="flex flex-col gap-3">
          <div>
            <h2 id="feedback-title">{t('ui.travellerPanels.feedback_title')}</h2>
            <p className="ag-small">{t('ui.travellerPanels.feedback_lead')}</p>
          </div>
          <div className="flex items-center gap-1" role="radiogroup" aria-label={t('ui.travellerPanels.rating')}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" role="radio" aria-checked={fb.rating === n} aria-label={t('ui.travellerPanels.stars', { count: n })}
                onClick={() => setFb((f) => ({ ...f, rating: f.rating === n ? 0 : n }))} className="w-11 h-11 grid place-items-center">
                <Star size={26} weight={n <= fb.rating ? 'fill' : 'regular'} className={n <= fb.rating ? 'text-[var(--star)]' : 'text-[var(--ink-faint)]'} />
              </button>
            ))}
          </div>
          <TextArea value={fb.message} onChange={(e) => setFb((f) => ({ ...f, message: e.target.value }))} rows={3} maxLength={2000}
            aria-label={t('ui.travellerPanels.feedback_title')} placeholder={t('ui.travellerPanels.feedback_placeholder')} data-testid="feedback-message" />
          <Button type="submit" go disabled={sending} className="self-start" data-testid="feedback-send">
            {sending ? t('ui.travellerPanels.sending') : t('ui.travellerPanels.send_feedback')}
          </Button>
        </form>
      </Box>
    </div>
  );
}
