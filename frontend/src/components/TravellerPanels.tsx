import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import {
  ArrowUpRight, Check, Coffee, Copy, House, Medal, ShareNetwork, Sparkle, Star, Storefront, Ticket, Path, ChatCircleText, UserCircle,
} from '@phosphor-icons/react';
import { toast } from 'sonner';
import InviteHostLink from '@/components/provider/InviteHostLink';
import api from '@/lib/api';
import { rupees, usePassPrice } from '@/lib/prices';
import { useAuth } from '@/context/AuthContext';
import PointsRules, { travellerPointsRows } from '@/components/PointsRules';
import { Box, Button, ButtonLink, IconButton, MenuIcon, Status, TextArea } from '@/components/ag';

/**
 * The traveller dashboard from the board: aangan pass, Aangan Points, Aangan Awards, total travel
 * (cafes visited, trips taken, local shops, homestays), feedback for aangan and referrals.
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

export default function TravellerPanels() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [data, setData] = useState<Dashboard | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [fb, setFb] = useState({ rating: 0, message: '' });
  const [sending, setSending] = useState(false);
  const pass = usePassPrice(user);

  useEffect(() => {
    let live = true;
    api.get('/users/me/dashboard').then(({ data }) => live && setData(data)).catch(() => {});
    api.get('/users/me/referrals').then(({ data }) => live && setCode(data.code)).catch(() => {});
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
  const totals = [
    { label: t('ui.travellerPanels.totals.trips'), value: data.totals.trips, Icon: Path },
    { label: t('ui.travellerPanels.totals.homestays'), value: data.totals.homestays, Icon: House },
    { label: t('ui.travellerPanels.totals.cafes'), value: data.totals.cafes, Icon: Coffee },
    { label: t('ui.travellerPanels.totals.shops'), value: data.totals.shops, Icon: Storefront },
  ];
  const big = 'font-medium text-[28px] leading-[34px] text-[var(--ink-strong)] tabular-nums';

  return (
    <div className="flex flex-col gap-4" data-testid="traveller-panels">
      {!data.profile.complete && (
        <Link to="/profile/edit" data-testid="panel-finish-profile" className="ag-box blush !flex-row items-center !gap-3 no-underline">
          <MenuIcon><UserCircle /></MenuIcon>
          <span className="flex-1 min-w-0 text-[var(--ink-strong)]"><Trans i18nKey="ui.travellerPanels.finish_profile" values={{ left: data.profile.missing.length }} components={{ b: <b className="font-medium" /> }} /></span>
          <ArrowUpRight weight="bold" size={20} className="flex-none text-[var(--r)]" aria-hidden="true" />
        </Link>
      )}

      {/* aangan pass */}
      <Box data-testid="panel-pass">
        <span className="ag-eyebrow inline-flex items-center gap-1.5"><Ticket size={16} aria-hidden="true" /> {t('ui.travellerPanels.pass_title')}</span>
        {data.pass.active ? (
          <div className="flex flex-col gap-1">
            <Status tone="ok" className="self-start"><Check weight="bold" aria-hidden="true" /> {t('ui.travellerPanels.pass_active')}</Status>
            <p className="ag-small">{data.pass.expires_at && !data.pass.expires_at.startsWith('9999')
              ? t('ui.travellerPanels.pass_free_until', { date: new Date(data.pass.expires_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) })
              : t('ui.travellerPanels.pass_free')}</p>
          </div>
        ) : (
          <>
            <div>
              <h3>{t('ui.travellerPanels.pass_inactive')}</h3>
              <p className="ag-small">{t('ui.travellerPanels.pass_pitch')}</p>
            </div>
            <ButtonLink to="/support" go className="self-start" data-testid="panel-get-pass">
              {t('ui.travellerPanels.get_pass', { price: rupees(pass.total) })}
            </ButtonLink>
          </>
        )}
      </Box>

      {/* Aangan Points */}
      <Box tone="blush" data-testid="panel-points">
        <span className="ag-eyebrow inline-flex items-center gap-1.5"><Sparkle size={16} aria-hidden="true" /> {t('ui.travellerPanels.points_title')}</span>
        <div className={big}>{data.points.toLocaleString('en-IN')}</div>
        <div className="text-[var(--ink7)] -mt-3">
          <PointsRules rows={travellerPointsRows(data.points_rules, data.points_breakdown)} testId="panel-points-rules" />
        </div>
      </Box>

      {/* Referrals */}
      <Box data-testid="panel-referrals">
        <span className="ag-eyebrow inline-flex items-center gap-1.5"><ShareNetwork size={16} aria-hidden="true" /> {t('ui.travellerPanels.refer_title')}</span>
        <h3>{t('ui.travellerPanels.joined', { n: data.referrals.joined })}</h3>
        {code && (
          <div className="flex items-center gap-2 flex-wrap">
            <code className="px-3 py-1.5 rounded-lg bg-[var(--creme2)] font-medium text-[var(--ink-strong)]">{code}</code>
            <IconButton label={t('ui.travellerPanels.copy_code')} small onClick={() => { navigator.clipboard?.writeText(code); toast.success(t('ui.travellerPanels.code_copied')); }}>
              <Copy />
            </IconButton>
            <Button size="sm" icon={<ShareNetwork />} onClick={share} className="ml-auto" data-testid="panel-share-invite">
              {t('ui.travellerPanels.invite')}
            </Button>
          </div>
        )}
      </Box>

      <InviteHostLink />

      {/* Total travel */}
      <div className="grid grid-cols-2 gap-2.5" data-testid="panel-totals">
        {totals.map(({ label, value, Icon }) => (
          <Box key={label} className="!gap-1">
            <Icon size={20} className="text-[var(--r)]" aria-hidden="true" />
            <div className={big}>{value}</div>
            <div className="ag-small">{label}</div>
          </Box>
        ))}
      </div>

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
                className={`rounded-[18px] p-3 border flex flex-col gap-1 ${a.earned ? 'border-[var(--r)] bg-[var(--r-tint)]' : 'border-[var(--warmline)] bg-[var(--surface)]'}`}>
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
            <h2 id="feedback-title" className="inline-flex items-center gap-2"><ChatCircleText size={20} className="text-[var(--r)]" aria-hidden="true" /> {t('ui.travellerPanels.feedback_title')}</h2>
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
          <Button type="submit" disabled={sending} className="self-start" data-testid="feedback-send">
            {sending ? t('ui.travellerPanels.sending') : t('ui.travellerPanels.send_feedback')}
          </Button>
        </form>
      </Box>
    </div>
  );
}
