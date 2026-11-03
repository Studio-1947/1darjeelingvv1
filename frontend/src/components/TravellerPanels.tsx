import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, Coffee, Copy, House, Medal, ShareNetwork, Sparkle, Star, Storefront, Ticket, Path, ChatCircleText, UserCircle,
} from '@phosphor-icons/react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { rupees, usePassPrice } from '@/lib/prices';
import { useAuth } from '@/context/AuthContext';

/**
 * The traveller dashboard from the board: aangan pass, Aangan Points, Aangan Awards, total travel
 * (cafes visited, trips taken, local shops, homestays), feedback for aangan and referrals.
 * Numbers come from GET /users/me/dashboard; the app shows the same panels (app/profile.tsx).
 */
type Dashboard = {
  pass: { active: boolean; expires_at: string | null };
  points: number;
  awards: { id: string; earned: boolean; progress: number; goal: number }[];
  totals: { trips: number; homestays: number; cafes: number; shops: number };
  referrals: { joined: number };
  profile: { complete: boolean; missing: string[] };
};

export const AWARD_TEXT: Record<string, { title: string; how: string }> = {
  first_trip: { title: 'First trip', how: 'Finish your first booking' },
  homestay_explorer: { title: 'Homestay explorer', how: 'Stay at 3 homestays' },
  cafe_hopper: { title: 'Cafe hopper', how: 'Visit 3 cafes' },
  local_supporter: { title: 'Local supporter', how: 'Buy from 3 local shops' },
  road_tripper: { title: 'Road tripper', how: 'Take 3 rides or guided trips' },
  storyteller: { title: 'Storyteller', how: 'Write 3 reviews' },
  connector: { title: 'Connector', how: 'Invite a friend who joins' },
  pass_holder: { title: 'Pass holder', how: 'Take the aangan pass' },
  profile_complete: { title: 'All set', how: 'Complete your profile' },
};

export default function TravellerPanels() {
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

  const inviteLink = window.location.origin;
  const share = async () => {
    if (!code) return;
    const text = `Plan your Darjeeling trip on aangan. Use my code ${code} when you sign up: ${inviteLink}`;
    try {
      if (navigator.share) await navigator.share({ title: 'aangan', text, url: inviteLink });
      else { await navigator.clipboard.writeText(text); toast.success('Invite copied'); }
    } catch { /* closed */ }
  };

  const sendFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (fb.message.trim().length < 5) { toast.error('Write a few words first.'); return; }
    setSending(true);
    try {
      await api.post('/feedback/aangan', { message: fb.message.trim(), rating: fb.rating || null });
      setFb({ rating: 0, message: '' });
      toast.success('Thank you! The aangan team reads every note.');
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Could not send. Try again.');
    } finally {
      setSending(false);
    }
  };

  if (!data) return <div className="mb-8 h-40 rounded-3xl bg-mist animate-pulse" data-testid="traveller-panels-loading" />;

  const earned = data.awards.filter((a) => a.earned).length;
  const totals = [
    { label: 'Trips taken', value: data.totals.trips, Icon: Path },
    { label: 'Homestays stayed', value: data.totals.homestays, Icon: House },
    { label: 'Cafes visited', value: data.totals.cafes, Icon: Coffee },
    { label: 'Local shops', value: data.totals.shops, Icon: Storefront },
  ];

  return (
    <div className="mb-8 space-y-4" data-testid="traveller-panels">
      {!data.profile.complete && (
        <Link to="/profile/edit" data-testid="panel-finish-profile"
          className="flex items-center gap-3 p-4 rounded-2xl border border-[#1F6656]/30 bg-[rgba(31,102,86,0.06)] btn-hover">
          <UserCircle size={22} className="text-[#1F6656] flex-shrink-0" />
          <span className="flex-1 text-sm text-ink"><b>Finish your profile</b> so hosts know what you like. {data.profile.missing.length} left.</span>
          <ArrowRight size={16} className="text-[#1F6656]" />
        </Link>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* aangan pass */}
        <div className="rounded-3xl p-5 bg-[#14201A] text-white" data-testid="panel-pass">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-white/70"><Ticket size={14} /> aangan pass</div>
          {data.pass.active ? (
            <>
              <div className="mt-2 font-display font-extrabold text-2xl">Active</div>
              <div className="text-sm text-white/75">Every booking confirms free{data.pass.expires_at && !data.pass.expires_at.startsWith('9999') ? ` until ${new Date(data.pass.expires_at).toLocaleDateString()}` : ''}.</div>
            </>
          ) : (
            <>
              <div className="mt-2 font-display font-extrabold text-2xl">Not active</div>
              <div className="text-sm text-white/75">Book everything free for a year.</div>
              <Link to="/support" className="mt-3 inline-flex items-center gap-1.5 h-10 px-4 rounded-full bg-[#1F6656] text-white font-bold text-[13px] btn-hover" data-testid="panel-get-pass">
                Get the pass · {rupees(pass.total)} <ArrowRight size={14} />
              </Link>
            </>
          )}
        </div>

        {/* Aangan Points */}
        <div className="rounded-3xl p-5 bg-[#DDF0F1] text-[#0E4A4F]" data-testid="panel-points">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest"><Sparkle size={14} /> Aangan Points</div>
          <div className="mt-2 font-display font-extrabold text-4xl">{data.points.toLocaleString('en-IN')}</div>
          <div className="text-sm mt-1">50 per trip · 20 per review · 100 per friend who joins</div>
        </div>

        {/* Referrals */}
        <div className="rounded-3xl p-5 bg-white border border-[var(--line)]" data-testid="panel-referrals">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-ink-soft"><ShareNetwork size={14} /> Refer friends</div>
          <div className="mt-2 font-display font-extrabold text-2xl text-ink">{data.referrals.joined} joined</div>
          {code && (
            <div className="mt-2 flex items-center gap-2">
              <code className="px-2.5 py-1 rounded-lg bg-mist font-bold text-ink">{code}</code>
              <button type="button" onClick={() => { navigator.clipboard?.writeText(code); toast.success('Code copied'); }} aria-label="Copy code" className="w-8 h-8 rounded-full grid place-items-center hover:bg-mist"><Copy size={15} /></button>
              <button type="button" onClick={share} className="ml-auto inline-flex items-center gap-1 h-9 px-3.5 rounded-full bg-[#1F6656] text-white text-xs font-bold btn-hover" data-testid="panel-share-invite">
                Invite <ArrowRight size={13} />
              </button>
            </div>
          )}
        </div>
      </div>

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
          <h2 className="font-display font-extrabold text-lg text-ink flex items-center gap-2"><Medal size={18} className="text-[#C69108]" /> Aangan Awards</h2>
          <span className="text-xs font-bold text-ink-soft">{earned} of {data.awards.length}</span>
        </div>
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3">
          {data.awards.map((a) => {
            const text = AWARD_TEXT[a.id] || { title: a.id, how: '' };
            return (
              <div key={a.id} data-testid={`award-${a.id}`}
                className={`rounded-2xl p-3 border ${a.earned ? 'border-[#C69108]/40 bg-[#FFF8E6]' : 'border-[var(--line)] bg-mist/40'}`}>
                <Medal size={22} weight={a.earned ? 'fill' : 'regular'} className={a.earned ? 'text-[#C69108]' : 'text-ink-soft'} />
                <div className="mt-1 text-sm font-bold text-ink">{text.title}</div>
                <div className="text-[11px] text-ink-soft leading-snug">{text.how}</div>
                {!a.earned && a.goal > 1 && (
                  <div className="mt-2 h-1.5 rounded-full bg-[var(--line)] overflow-hidden">
                    <div className="h-full bg-[#1F6656]" style={{ width: `${(a.progress / a.goal) * 100}%` }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Feedback for aangan */}
      <form onSubmit={sendFeedback} className="rounded-3xl p-5 bg-white border border-[var(--line)]" data-testid="panel-feedback">
        <h2 className="font-display font-extrabold text-lg text-ink flex items-center gap-2"><ChatCircleText size={18} className="text-[#007C85]" /> Feedback for aangan</h2>
        <p className="text-sm text-ink-soft mt-0.5">What should we do better? The team reads every note.</p>
        <div className="mt-3 flex items-center gap-1" role="radiogroup" aria-label="Rating">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" role="radio" aria-checked={fb.rating === n} aria-label={`${n} star${n > 1 ? 's' : ''}`}
              onClick={() => setFb((f) => ({ ...f, rating: f.rating === n ? 0 : n }))} className="p-1">
              <Star size={24} weight={n <= fb.rating ? 'fill' : 'regular'} className={n <= fb.rating ? 'text-[#C69108]' : 'text-ink-soft'} />
            </button>
          ))}
        </div>
        <textarea value={fb.message} onChange={(e) => setFb((f) => ({ ...f, message: e.target.value }))} rows={3} maxLength={2000}
          placeholder="Tell us what you liked or what got in the way…" data-testid="feedback-message"
          className="mt-2 w-full px-3.5 py-2.5 rounded-xl border border-[var(--line)] outline-none text-sm text-ink focus:border-pine" />
        <button type="submit" disabled={sending} data-testid="feedback-send"
          className="mt-2 inline-flex items-center gap-1.5 h-10 px-5 rounded-full bg-[#1F6656] text-white font-bold text-[13px] btn-hover disabled:opacity-60">
          {sending ? 'Sending…' : 'Send feedback'} <ArrowRight size={14} />
        </button>
      </form>
    </div>
  );
}
