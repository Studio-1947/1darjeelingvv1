import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CircleNotch as Loader2, Flag, Trash } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { useSeo } from '@/components/Seo';
import { Box, Button, ButtonLink, FieldError, Status } from '@/components/ag';
import { Icon } from '@/components/ag/Icon';
import PlanCard, { PlanAvatar } from '@/components/feed/PlanCard';
import ReportDialog, { ReportTarget } from '@/components/listing-detail/ReportDialog';
import '@/styles/screens/plans.css';
import { answerRequest, apiError, dayDate, deletePlan, fetchPlan, updatePlan, type TripPlan } from '@/lib/plans';
import VerifyToPost from '@/components/feed/VerifyToPost';
import { useCrumbTitle } from '@/components/PageBack';

/**
 * One trip plan (/plan/:id, the link "Share" sends): the card with Ask to join, the day notes and
 * the organiser's notes. The organiser also sees who asked to join and confirms or declines each
 * (prototype plans.js "Join requests"), and can delete the plan.
 */
export default function PlanDetail() {
  const { id = '' } = useParams();
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const nav = useNavigate();
  const [plan, setPlan] = useState<TripPlan | null>(null);
  useCrumbTitle(plan?.title);
  const [state, setState] = useState<'loading' | 'missing' | 'error' | 'ok'>('loading');
  const [busy, setBusy] = useState<string | null>(null);
  const [report, setReport] = useState<ReportTarget | null>(null);
  // Posting a kept plan in the Feed needs a verified person; not verified yet shows how to get there.
  const [needVerify, setNeedVerify] = useState(false);
  useSeo({ title: plan?.title || t('plans.trip_plan', 'Trip plan') });

  const load = useCallback(async () => {
    setState('loading');
    try {
      setPlan(await fetchPlan(id));
      setState('ok');
    } catch (e: any) {
      setState(e?.response?.status === 404 ? 'missing' : 'error');
    }
  }, [id]);
  useEffect(() => { load(); }, [load, user?.id]);

  const answer = async (userId: string, action: 'accept' | 'decline') => {
    setBusy(userId + action);
    try {
      setPlan(await answerRequest(id, userId, action));
    } catch (e) {
      toast.error(apiError(e, t('plans.answer_failed', 'Could not update this request.')));
    } finally {
      setBusy(null);
    }
  };

  const toFeed = async () => {
    setBusy('feed');
    try {
      setPlan(await updatePlan(id, { visibility: 'public' }));
      toast.success(t('plans.done', 'Your plan is in the Feed'));
    } catch (e: any) {
      if (e?.response?.data?.code === 'not_verified') setNeedVerify(true);
      else toast.error(apiError(e, t('plans.post_failed', 'Could not post the plan. Try again.')));
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!window.confirm(t('plans.delete_confirm', 'Delete this trip plan? Everyone who asked to join is told.'))) return;
    setBusy('delete');
    try {
      await deletePlan(id);
      toast.success(t('plans.deleted', 'Plan deleted'));
      nav('/feed');
    } catch (e) {
      toast.error(apiError(e, t('plans.delete_failed', 'Could not delete the plan.')));
      setBusy(null);
    }
  };

  if (state === 'loading') {
    return <div className="ag-wrap"><div className="ag-main"><div className="flex justify-center py-16 text-[var(--ink-muted)]"><Loader2 size={24} className="animate-spin" /></div></div></div>;
  }
  if (state !== 'ok' || !plan) {
    return (
      <div className="ag-wrap">
        <div className="ag-main">
          <Box data-testid="plan-missing">
            <FieldError>{state === 'missing' ? t('plans.missing', 'This trip plan is gone, or only its organiser can see it.') : t('plans.load_failed', 'Could not load the plan.')}</FieldError>
            <div className="ag-flowbar">
              {state === 'error' && <Button size="sm" onClick={load}>{t('feed.retry', 'Try again')}</Button>}
              <ButtonLink to="/feed" size="sm" go>{t('plans.see_feed', 'See it in the Feed')}</ButtonLink>
            </div>
          </Box>
        </div>
      </div>
    );
  }

  const mine = !!plan.viewer?.is_organiser;
  const lang = i18n.language === 'en' ? 'en-IN' : i18n.language;
  const requests = plan.requests || [];
  const waiting = requests.filter((r) => r.status === 'pending');
  const inTrip = requests.filter((r) => r.status === 'accepted');

  return (
    <div className="ag-wrap">
      <div className="ag-main" data-testid="plan-detail">
        <h1 className="sr-only">{plan.title}</h1>
        <PlanCard plan={plan} onChange={setPlan} />

        {mine && plan.visibility === 'private' && (
          <>
            <Status className="self-start">{t('plans.private', 'Only you can see this plan')}</Status>
            {needVerify ? <VerifyToPost next={`/plan/${plan.id}`} /> : (
              <Button variant="primary" go className="self-start" onClick={toFeed} disabled={busy !== null} data-testid="plan-to-feed">
                {t('plans.post_to_feed', 'Post it in the Feed')}
              </Button>
            )}
          </>
        )}

        {mine && (
          <Box className="ag-plan-sec" data-testid="plan-requests">
            <h2>{t('plans.requests_h', 'Join requests')}</h2>
            {!waiting.length && <p className="ag-small m-0">{t('plans.no_requests', 'No one is waiting. Share the plan so others can ask to join.')}</p>}
            {waiting.map((r) => (
              <div key={r.user.id} className="ag-plan-req" data-testid={`plan-req-${r.user.id}`}>
                <span><PlanAvatar name={r.user.name} avatar={r.user.avatar} small /><b className="truncate">{r.user.name}</b></span>
                <span className="ag-plan-reqbtns">
                  <Button variant="primary" size="sm" onClick={() => answer(r.user.id, 'accept')} disabled={busy !== null || plan.full}
                    data-testid={`plan-accept-${r.user.id}`}>{t('plans.accept', 'Confirm')}</Button>
                  <Button variant="stop" size="sm" onClick={() => answer(r.user.id, 'decline')} disabled={busy !== null}
                    data-testid={`plan-decline-${r.user.id}`}>{t('plans.decline', 'Decline')}</Button>
                </span>
              </div>
            ))}
            {plan.full && waiting.length > 0 && <p className="ag-small m-0">{t('plans.full_note', 'The trip is full. Decline, or add seats, to confirm more people.')}</p>}
            {inTrip.length > 0 && (
              <>
                <p className="ag-eyebrow m-0 mt-2">{t('plans.in_trip', 'In the trip')}</p>
                {inTrip.map((r) => (
                  <div key={r.user.id} className="ag-plan-req" data-testid={`plan-member-${r.user.id}`}>
                    <span><PlanAvatar name={r.user.name} avatar={r.user.avatar} small /><b className="truncate">{r.user.name}</b></span>
                    <Status tone="ok">{t('plans.confirmed', 'Confirmed')}</Status>
                  </div>
                ))}
              </>
            )}
          </Box>
        )}

        {plan.days.length > 0 && (
          <Box className="ag-plan-sec">
            <h2>{t('plans.day_plan', 'Day by day')}</h2>
            <ol className="ag-plan-dayline">
              {plan.days.map((x) => (
                <li key={x.day}>
                  <b>{t('plans.day', 'Day')} {x.day}{plan.start_date ? ` · ${dayDate(plan.start_date, x.day - 1, lang)}` : ''}</b>
                  <span>{x.text}</span>
                </li>
              ))}
            </ol>
          </Box>
        )}

        {plan.notes && (
          <Box className="ag-plan-sec">
            <h2>{t('plans.notes_h', 'From the organiser')}</h2>
            <p className="ag-plan-notes">{plan.notes}</p>
          </Box>
        )}

        {plan.viewer?.join_status === 'accepted' && (
          <Box className="ag-plan-sec">
            <p className="ag-small m-0">{t('plans.accepted_s', 'You are in. The organiser sees you on the trip, and any change to the plan shows here.')}</p>
          </Box>
        )}

        <div className="ag-flowbar">
          {mine ? (
            <Button variant="stop" size="sm" onClick={remove} disabled={busy !== null} icon={<Trash />} data-testid="plan-delete">{t('plans.delete', 'Delete plan')}</Button>
          ) : user ? (
            <Button variant="text" size="sm" icon={<Flag />} data-testid="plan-report"
              onClick={() => setReport({ type: 'plan', id: plan.id, authorId: plan.organiser.id, authorName: plan.organiser.name })}>
              {t('plans.report', 'Report this plan')}
            </Button>
          ) : null}
        </div>
      </div>
      <ReportDialog target={report} onClose={() => setReport(null)} onBlocked={() => nav('/feed')} />
    </div>
  );
}
