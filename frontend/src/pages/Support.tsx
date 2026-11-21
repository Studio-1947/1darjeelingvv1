import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation, Navigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Check } from '@phosphor-icons/react';
import { Button, PageHead, SecHead } from '@/components/ag';
import { useAuth } from '@/context/AuthContext';
import { createPaymentOrder, completeMockPayment, payWithRazorpay } from '@/lib/api';
import { needsSupport } from '@/lib/support';
import MockPaymentModal from '@/components/MockPaymentModal';
import PriceBreakup from '@/components/PriceBreakup';
import { rupees, usePassPrice } from '@/lib/prices';
import { BusinessPassCard, MemberCard, PassJoinCard } from '@/components/Membership';
import { useSeo } from '@/components/Seo';

/** A pass holder (or a host whose plan includes it): the membership card, then For businesses. */
function MembershipScreen() {
  const { t } = useTranslation();
  return (
    <div className="ag-wrap">
      <div className="ag-main" data-testid="membership-screen">
        <PageHead eyebrow={t('ui.account.eyebrow', 'Your account')} title={t('member.title_short', 'Membership')} />
        <MemberCard />
        <SecHead title={t('member.forbiz', 'For businesses')} />
        <BusinessPassCard />
      </div>
    </div>
  );
}

export default function Support() {
  const { t } = useTranslation();
  useSeo({ title: t('support.title'), noindex: true });
  const { user, refresh } = useAuth();
  const nav = useNavigate();
  const location = useLocation();

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [payModal, setPayModal] = useState<any>(null);
  const pass = usePassPrice(user);
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

  // Opened on its own (Account → Membership, or just paid from there): a pass holder sees their
  // membership card. Sent here on the way to something else: carry on to it.
  if (!needsSupport(user) && !from?.pathname && !next) return <MembershipScreen />;

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
  // Not now: the pass is optional (board: "Don't take pass", ₹1 per booking instead).
  const browseAnonymously = () => {
    setLeaving(true);
    nav(destination, { replace: true });
  };

  return (
    <div className="ag-wrap">
      <div className="ag-main" data-testid="support-screen">
        <PageHead eyebrow={t('ui.account.eyebrow', 'Your account')} title={t('member.title_short', 'Membership')} />

        <PassJoinCard price={pass.total} renewing={!!user?.supportExpiresAt}>
          <PriceBreakup breakup={pass} label={user?.supportExpiresAt ? t('price.pass') : t('price.pass_first_year')} />
          <div className="flex flex-col gap-2">
            <Button variant="primary" go block onClick={startPayment} disabled={busy} data-testid="support-pay">
              {busy ? t('common.loading') : t('support.cta', { total: rupees(pass.total) })}
            </Button>
            <p className="ag-small !text-xs flex items-center justify-center gap-1 m-0">
              <Check size={14} aria-hidden="true" /> {t('support.reassurance')}
            </p>
          </div>
          {err && <p data-testid="support-error" role="alert" className="ag-err !text-sm text-center m-0">{err}</p>}
          <Button variant="text" className="self-center" onClick={browseAnonymously} data-testid="support-skip">{t('support.skip2', 'Not now')}</Button>
        </PassJoinCard>

        <SecHead title={t('member.forbiz', 'For businesses')} />
        <BusinessPassCard />

        <p className="ag-small !text-xs text-center">
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
  );
}
