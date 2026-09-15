import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation, Navigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { HandHeart as HeartHandshake, Check } from '@phosphor-icons/react';
import { useAuth } from '@/context/AuthContext';
import { createPaymentOrder, completeMockPayment, payWithRazorpay } from '@/lib/api';
import { needsSupport, isSupportActive } from '@/lib/support';
import MockPaymentModal from '@/components/MockPaymentModal';
import { useSeo } from '@/components/Seo';
import { MobileScreen, PrimaryButton as MobilePrimaryButton } from '@/components/mobile';

export default function Support() {
  const { t } = useTranslation();
  useSeo({ title: t('support.title'), noindex: true });
  const { user, refresh, logout } = useAuth();
  const nav = useNavigate();
  const location = useLocation();

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [payModal, setPayModal] = useState<any>(null);
  // Set the instant "not now" is clicked  see browseAnonymously below for why the
  // `!user` redirect needs this to stay off during that specific transition.
  const [leaving, setLeaving] = useState(false);

  // Where SupportGate intercepted them. Rebuilt from pathname + search + hash so a query-bearing
  // URL like /search?q=momo survives the round trip; falling back to the feed keeps a direct
  // visit sensible.
  const from = (location.state as any)?.from;

  // The 402 interceptor (frontend/src/lib/api.ts) has no router access  it does a full page
  // navigation  so it can't carry state.from and instead appends the destination as a `next`
  // query param. Unlike state.from (which only this app's own SupportGate produces), `next` is
  // attacker-suppliable: anyone can send a link to /support?next=.... Only accept it if it is a
  // same-origin relative path  starting with a single '/' and NOT with '//' or '/\', both of
  // which a browser/URL parser treats as protocol-relative and resolves to a different host.
  // Anything else is rejected and we fall back to '/'.
  const rawNext = new URLSearchParams(location.search).get('next');
  const next =
    rawNext && rawNext.startsWith('/') && !rawNext.startsWith('//') && !rawNext.startsWith('/\\')
      ? rawNext
      : null;

  const destination = from?.pathname
    ? `${from.pathname}${from.search || ''}${from.hash || ''}`
    : next || '/';

  // A year settled by the Razorpay webhook while the user was away (e.g. modal.ondismiss fired
  // after capture but before the success handler ran) needs to be reflected here on arrival,
  // otherwise the pay button stays live and invites a second charge. `refresh` has a stable
  // identity (useCallback with no deps in AuthContext), so this runs exactly once on mount.
  useEffect(() => {
    refresh();
  }, [refresh]);

  // `leaving` guards this: clicking "not now" below calls logout() then navigate('/'), and
  // React doesn't commit those two updates as one atomic step  a render can land in between
  // where user is already null but the location hasn't moved off /support yet (confirmed by
  // driving a real browser: without this guard that render hits this branch, mounts
  // <Navigate to="/login">, and its effect fires navigate('/login') a beat after our own
  // navigate('/'), overwriting it  "not now" silently lands on the login screen instead of
  // the homepage). leaving suppresses the branch for exactly that window; once the location
  // actually changes, Support unmounts and the flag stops mattering.
  if (!user && !leaving) return <Navigate to="/login" replace />;

  // Fee already active (paid just now in another tab, settled by webhook while away, etc.) 
  // don't show the pay screen again, just send them on to where they were headed.
  if (!needsSupport(user)) return <Navigate to={destination} replace />;

  const finish = async () => {
    await refresh();
    nav(destination, { replace: true });
  };

  const startPayment = async () => {
    setBusy(true);
    setErr('');
    try {
      const order = await createPaymentOrder({ flow: 'platform_support', reference_id: user.id });
      if (order.mock) {
        setPayModal({ amount: order.amount, order: order.order });
      } else {
        await payWithRazorpay({
          order: order.order,
          key_id: order.key_id,
          flow: 'platform_support',
          reference_id: user.id,
          description: t('support.modal_title'),
          prefill: { contact: user.phone, name: user.name },
        });
        await finish();
      }
    } catch (e: any) {
      // A rejection here (e.g. modal.ondismiss firing after Razorpay captured the payment but
      // before our handler ran) may actually be a success on the server. Re-sync first so the
      // needsSupport guard above can catch it on the next render instead of leaving the Pay
      // button live and inviting a second charge.
      await refresh();
      setErr(e?.response?.data?.detail || t('support.error'));
    } finally {
      setBusy(false);
    }
  };

  const finishMockPayment = async () => {
    try {
      await completeMockPayment({
        order_id: payModal.order.id,
        flow: 'platform_support',
        reference_id: user.id,
      });
      setPayModal(null);
      await finish();
    } catch (e: any) {
      // Same reasoning as startPayment's catch: re-sync before surfacing the error in case the
      // payment actually went through.
      await refresh();
      setErr(e?.response?.data?.detail || t('support.error'));
      setPayModal(null);
    }
  };

  // The escape hatch. A hard gate on a logged-in user with no way out is a trap: they cannot
  // pay, cannot browse, cannot leave. Public browsing was always free  this makes it reachable.
  const browseAnonymously = () => {
    setLeaving(true);
    logout();
    nav('/', { replace: true });
  };

  return (
    <>
    <div className="hidden lg:block mx-auto max-w-md px-4 md:px-8 py-8 md:py-14">
      <div className="mist-panel p-6 md:p-8" data-testid="support-screen">
        <div className="text-center">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-pine text-white grid place-items-center">
            <HeartHandshake size={26} />
          </div>
          {t('support.eyebrow') && (
            <div className="mt-4 text-xs font-bold uppercase tracking-widest text-pine">
              {t('support.eyebrow')}
            </div>
          )}
          <h1 className="mt-1 font-display font-extrabold text-2xl md:text-3xl text-ink leading-tight">
            {t('support.title')}
          </h1>
        </div>

        <p className="mt-5 text-sm text-ink font-semibold">{t('support.amount_line')}</p>
        <p className="mt-3 text-sm text-ink-soft">{t('support.body')}</p>

        <button
          onClick={startPayment}
          disabled={busy}
          data-testid="support-pay"
          className="mt-7 w-full py-3 rounded-full bg-pine text-white font-extrabold btn-hover disabled:opacity-60"
        >
          {busy ? t('common.loading') : t('support.cta')}
        </button>

        <p className="mt-3 text-[11px] text-center text-ink-soft flex items-center justify-center gap-1">
          <Check size={11} /> {t('support.reassurance')}
        </p>

        {err && (
          <p data-testid="support-error" className="mt-4 text-sm text-flag font-semibold text-center">
            {err}
          </p>
        )}

        <button
          type="button"
          onClick={browseAnonymously}
          data-testid="support-skip"
          className="mt-6 w-full text-xs text-ink-soft underline"
        >
          {t('support.skip')}
        </button>

        <p className="mt-6 text-xs text-center text-ink-soft">
          <Link to="/privacy" className="underline">{t('support.privacy_link')}</Link>
        </p>
      </div>

      <MockPaymentModal
        open={!!payModal}
        onClose={() => setPayModal(null)}
        amount={payModal?.amount || 0}
        title={t('support.modal_title')}
        description={t('support.modal_duration')}
        onPay={finishMockPayment}
        prefill={{ upi: `${(user.name || 'traveller').toLowerCase().replace(/\s+/g, '')}@ybl` }}
      />
    </div>

    {/* ============================================================= */}
    {/* MOBILE PASS (< lg) - matches RN's pass.tsx. Reuses startPayment/ */}
    {/* finishMockPayment/busy/err/payModal entirely unchanged - this   */}
    {/* page only renders when needsSupport(user) is true (the guard    */}
    {/* above redirects otherwise), so there's no "already active"     */}
    {/* state to represent here - Profile's Pass card already shows    */}
    {/* that. */}
    {/* ============================================================= */}
    <MobileScreen tone="ink" className="block lg:hidden min-h-screen flex flex-col pb-[calc(var(--bottom-nav-h)+1rem)]">
      <div className="flex-1 px-6 pt-8">
        <span className="inline-block px-3 py-1 rounded-full bg-[var(--mu-cream)] text-[10px] font-bold tracking-wider text-[var(--mu-green-deep)]">
          {t('mobilePass.tag')}
        </span>
        <h1 className="mt-3.5 font-[family-name:var(--mu-font-display)] font-black text-[32px] leading-[1.05] text-[var(--mu-cream)] tracking-tight">
          {t('mobileHome.pass_title_pre')} <span style={{ color: 'var(--mu-lime)' }}>{t('mobileHome.pass_title_price')}</span>
        </h1>

        <div className="mt-5 rounded-[var(--mu-r-hero)] px-5 py-[18px]" style={{ background: 'var(--mu-green-deep)', border: '1px solid var(--mu-lime-glow)' }}>
          <div className="flex items-baseline justify-between">
            <span className="font-[family-name:var(--mu-font-display)] font-bold text-[15px] text-[var(--mu-cream)]">{t('mobilePass.name')}</span>
            <span className="font-[family-name:var(--mu-font-display)] font-black text-2xl" style={{ color: 'var(--mu-lime)' }}>
              ₹12<span className="ml-0.5 text-xs font-semibold text-[var(--mu-text-on-dark-muted)]">/year</span>
            </span>
          </div>
          <div className="mt-3.5 space-y-2">
            {[t('mobilePass.perk1'), t('mobilePass.perk2'), t('mobilePass.perk3'), t('mobilePass.perk4')].map((perk) => (
              <div key={perk} className="text-[13px] text-[var(--mu-text-on-dark-soft)]">✓ {perk}</div>
            ))}
          </div>
        </div>

        <p className="mt-3.5 text-[11.5px] leading-relaxed text-[var(--mu-text-on-dark-faint)]">{t('mobilePass.footer')}</p>
      </div>

      <div className="px-6 pb-8 pt-2">
        {err && <p className="mb-2.5 text-[12.5px] text-center" style={{ color: 'var(--mu-orange)' }}>{err}</p>}
        <MobilePrimaryButton
          onClick={startPayment}
          disabled={busy}
          className="w-full !bg-[var(--mu-lime)] !text-[var(--mu-lime-ink)]"
        >
          {busy ? t('mobilePass.buying') : t('mobilePass.cta')}
        </MobilePrimaryButton>
        <p className="mt-2.5 text-xs text-center text-[var(--mu-text-on-dark-faint)]">{t('mobileHome.pass_browse_free')}</p>
      </div>
    </MobileScreen>
    </>
  );
}
