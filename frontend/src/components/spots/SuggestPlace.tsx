import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { uploadImages, SUPPORTED_IMAGE_ACCEPT } from '@/lib/uploadImage';
import { HUBS } from '@/components/home/HomeFilterPanel';
import { Icon } from '@/components/ag/Icon';
import { Status, cx } from '@/components/ag';

/*
 * Suggest a place (prototype spots.js): a guest or a host proposes a spot aangan is missing. Name,
 * the town it is near, an area or landmark, a few lines, the entry (free or a ticket price) and up to
 * four photos. Sent to POST /api/spots/suggestions; the aangan team reviews it in the admin console,
 * and the sender sees where each one stands under "My suggestions" (GET /api/spots/suggestions/mine)
 * and gets a notification when it is decided.
 * Shown on Home (under Offbeat Places) and at the end of the Offbeat Places list, as the prototype does.
 * Styles: styles/screens/home.css (ag-home-sugg*).
 */

const MAX_PHOTOS = 4;
const MIN_DETAILS = 20;

export type Suggestion = {
  id: string; name: string; place: string; details: string; entry_price: number | null; photos: string[];
  status: 'pending' | 'approved' | 'rejected'; review_note: string | null; created_at: string;
  /** The spot it became, and whether the team has published it yet. */
  listing_id?: string | null; live?: boolean;
};

/** The explorer drawing on the Suggest a place box (the prototype's media/explorer.svg). */
function Explorer() {
  return (
    <svg className="explorer" viewBox="0 0 120 120" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 96 L26 70 L40 84 L58 60 L76 82 L92 66 L116 96" opacity=".45" />
      <path d="M4 104 H116" opacity=".45" />
      <path d="M38 40 Q60 30 82 40" />
      <path d="M46 40 Q48 24 60 22 Q72 24 74 40" />
      <path d="M46 40 Q44 56 50 62 Q60 70 70 62 Q76 56 74 40" />
      <rect x="40" y="44" width="16" height="14" rx="4" />
      <rect x="64" y="44" width="16" height="14" rx="4" />
      <path d="M56 50 H64" />
      <path d="M44 44 V40 M76 44 V40" />
      <path d="M38 52 Q32 54 30 62 M82 52 Q88 54 90 62" />
      <path d="M30 62 Q34 76 40 84 Q60 90 80 84 Q86 76 90 62" />
      <path d="M40 84 L38 110 M80 84 L82 110" />
      <path d="M52 68 Q60 74 68 68" />
      <path d="M86 46 L100 38 M86 54 L102 54" opacity=".6" />
    </svg>
  );
}

/** One of my suggestions (prototype suggCard): name, where it stands, place · entry · date, photos, details. */
function SuggestionCard({ s }: { s: Suggestion }) {
  const { t, i18n } = useTranslation();
  const date = new Date(s.created_at).toLocaleDateString(i18n.language || 'en-IN', { day: 'numeric', month: 'short' });
  const tone = s.status === 'approved' ? 'ok' : s.status === 'rejected' ? 'no' : 'pending';
  const label = s.status === 'approved'
    ? t('sugg.accepted', 'Accepted')
    : s.status === 'rejected' ? t('sugg.rejected', 'Not added') : t('sugg.pending', 'Waiting for the aangan team');
  return (
    <div className="ag-box ag-home-suggcard" data-testid={`my-sugg-${s.id}`}>
      <div className="head">
        <h3>{s.name}</h3>
        <Status tone={tone} data-testid={`my-sugg-status-${s.id}`}>{label}</Status>
      </div>
      <p className="ag-small m-0">
        {s.place} · {s.entry_price ? t('sugg.ticket_n', '₹{{n}} ticket', { n: s.entry_price }) : t('sugg.free', 'Free entry')} · {date}
      </p>
      {s.photos.length > 0 && (
        <div className="strip">{s.photos.map((p) => <span key={p} style={{ backgroundImage: `url(${p})` }} />)}</div>
      )}
      <p className="ag-small m-0">{s.details}</p>
      {s.status === 'approved' && (s.live && s.listing_id ? (
        <Link to={`/listing/${s.listing_id}`} className="ag-small m-0 font-medium text-[var(--r)] underline" data-testid={`my-sugg-live-${s.id}`}>
          {t('sugg.live', 'Live on Offbeat Places. See it')}
        </Link>
      ) : <p className="ag-small m-0">{t('sugg.accepted_s', 'The aangan team will publish it on Offbeat Places once it is ready.')}</p>)}
      {s.status === 'rejected' && s.review_note && <p className="ag-small m-0" data-testid={`my-sugg-note-${s.id}`}>{s.review_note}</p>}
    </div>
  );
}

/** "My suggestions": the places this person suggested, newest first. Nothing when there are none. */
export function MySuggestions({ items }: { items: Suggestion[] }) {
  const { t } = useTranslation();
  const [all, setAll] = useState(false);
  if (!items.length) return null;
  // The three newest; the rest behind "Show all", so the box stays short on Home.
  const shown = all ? items : items.slice(0, 3);
  return (
    <div className="ag-home-suggmine" id="my-suggestions" data-testid="my-suggestions">
      <h3 className="ag-home-suggh">{t('sugg.mine', 'My suggestions')}</h3>
      {shown.map((s) => <SuggestionCard key={s.id} s={s} />)}
      {items.length > shown.length && (
        <button type="button" className="ag-btn text self-start" onClick={() => setAll(true)} data-testid="my-suggestions-all">
          {t('sugg.show_all', 'Show all ({{n}})', { n: items.length })}
        </button>
      )}
    </div>
  );
}

export default function SuggestPlace() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { user } = useAuth() as { user: unknown };
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [place, setPlace] = useState(HUBS[0]);
  const [area, setArea] = useState('');
  const [details, setDetails] = useState('');
  const [free, setFree] = useState(true);
  const [price, setPrice] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [err, setErr] = useState('');
  const [mine, setMine] = useState<Suggestion[]>([]);

  useEffect(() => {
    if (!user) { setMine([]); return undefined; }
    let live = true;
    api.get('/spots/suggestions/mine')
      .then((r) => {
        if (!live) return;
        setMine(Array.isArray(r.data?.suggestions) ? r.data.suggestions : []);
        // Arriving from a suggestion notice (#my-suggestions): bring the list into view.
        if (window.location.hash === '#my-suggestions') setTimeout(() => document.getElementById('my-suggestions')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
      })
      .catch(() => { /* the list is a courtesy; the form still works */ });
    return () => { live = false; };
  }, [user]);

  const addPhotos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).slice(0, MAX_PHOTOS - photos.length);
    e.target.value = '';
    if (!files.length) return;
    setUploading(true);
    setErr('');
    try {
      const urls = await uploadImages(files);
      setPhotos((p) => [...p, ...urls].slice(0, MAX_PHOTOS));
    } catch (m) {
      setErr(typeof m === 'string' ? m : t('sugg.upload_error', 'That photo did not upload. Please try again.'));
    } finally {
      setUploading(false);
    }
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (state === 'sending' || uploading) return;
    if (name.trim().length < 3) { setErr(t('sugg.need_name', 'Please write the name of the place.')); return; }
    if (details.trim().length < MIN_DETAILS) { setErr(t('sugg.need_details', 'Add a few lines about the place (20+ characters).')); return; }
    const n = Number(price);
    if (!free && (!price || !Number.isInteger(n) || n < 1)) { setErr(t('sugg.need_price', 'Write the ticket price in rupees, or pick Free entry.')); return; }
    setErr('');
    setState('sending');
    try {
      const { data } = await api.post('/spots/suggestions', {
        name: name.trim(), place, area: area.trim(), details: details.trim(), entry_price: free ? null : n, photos,
      });
      setMine((m) => [data.suggestion, ...m]);
      setName(''); setArea(''); setDetails(''); setFree(true); setPrice(''); setPhotos([]);
      setOpen(false);
      setState('sent');
    } catch (ex: any) {
      setState('idle');
      setErr(ex?.response?.data?.detail || t('home.sugg_error', 'That did not go through. Please try again.'));
    }
  };

  const go = <span className="go" aria-hidden="true"><Icon name="arrowne" /></span>;

  return (
    <div className="ag-home-sugg" data-testid="home-suggest">
      <div className="row">
        <Explorer />
        <div className="grow">
          <b>{state === 'sent' ? t('home.sugg_sent', 'Thank you. Sent to the aangan team.') : t('home.suggest', 'Suggest a place')}</b>
          <span className="small">
            {state === 'sent'
              ? t('sugg.wait', 'We check every suggestion and publish it on Offbeat Places. We will tell you here when it is live.')
              : t('home.suggest_sub', 'Know a spot we are missing? Tell us. The aangan team checks it and publishes it for everyone.')}
          </span>
        </div>
      </div>
      {!open && (
        user ? (
          <button type="button" className="ag-home-softbtn" onClick={() => { setOpen(true); setState('idle'); }} data-testid="home-suggest-open">
            {t('home.suggest', 'Suggest a place')}{go}
          </button>
        ) : (
          <Link to={`/login?next=${encodeURIComponent(pathname)}`} className="ag-home-softbtn" data-testid="home-suggest-login">
            {t('home.suggest', 'Suggest a place')}{go}
          </Link>
        )
      )}
      {open && (
        <form onSubmit={send} className="flex flex-col gap-3" noValidate>
          <label className="ag-field">
            <span>{t('home.spot_name', 'Name of the place')}</span>
            <input className="ag-in" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} data-testid="home-suggest-name" autoFocus />
          </label>
          <label className="ag-field">
            <span>{t('sugg.place', 'Place')}</span>
            <select className="ag-in" value={place} onChange={(e) => setPlace(e.target.value)} data-testid="home-suggest-place">
              {HUBS.map((h) => <option key={h} value={h}>{h}</option>)}
            </select>
          </label>
          <label className="ag-field">
            <span>{t('sugg.area', 'Area or landmark')}</span>
            <input className="ag-in" value={area} onChange={(e) => setArea(e.target.value)} maxLength={80} data-testid="home-suggest-area" />
          </label>
          <label className="ag-field">
            <span>{t('sugg.details', 'Details')}</span>
            <textarea className="ag-in" value={details} onChange={(e) => setDetails(e.target.value)} maxLength={2000} rows={4}
              placeholder={t('home.spot_details', 'What is special about it? How to reach, best time, what to carry.')} data-testid="home-suggest-details" />
          </label>
          <p className="ag-home-suggeye">{t('sugg.entry', 'Entry')}</p>
          <div className="ag-home-suggtwo" role="group" aria-label={t('sugg.entry', 'Entry')}>
            <button type="button" className={cx('ag-home-ftonal', free && 'on')} aria-pressed={free} onClick={() => setFree(true)} data-testid="home-suggest-free">
              {t('sugg.free', 'Free entry')}
            </button>
            <button type="button" className={cx('ag-home-ftonal', !free && 'on')} aria-pressed={!free} onClick={() => setFree(false)} data-testid="home-suggest-ticket">
              {t('sugg.ticket', 'Ticket')}
            </button>
          </div>
          {!free && (
            <label className="ag-field">
              <span>{t('sugg.ticket_amt', 'Ticket price per person (₹)')}</span>
              <input className="ag-in" type="number" inputMode="numeric" min={1} max={100000} value={price}
                onChange={(e) => setPrice(e.target.value)} data-testid="home-suggest-price" />
            </label>
          )}
          <p className="ag-home-suggeye">{t('sugg.photos', 'Photos (up to 4)')}</p>
          {photos.length > 0 && (
            <div className="ag-home-sugggal">
              {photos.map((p, i) => (
                <span key={p} className="pic" style={{ backgroundImage: `url(${p})` }}>
                  <button type="button" onClick={() => setPhotos((all) => all.filter((_, k) => k !== i))}
                    aria-label={t('sugg.remove_photo', 'Remove photo')} data-testid={`home-suggest-rm-${i}`}><Icon name="close" /></button>
                </span>
              ))}
            </div>
          )}
          {photos.length < MAX_PHOTOS && (
            <label className={cx('ag-home-ftonal self-start', uploading && 'opacity-60')}>
              <Icon name="download" />
              <span>{uploading ? t('sugg.uploading', 'Uploading…') : t('sugg.add_photos', 'Add photos')}</span>
              <input type="file" accept={SUPPORTED_IMAGE_ACCEPT} multiple className="sr-only" onChange={addPhotos} disabled={uploading}
                data-testid="home-suggest-photos" />
            </label>
          )}
          {err && <p className="ag-err m-0" role="alert" data-testid="home-suggest-error">{err}</p>}
          <button type="submit" className="ag-home-redbtn self-start" disabled={state === 'sending' || uploading} data-testid="home-suggest-send">
            {t('sugg.send', 'Send to the aangan team')}{go}
          </button>
        </form>
      )}
      <MySuggestions items={mine} />
    </div>
  );
}
