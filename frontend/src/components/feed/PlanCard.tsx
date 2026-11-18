import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { CircleNotch as Loader2, EyeSlash } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { Box, Button, IconButton, Status, cx } from '@/components/ag';
import { Icon } from '@/components/ag/Icon';
import '@/styles/screens/plans.css';
import { apiError, askToJoin, leavePlan, planDate, rupees, setPlanSaved, type TripPlan } from '@/lib/plans';

/** A round initial (or photo) for a person on a plan. */
export function PlanAvatar({ name, avatar, small }: { name: string; avatar: string | null; small?: boolean }) {
  return avatar
    ? <img src={avatar} alt="" className={cx('ag-plan-av', small && 'sm')} />
    : <span className={cx('ag-plan-av', small && 'sm')} aria-hidden="true">{(name || 'a').trim().charAt(0).toUpperCase()}</span>;
}

/** Share a plan: the phone's share sheet, or WhatsApp on a desktop (prototype plans.js). */
export function sharePlan(plan: TripPlan, t: TFunction, lang: string) {
  const url = `${window.location.origin}/plan/${plan.id}`;
  const bits = [
    plan.stops.map((s) => s.place).join(' → '),
    plan.start_date ? planDate(plan.start_date, lang) : '',
    `${plan.nights} ${t('plans.nights_n', 'nights')}`,
    plan.cost_per_person != null ? `${rupees(plan.cost_per_person)} ${t('plans.per_person', 'per person')}` : '',
  ].filter(Boolean);
  const text = `${t('plans.share_msg', 'Join my trip on aangan:')} ${plan.title} — ${bits.join(', ')}. ${url}`;
  if (navigator.share) {
    navigator.share({ title: plan.title, text, url }).catch(() => {});
    return;
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
}

/**
 * A trip plan in the Feed (prototype plans.js planCard): the TRIP PLAN band with the date and
 * nights, the organiser, the title, the route, the homestay and driver rows (linking to their
 * listings), the cost per person, who has joined against the seats, then Ask to join · seats
 * left, share and save. The organiser sees their seats left and waiting requests instead.
 */
export default function PlanCard({
  plan: initial,
  onChange,
  preview = false,
}: {
  plan: TripPlan;
  onChange?: (plan: TripPlan) => void;
  /** The editor's "Check your plan" step: no actions. */
  preview?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const nav = useNavigate();
  const [plan, setPlan] = useState(initial);
  const [busy, setBusy] = useState<'join' | 'save' | null>(null);
  const [sent, setSent] = useState(false);
  React.useEffect(() => setPlan(initial), [initial]);

  const update = (p: TripPlan) => { setPlan(p); onChange?.(p); };
  const mine = !!plan.viewer?.is_organiser;
  const status = plan.viewer?.join_status ?? null;
  const saved = !!plan.viewer?.saved;
  const toLogin = () => nav(`/login?next=${encodeURIComponent(`/plan/${plan.id}`)}`);

  const join = async () => {
    if (!user) return toLogin();
    setBusy('join');
    try {
      update(await askToJoin(plan.id));
      setSent(true);
    } catch (e) {
      toast.error(apiError(e, t('plans.join_failed', 'Could not send your request. Try again.')));
    } finally {
      setBusy(null);
    }
  };

  const leave = async () => {
    setBusy('join');
    try {
      const p = await leavePlan(plan.id);
      if (p) update(p);
    } catch (e) {
      toast.error(apiError(e, t('plans.join_failed', 'Could not send your request. Try again.')));
    } finally {
      setBusy(null);
    }
  };

  const toggleSave = async () => {
    if (!user) return toLogin();
    setBusy('save');
    try {
      await setPlanSaved(plan.id, !saved);
      update({ ...plan, viewer: { is_organiser: mine, join_status: status, ...plan.viewer, saved: !saved } });
    } catch (e) {
      toast.error(apiError(e, t('plans.save_failed', 'Could not save this plan.')));
    } finally {
      setBusy(null);
    }
  };

  const spin = <Loader2 className="animate-spin" />;
  const row = (icon: 'home' | 'car', l: TripPlan['stay'], testId: string) => l ? (
    <Link to={`/listing/${l.id}`} className="ag-plan-row" data-testid={testId}>
      <Icon name={icon} /><span className="min-w-0 truncate">{l.title} · {l.location}</span>
    </Link>
  ) : (
    <span className="ag-plan-row none" data-testid={testId}><Icon name={icon} /><span>{t('plans.none_yet', 'Not chosen yet')}</span></span>
  );

  return (
    <Box as="article" className="ag-plan" data-testid={`plan-${plan.id}`}>
      <div className="ag-plan-band">
        <Icon name="t_trip" />
        <b>{t('plans.trip_plan', 'Trip plan')}</b>
        <span>{[planDate(plan.start_date, i18n.language === 'en' ? 'en-IN' : i18n.language), `${plan.nights} ${t('plans.nights_n', 'nights')}`].filter(Boolean).join(' · ')}</span>
      </div>

      {plan.hidden && (
        <Status tone="no" className="self-start"><EyeSlash size={14} /> {t('plans.hidden_notice', 'Hidden by the aangan team')}</Status>
      )}

      <Link to={`/plan/${plan.id}`} className="ag-plan-head" data-testid={`plan-open-${plan.id}`}>
        <PlanAvatar name={plan.organiser.name} avatar={plan.organiser.avatar} />
        <span className="min-w-0 flex-1">
          <b className="block truncate">{plan.organiser.name}</b>
          <span className="ag-small block">{mine ? t('plans.your_plan', 'Your plan') : t('plans.trip_plan', 'Trip plan')}</span>
        </span>
        {!preview && <Icon name="arrowne" className="ag-feed-pgo" />}
      </Link>

      {plan.cover && <img src={plan.cover} alt="" loading="lazy" className="ag-plan-cover" />}
      <h2 className="ag-plan-title">{plan.title}</h2>
      <p className="ag-plan-route" aria-label={t('plans.route', 'Your route')}>
        {plan.stops.map((s, i) => (
          <React.Fragment key={s.place + i}>
            {i > 0 && <Icon name="arrowne" />}
            <span>{s.place}</span>
          </React.Fragment>
        ))}
      </p>

      <div className="ag-plan-rows">
        {row('home', plan.stay, `plan-stay-${plan.id}`)}
        {row('car', plan.driver, `plan-driver-${plan.id}`)}
      </div>

      <div className="ag-plan-cost">
        <span>
          <span className="ag-small block">{t('plans.cost', 'Cost per person')}</span>
          <b className="ag-plan-price">{plan.cost_per_person != null ? rupees(plan.cost_per_person) : '—'}</b>
        </span>
        <span className="ag-plan-joiners" aria-label={`${plan.joined_count}/${plan.seats}`}>
          {plan.members.map((m) => <i key={m.id} title={m.name}>{(m.name || 'a').charAt(0).toUpperCase()}</i>)}
          <span className="ag-small">{plan.joined_count}/{plan.seats}</span>
        </span>
      </div>

      {!preview && (
        <div className="ag-plan-act">
          {mine ? (
            <Link to={`/plan/${plan.id}`} className="ag-plan-stat ok" data-testid={`plan-mine-${plan.id}`}>
              <Icon name="check" />
              {t('plans.your_plan', 'Your plan')} · {plan.seats_left} {t('plans.seats_left', 'seats left')}
              {plan.pending_count ? ` · ${plan.pending_count} ${plan.pending_count === 1 ? t('plans.request_1', 'request') : t('plans.requests_n', 'requests')}` : ''}
            </Link>
          ) : status === 'accepted' || status === 'pending' ? (
            <>
              <span className={cx('ag-plan-stat', status === 'accepted' && 'ok')} data-testid={`plan-status-${plan.id}`}>
                <Icon name={status === 'accepted' ? 'check' : 'bell'} />
                {status === 'accepted' ? t('plans.confirmed', 'Confirmed') : t('plans.waiting', 'Waiting for confirmation')}
              </span>
              <Button variant="stop" size="sm" onClick={leave} disabled={busy !== null} data-testid={`plan-leave-${plan.id}`}
                icon={busy === 'join' ? spin : <Icon name="close" />}>
                {t('plans.changed', 'Plans changed')}
              </Button>
            </>
          ) : status === 'declined' ? (
            <span className="ag-plan-stat no" data-testid={`plan-status-${plan.id}`}>{t('plans.declined', 'Not confirmed')}</span>
          ) : plan.full ? (
            <Button size="sm" disabled data-testid={`plan-join-${plan.id}`}>{t('plans.full', 'Full')}</Button>
          ) : (
            <Button size="sm" onClick={join} disabled={busy !== null} data-testid={`plan-join-${plan.id}`}
              icon={busy === 'join' ? spin : <Icon name="person" />}>
              {t('plans.ask_join', 'Ask to join')} · {plan.seats_left}
            </Button>
          )}
          <span className="ag-plan-ics">
            <IconButton label={t('plans.share', 'Share')} onClick={() => sharePlan(plan, t, i18n.language)} data-testid={`plan-share-${plan.id}`}>
              <Icon name="share" />
            </IconButton>
            {!mine && (
              <IconButton label={t('plans.save', 'Save')} on={saved} aria-pressed={saved} onClick={toggleSave} disabled={busy !== null}
                className="ag-plan-save" data-testid={`plan-save-${plan.id}`}>
                <Icon name="heart" />
              </IconButton>
            )}
          </span>
        </div>
      )}

      {sent && (
        <div className="ag-plan-pop" role="dialog" aria-modal="true" aria-labelledby={`plan-sent-${plan.id}`} data-testid="plan-sent">
          <div className="ag-plan-popbox">
            <span className="ag-plan-popdot"><Icon name="check" /></span>
            <h2 id={`plan-sent-${plan.id}`}>{t('plans.sent_h', 'Request sent')}</h2>
            <p className="m-0"><b>{plan.title}</b></p>
            <p className="ag-small m-0">{t('plans.sent_s', 'The organiser will confirm your seat. You will get a notification, and the plan shows where you stand.')}</p>
            <div className="ag-plan-popact">
              <Button variant="primary" go onClick={() => nav(`/plan/${plan.id}`)} data-testid="plan-sent-open">{t('plans.sent_open', 'Open the plan')}</Button>
              <Button variant="text" onClick={() => setSent(false)} data-testid="plan-sent-later">{t('plans.sent_later', 'Later')}</Button>
            </div>
          </div>
        </div>
      )}
    </Box>
  );
}
