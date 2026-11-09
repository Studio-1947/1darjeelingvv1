import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import {
  ArrowRight, Coffee, Copy, House, Medal, ShareNetwork, Sparkle, Star, Storefront, Ticket, Path, ChatCircleText, UserCircle,
} from '@phosphor-icons/react';
import { toast } from 'sonner';
import InviteHostLink from '@/components/provider/InviteHostLink';
import api from '@/lib/api';
import { rupees, usePassPrice } from '@/lib/prices';
import { useAuth } from '@/context/AuthContext';
import PointsRules, { travellerPointsRows } from '@/components/PointsRules';

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

  if (!data) return <div className="mb-8 h-40 rounded-3xl bg-mist animate-pulse" data-testid="traveller-panels-loading" />;

  const earned = data.awards.filter((a) => a.earned).length;
  const totals = [
    { label: t('ui.travellerPanels.totals.trips'), value: data.totals.trips, Icon: Path },
    { label: t('ui.travellerPanels.totals.homestays'), value: data.totals.homestays, Icon: House },
    { label: t('ui.travellerPanels.totals.cafes'), value: data.totals.cafes, Icon: Coffee },
    { label: t('ui.travellerPanels.totals.shops'), value: data.totals.shops, Icon: Storefront },
  ];

  return (
    <div className="mb-8 space-y-4" data-testid="traveller-panels">
      {!data.profile.complete && (
        <Link to="/profile/edit" data-testid="panel-finish-profile"
          className="flex items-center gap-3 p-4 rounded-2xl border border-[#1F6656]/30 bg-[rgba(31,102,86,0.06)] btn-hover">
          <UserCircle size={22} className="text-[#1F6656] flex-shrink-0" />
          <span className="flex-1 text-sm text-ink"><Trans i18nKey="ui.travellerPanels.finish_profile" values={{ left: data.profile.missing.length }} components={{ b: <b /> }} /></span>
          <ArrowRight size={16} className="text-[#1F6656]" />
        </Link>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* aangan pass */}
        <div className="rounded-3xl p-5 bg-[#14201A] text-white" data-testid="panel-pass">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-white/70"><Ticket size={14} /> {t('ui.travellerPanels.pass_title')}</div>
          {data.pass.active ? (
            <>
              <div className="mt-2 font-display font-extrabold text-2xl">{t('ui.travellerPanels.pass_active')}</div>
              <div className="text-sm text-white/75">{data.pass.expires_at && !data.pass.expires_at.startsWith('9999')
                ? t('ui.travellerPanels.pass_free_until', { date: new Date(data.pass.expires_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) })
                : t('ui.travellerPanels.pass_free')}</div>
            </>
          ) : (
            <>
              <div className="mt-2 font-display font-extrabold text-2xl">{t('ui.travellerPanels.pass_inactive')}</div>
              <div className="text-sm text-white/75">{t('ui.travellerPanels.pass_pitch')}</div>
              <Link to="/support" className="mt-3 inline-flex items-center gap-1.5 h-10 px-4 rounded-full bg-[#1F6656] text-white font-bold text-[13px] btn-hover" data-testid="panel-get-pass">
                {t('ui.travellerPanels.get_pass', { price: rupees(pass.total) })} <ArrowRight size={14} />
              </Link>
            </>
          )}
        </div>

        {/* Aangan Points */}
        <div className="rounded-3xl p-5 bg-[#DDF0F1] text-[#0E4A4F]" data-testid="panel-points">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest"><Sparkle size={14} /> {t('ui.travellerPanels.points_title')}</div>
          <div className="mt-2 font-display font-extrabold text-4xl">{data.points.toLocaleString('en-IN')}</div>
          <PointsRules rows={travellerPointsRows(data.points_rules, data.points_breakdown)} testId="panel-points-rules" />
        </div>

        {/* Referrals */}
        <div className="rounded-3xl p-5 bg-white border border-[var(--line)]" data-testid="panel-referrals">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-ink-soft"><ShareNetwork size={14} /> {t('ui.travellerPanels.refer_title')}</div>
          <div className="mt-2 font-display font-extrabold text-2xl text-ink">{t('ui.travellerPanels.joined', { n: data.referrals.joined })}</div>
          {code && (
            <div className="mt-2 flex items-center gap-2">
              <code className="px-2.5 py-1 rounded-lg bg-mist font-bold text-ink">{code}</code>
              <button type="button" onClick={() => { navigator.clipboard?.writeText(code); toast.success(t('ui.travellerPanels.code_copied')); }} aria-label={t('ui.travellerPanels.copy_code')} className="w-8 h-8 rounded-full grid place-items-center hover:bg-mist"><Copy size={15} /></button>
              <button type="button" onClick={share} className="ml-auto inline-flex items-center gap-1 h-9 px-3.5 rounded-full bg-[#1F6656] text-white text-xs font-bold btn-hover" data-testid="panel-share-invite">
                {t('ui.travellerPanels.invite')} <ArrowRight size={13} />
              </button>
            </div>
          )}
        </div>
      </div>

      <InviteHostLink />

      {/* Total travel */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="panel-totals">
        {totals.map(({ label, value, Icon }) => (
          <div key={label} className="rounded-2xl p-4 bg-white border border-[var(--line)]">
            <Icon size={18} className="text-[#007C85]" />
            <div className="mt-1.5 font-display font-extrabold text-2xl text-ink">{value}</div>
            <div className="text-xs text-ink-soft font-semibold">{label}</div>
          </div>
        ))}
      </div>

      {/* Aangan Awards */}
      <section className="rounded-3xl p-5 bg-white border border-[var(--line)]" data-testid="panel-awards">
        <div className="flex items-center justify-between">
          <h2 className="font-display font-extrabold text-lg text-ink flex items-center gap-2"><Medal size={18} className="text-[#C69108]" /> {t('ui.travellerPanels.awards_title')}</h2>
          <span className="text-xs font-bold text-ink-soft">{t('ui.travellerPanels.earned_of', { earned, total: data.awards.length })}</span>
        </div>
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3">
          {data.awards.map((a) => {
            const keys = AWARD_TEXT[a.id];
            const text = keys ? { title: t(keys.title), how: t(keys.how) } : { title: a.id, how: '' };
            return (
              <div key={a.id} data-testid={`award-${a.id}`}
                className={`rounded-2xl p-3 border ${a.earned ? 'border-[#C69108]/40 bg-[#FFF8E6]' : 'border-[var(--line)] bg-mist/40'}`}>
                <Medal size={22} weight={a.earned ? 'fill' : 'regular'} className={a.earned ? 'text-[#C69108]' : 'text-ink-soft'} />
                <div className="mt-1 text-sm font-bold text-ink">{text.title}</div>
                <div className="text-[11px] text-ink-soft leading-snug">{text.how}</div>
                {!a.earned && a.goal > 1 && (
                  <div className="mt-2 flex items-center gap-2" data-testid={`award-progress-${a.id}`}>
                    <div className="flex-1 h-1.5 rounded-full bg-[var(--line)] overflow-hidden" role="progressbar"
                      aria-valuemin={0} aria-valuemax={a.goal} aria-valuenow={a.progress}>
                      <div className="h-full bg-[#1F6656]" style={{ width: `${(a.progress / a.goal) * 100}%` }} />
                    </div>
                    <span className="text-[11px] font-bold text-ink-soft tabular-nums">{a.progress}/{a.goal}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Feedback for aangan */}
      <form onSubmit={sendFeedback} className="rounded-3xl p-5 bg-white border border-[var(--line)]" data-testid="panel-feedback">
        <h2 className="font-display font-extrabold text-lg text-ink flex items-center gap-2"><ChatCircleText size={18} className="text-[#007C85]" /> {t('ui.travellerPanels.feedback_title')}</h2>
        <p className="text-sm text-ink-soft mt-0.5">{t('ui.travellerPanels.feedback_lead')}</p>
        <div className="mt-3 flex items-center gap-1" role="radiogroup" aria-label={t('ui.travellerPanels.rating')}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" role="radio" aria-checked={fb.rating === n} aria-label={t('ui.travellerPanels.stars', { count: n })}
              onClick={() => setFb((f) => ({ ...f, rating: f.rating === n ? 0 : n }))} className="p-1">
              <Star size={24} weight={n <= fb.rating ? 'fill' : 'regular'} className={n <= fb.rating ? 'text-[#C69108]' : 'text-ink-soft'} />
            </button>
          ))}
        </div>
        <textarea value={fb.message} onChange={(e) => setFb((f) => ({ ...f, message: e.target.value }))} rows={3} maxLength={2000}
          placeholder={t('ui.travellerPanels.feedback_placeholder')} data-testid="feedback-message"
          className="mt-2 w-full px-3.5 py-2.5 rounded-xl border border-[var(--line)] outline-none text-sm text-ink focus:border-pine" />
        <button type="submit" disabled={sending} data-testid="feedback-send"
          className="mt-2 inline-flex items-center gap-1.5 h-10 px-5 rounded-full bg-[#1F6656] text-white font-bold text-[13px] btn-hover disabled:opacity-60">
          {sending ? t('ui.travellerPanels.sending') : t('ui.travellerPanels.send_feedback')} <ArrowRight size={14} />
        </button>
      </form>
    </div>
  );
}
