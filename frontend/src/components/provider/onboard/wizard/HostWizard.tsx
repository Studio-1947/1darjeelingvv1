import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '@/lib/api';
import { rupees, useHostPlanPrice } from '@/lib/prices';
import { SUPPORTED_IMAGE_ACCEPT } from '@/lib/uploadImage';
import { distanceTo } from '@/lib/places';
import { isValidPhone } from '@/lib/hostFormChecks';
import { Box, Button, ButtonLink, FieldError, IconButton, StepBar, TextField } from '@/components/ag';
import { Icon, type IconName } from '@/components/ag/Icon';
import { HelpWhatsApp, useHostSignupInfo } from '@/components/provider/onboard/QuickFill';
import { HOST_TYPES, HUBS, MAX_PHOTOS, OFFERS, PRESETS, QUICK_DISHES, type HostType, type HostWizard, type Place } from './useHostWizard';

/*
 * The host sign-up wizard, laid out as the Aangan 2.0 prototype's V.biz / V.bizsetup
 * (provider.js, menu.js): business-type tiles with the charges box, then one question per screen.
 * Colours come from the theme variables only (styles/screens/onboard.css).
 */

const TYPE_ICON: Record<HostType, IconName> = { homestay: 'home', driver: 'car', guide: 'trek', cafe: 'cup', shop: 'bag' };

/** Prototype "Next": an auto-width red pill with the circled arrow. */
function NextButton({ onClick, children, ...rest }: { onClick: () => void; children: React.ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <Button variant="primary" go className="ag-onboard-next" onClick={onClick} {...rest}>{children}</Button>;
}

/** Step bar, "Step n / total" and the question over every step except done. */
function Frame({ w, title, sub, children, cta }: { w: HostWizard; title: React.ReactNode; sub?: React.ReactNode; children: React.ReactNode; cta?: React.ReactNode }) {
  const { t, i, steps, err, next } = w;
  const label = t('ob.wz.step', { n: i + 1, total: steps.length });
  return (
    <section className="ag-main ag-onboard" aria-labelledby="wz-q" data-testid={`wz-step-${steps[i]}`}>
      <StepBar total={steps.length} at={i} label={label} />
      <p className="ag-small">{label}</p>
      <h1 id="wz-q" className="ag-onboard-h1" tabIndex={-1}>{title}</h1>
      {sub != null && <p className="ag-small ag-onboard-sub">{sub}</p>}
      {children}
      <FieldError id="wz-err">{err}</FieldError>
      {cta ?? <NextButton onClick={next} data-testid="wz-next">{t('ob.wz.next')}</NextButton>}
    </section>
  );
}

/** The fee lines, with real prices from the server. `plain` = dotted list inside the charges box. */
function FeeList({ plain }: { plain?: boolean }) {
  const { t } = useTranslation();
  const full = useHostPlanPrice('homestay');
  const small = useHostPlanPrice('cafe');
  const { grace_bookings } = useHostSignupInfo();
  const lines = [
    t('ob.wz.fee_full', { price: rupees(full.base) }),
    t('ob.wz.fee_small', { price: rupees(small.base) }),
    t('ob.wz.fp_4', { count: grace_bookings, defaultValue: 'Pay now, or after your first {{count}} bookings' }),
  ];
  const tick = plain ? null : <Icon name="check" />;
  return (
    <ul className={`ag-onboard-fees${plain ? ' plain' : ''}`}>
      {lines.map((l) => <li key={l}>{tick}<span>{l}</span></li>)}
      <li className="hl">{tick}<span>{t('ob.wz.fp_5')}</span></li>
    </ul>
  );
}

/* ---------- 1. What do you want to list? ---------- */
function TypeStep({ w }: { w: HostWizard }) {
  const { t, d, set, pickType } = w;
  const { grace_bookings } = useHostSignupInfo();
  const pay: Array<{ k: 'now' | 'later'; icon: IconName; title: string; sub: string }> = [
    { k: 'now', icon: 'bag', title: t('ob.wz.ch_now', 'Pay when listing'), sub: t('ob.wz.ch_nowS', 'Pay the yearly charge now and go live today.') },
    {
      k: 'later', icon: 't_trip',
      title: t('ob.wz.ch_later', { count: grace_bookings, defaultValue: 'Pay after {{count}} bookings' }),
      sub: t('ob.wz.ch_laterS', { count: grace_bookings, defaultValue: 'List free now, pay after your first {{count}} bookings.' }),
    },
  ];
  return (
    <Frame w={w} title={t('ob.wz.what')} sub={t('ob.wz.onelist')}>
      <div className="ag-onboard-tiles" role="radiogroup" aria-label={t('ob.wz.what')}>
        {HOST_TYPES.map((ty) => (
          <button key={ty} type="button" role="radio" aria-checked={d.type === ty} className="ag-onboard-tile"
            onClick={() => pickType(ty)} data-testid={`wz-type-${ty}`}>
            <span className="ic"><Icon name={TYPE_ICON[ty]} /></span>
            <span className="radio" aria-hidden="true" />
            <b>{t(`ob.wz.t_${ty}`)}</b>
            <span className="ag-small">{t(`ob.wz.t_${ty}_s`)}</span>
          </button>
        ))}
      </div>

      <Box tone="blush" className="ag-onboard-charge">
        <span className="ag-eyebrow" data-testid="onboard-free-chip">{t('ob.wz.ch_eye')}</span>
        <FeeList plain />
        <span className="ag-eyebrow">{t('ob.wz.ch_when')}</span>
        <div className="ag-onboard-chopts" role="radiogroup" aria-label={t('ob.wz.ch_when')}>
          {pay.map((o) => (
            <button key={o.k} type="button" role="radio" aria-checked={d.payWhen === o.k} className="ag-onboard-chopt"
              onClick={() => set({ payWhen: o.k })} data-testid={`plan-${o.k}`}>
              <span className="top"><Icon name={o.icon} /><span className="rdot" aria-hidden="true" /></span>
              <b>{o.title}</b>
              <span className="ag-small">{o.sub}</span>
            </button>
          ))}
        </div>
        <p className="ag-small">{t('ob.wz.gst_note')}</p>
      </Box>
      <HelpWhatsApp type={d.type || undefined} />
    </Frame>
  );
}

/* ---------- 2. Where is it? ---------- */
type Found = { display_name: string; lat: number | string; lon: number | string };
function PlaceStep({ w }: { w: HostWizard }) {
  const { t, d, set, setErr } = w;
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Place[]>([]);
  const [looking, setLooking] = useState(false);
  const [locating, setLocating] = useState(false);

  // Typed names: the hubs first, then the geocoder (proxied by the backend) for villages and roads.
  useEffect(() => {
    const s = q.trim();
    if (s.length < 3) { setFound([]); return undefined; }
    setLooking(true);
    const id = window.setTimeout(async () => {
      try {
        const { data } = await api.get('/geocode/search', { params: { q: s } });
        setFound((data.results || []).slice(0, 6).map((r: Found) => ({
          name: String(r.display_name).split(',').slice(0, 2).join(',').trim(), lat: Number(r.lat), lng: Number(r.lon),
        })));
      } catch { setFound([]); } finally { setLooking(false); }
    }, 400);
    return () => window.clearTimeout(id);
  }, [q]);

  const hubs = q.trim() ? HUBS.filter((h) => h.name.toLowerCase().includes(q.trim().toLowerCase())) : HUBS;
  const chips = [...hubs, ...found.filter((f) => !hubs.some((h) => h.name === f.name))];

  const myLocation = () => {
    setErr('');
    if (!navigator.geolocation) { setErr(t('ob.wz.noloc')); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false);
        const here = { lat: p.coords.latitude, lng: p.coords.longitude };
        const km = (h: Place) => distanceTo(here, { latitude: h.lat, longitude: h.lng })?.km ?? 1e9;
        const near = [...HUBS].sort((a, b) => km(a) - km(b))[0];
        set({ place: { name: near?.name || 'Darjeeling', lat: here.lat, lng: here.lng } });
      },
      () => { setLocating(false); setErr(t('ob.wz.noloc')); },
      { timeout: 8000, maximumAge: 60000 },
    );
  };

  return (
    <Frame w={w} title={t('ob.wz.where')}>
      <div className="ag-onboard-loc">
        <label className="ag-onboard-search">
          <Icon name="search" />
          <input type="search" placeholder={t('ob.wz.wz_find')} value={q} onChange={(e) => setQ(e.target.value)}
            autoComplete="off" aria-label={t('ob.wz.wz_find')} data-testid="wz-place-search" />
        </label>
        <Button onClick={myLocation} disabled={locating} className="ag-onboard-myloc" icon={<Icon name="locate" />} data-testid="wz-myloc">
          {locating ? t('common.loading') : t('ob.wz.myloc')}
        </Button>
      </div>
      <div className="ag-onboard-pchips" role="list">
        {chips.map((p) => (
          <button key={`${p.name}${p.lat}`} type="button" className="ag-onboard-pchip" aria-pressed={d.place?.name === p.name}
            onClick={() => set({ place: p })} data-testid={`wz-place-${p.name}`}>
            <Icon name="pin" />{p.name}
          </button>
        ))}
      </div>
      {looking && <p className="ag-small">{t('common.loading')}</p>}
      {!looking && q.trim().length >= 3 && chips.length === 0 && <p className="ag-small">{t('ob.wz.tp_none')}</p>}
      {d.place && <p className="ag-small ag-onboard-picked"><Icon name="check" />{d.place.name}</p>}
    </Frame>
  );
}

/* ---------- 3. Your name and number ---------- */
function NameStep({ w }: { w: HostWizard }) {
  const { t, d, set } = w;
  const label = d.type === 'homestay' ? t('ob.wz.nmStay') : (d.type === 'cafe' || d.type === 'shop') ? t('ob.wz.nmShop') : t('ob.wz.name');
  // A full 10 digits that is not an Indian mobile shows at once; anything shorter waits for Next.
  const phoneBad = d.phone.length === 10 && !isValidPhone(d.phone);
  return (
    <Frame w={w} title={t('ob.wz.who')}>
      <TextField label={label} value={d.name} onChange={(e) => set({ name: e.target.value })} autoComplete="off" maxLength={120} data-testid="wz-name" />
      <TextField label={t('ob.wz.phone')} value={d.phone} onChange={(e) => set({ phone: e.target.value.replace(/\D/g, '').slice(0, 10) })}
        type="tel" inputMode="numeric" maxLength={10} autoComplete="tel-national" data-testid="onboard-phone"
        error={phoneBad ? t('ob.wz.badphone') : undefined} errorId="onboard-phone-error" />
    </Frame>
  );
}

/* ---------- 4a. Price (homestay, driver, guide) ---------- */
function PriceStep({ w }: { w: HostWizard }) {
  const { t, d, set } = w;
  const presets = (d.type && PRESETS[d.type]) || [];
  const n = Number(d.price) || 0;
  const bump = (by: number) => set({ price: String(Math.max(0, n + by)) });
  const stay = d.type === 'homestay';
  const rooms = stay && d.roomsMode;
  const setRoom = (k: number, patch: Partial<{ name: string; price: string; occ: string }>) => set({ rooms: d.rooms.map((r, j) => (j === k ? { ...r, ...patch } : r)) });
  return (
    <Frame w={w} title={stay ? t('ob.wz.prStay') : t('ob.wz.prDay')}>
      {stay && (
        <div className="ag-onboard-chips">
          <button type="button" className="ag-onboard-chip" aria-pressed={!rooms} onClick={() => set({ roomsMode: false })} data-testid="wz-price-one">{t('ob.wz.prOne')}</button>
          <button type="button" className="ag-onboard-chip" aria-pressed={rooms}
            onClick={() => set({ roomsMode: true, rooms: d.rooms.length ? d.rooms : [{ name: t('ob.wz.rStd'), price: String(n || 1000), occ: '2' }] })} data-testid="wz-price-rooms">
            {t('ob.wz.prRooms')}
          </button>
        </div>
      )}
      {!rooms ? (
        <>
          <Box>
            <div className="ag-onboard-stepper">
              <button type="button" className="round" aria-label={t('ob.wz.minus')} onClick={() => bump(-100)}>−</button>
              <label className="ag-onboard-priceedit">
                <span aria-hidden="true">₹</span>
                <input type="number" inputMode="numeric" min={0} step={50} value={d.price} aria-label={t('ob.wz.price')}
                  onChange={(e) => set({ price: e.target.value.replace(/[^\d]/g, '') })} data-testid="onboard-price" />
              </label>
              <button type="button" className="round" aria-label={t('ob.wz.plus')} onClick={() => bump(100)}>+</button>
            </div>
            <p className="ag-small text-center">{t('ob.wz.prEditS')}</p>
          </Box>
          <div className="ag-onboard-chips">
            {presets.map((v) => (
              <button key={v} type="button" className="ag-onboard-chip" aria-pressed={n === v} onClick={() => set({ price: String(v) })}>₹{v.toLocaleString('en-IN')}</button>
            ))}
          </div>
        </>
      ) : (
        <Box>
          <p className="ag-small">{t('ob.wz.roomsS2')}</p>
          {d.rooms.map((r, k) => (
            <div key={k} className="ag-onboard-roomrow">
              <input className="ag-in" value={r.name} placeholder={t('ob.wz.rnShort')} aria-label={t('ob.wz.rnShort')}
                onChange={(e) => setRoom(k, { name: e.target.value })} data-testid={`wz-room-name-${k}`} />
              <label className="ag-onboard-roomin">₹
                <input type="number" inputMode="numeric" min={0} value={r.price} placeholder="0" aria-label={t('ob.wz.price')}
                  onChange={(e) => setRoom(k, { price: e.target.value.replace(/[^\d]/g, '') })} data-testid={`wz-room-price-${k}`} />
              </label>
              <label className="ag-onboard-roomin"><Icon name="person" />
                <input type="number" inputMode="numeric" min={1} max={20} value={r.occ ?? '2'} aria-label={t('ob.wz.guests', 'Guests')}
                  onChange={(e) => setRoom(k, { occ: e.target.value.replace(/[^\d]/g, '').slice(0, 2) })} data-testid={`wz-room-occ-${k}`} />
              </label>
              <IconButton label={t('ob.wz.remove')} className="ag-onboard-x" onClick={() => set({ rooms: d.rooms.filter((_, j) => j !== k) })}><Icon name="close" /></IconButton>
            </div>
          ))}
          <Button className="self-start" icon={<Icon name="plus" />} onClick={() => set({ rooms: [...d.rooms, { name: '', price: '', occ: '2' }] })} data-testid="wz-add-room">{t('ob.wz.addroom')}</Button>
        </Box>
      )}
    </Frame>
  );
}

/* ---------- 4b. Your menu (cafe, shop) ---------- */
function MenuStep({ w }: { w: HostWizard }) {
  const { t, d, set, setErr, photoUrl } = w;
  const [upAt, setUpAt] = useState<number | null>(null);
  const quick = QUICK_DISHES.filter((q) => !d.menu.some((m) => m.name === q));
  const setDish = (k: number, patch: Partial<{ name: string; price: string; photo: string }>) => set({ menu: d.menu.map((m, j) => (j === k ? { ...m, ...patch } : m)) });
  const photo = async (k: number, f?: File) => {
    if (!f) return;
    setUpAt(k);
    try { setDish(k, { photo: await photoUrl(f) }); } catch (e) { setErr(typeof e === 'string' ? e : t('kyc.uploadFailed')); } finally { setUpAt(null); }
  };
  return (
    <Frame w={w} title={t('ob.wz.mn_h')} sub={t('ob.wz.mn_s')}>
      {quick.length > 0 && (
        <>
          <span className="ag-eyebrow">{t('ob.wz.mn_quick')}</span>
          <div className="ag-onboard-pchips">
            {quick.map((q) => (
              <button key={q} type="button" className="ag-onboard-pchip" onClick={() => set({ menu: [...d.menu, { name: q, price: '' }] })}>
                <Icon name="plus" />{q}
              </button>
            ))}
          </div>
        </>
      )}
      <Box>
        {d.menu.length === 0 && <p className="ag-small">{t('ob.wz.mn_need')}</p>}
        {d.menu.map((m, k) => (
          <div key={k} className="ag-onboard-mnrow">
            <label className={`ag-onboard-mnph${m.photo ? ' has' : ''}`} style={m.photo ? { backgroundImage: `url(${m.photo})` } : undefined} title={t('ob.wz.photo')}>
              {upAt === k ? <span className="ag-small">…</span> : !m.photo && <Icon name="plus" />}
              <input type="file" accept={SUPPORTED_IMAGE_ACCEPT} className="sr-only" onChange={(e) => photo(k, e.target.files?.[0])} aria-label={t('ob.wz.photo')} />
            </label>
            <div className="fields">
              <input className="ag-in" value={m.name} maxLength={40} placeholder={t('ob.wz.mn_dish')} aria-label={t('ob.wz.mn_dish')}
                onChange={(e) => setDish(k, { name: e.target.value })} data-testid={`wz-dish-name-${k}`} />
              <input className="ag-in" type="number" inputMode="numeric" min={0} value={m.price} placeholder={t('ob.wz.mn_price')} aria-label={t('ob.wz.mn_price')}
                onChange={(e) => setDish(k, { price: e.target.value.replace(/[^\d]/g, '') })} data-testid={`wz-dish-price-${k}`} />
            </div>
            <IconButton label={t('ob.wz.remove')} className="ag-onboard-x" onClick={() => set({ menu: d.menu.filter((_, j) => j !== k) })}><Icon name="close" /></IconButton>
          </div>
        ))}
        <Button className="self-start" onClick={() => set({ menu: [...d.menu, { name: '', price: '' }] })} data-testid="wz-add-dish">{t('ob.wz.mn_add')}</Button>
      </Box>
    </Frame>
  );
}

/* ---------- 5. What do you give? + photos ---------- */
function ExtrasStep({ w }: { w: HostWizard }) {
  const { t, d, set, addPhotos, uploading } = w;
  const keys = d.type ? OFFERS[d.type] : [];
  const toggle = (k: string) => set({ offers: d.offers.includes(k) ? d.offers.filter((x) => x !== k) : [...d.offers, k] });
  const count = d.photos.length;
  return (
    <Frame w={w} title={t('ob.wz.offers')}>
      <div className="ag-onboard-pchips">
        {keys.map((k) => (
          <button key={k} type="button" className="ag-onboard-pchip" aria-pressed={d.offers.includes(k)} onClick={() => toggle(k)} data-testid={`wz-offer-${k}`}>
            <Icon name={d.offers.includes(k) ? 'check' : 'plus'} />{t(`ob.wz.fo.${k}`)}
          </button>
        ))}
      </div>
      <Box className="ag-onboard-photos">
        <div className="head">
          <b>{t('ob.wz.wzph')}</b>
          <span className={`stat${count ? ' ok' : ''}`}>
            {count ? <><Icon name="check" />{t('ob.wz.photos_added', { count })}</> : t('ob.wz.wzph0')}
          </span>
        </div>
        <div className="grid3">
          {d.photos.map((src, k) => (
            <span key={src} className="cell" style={{ backgroundImage: `url(${src})` }}>
              {k === 0 && <span className="cover">{t('ob.wz.cover')}</span>}
              <button type="button" className="x" aria-label={t('ob.wz.remove')} onClick={() => set({ photos: d.photos.filter((_, j) => j !== k) })}><Icon name="close" /></button>
            </span>
          ))}
          {count < MAX_PHOTOS && (
            <label className="add">
              <Icon name="plus" />
              <span>{uploading ? t('common.loading') : count ? t('ob.wz.addmore') : t('ob.wz.addphotos')}</span>
              <input type="file" accept={SUPPORTED_IMAGE_ACCEPT} multiple className="sr-only" disabled={uploading}
                onChange={(e) => { addPhotos(e.target.files); e.target.value = ''; }} data-testid="wz-photos" />
            </label>
          )}
        </div>
        <p className="ag-small">{t('ob.wz.wzphS')}</p>
      </Box>
    </Frame>
  );
}

/* ---------- 6. Travellers will see this ---------- */
function ReviewStep({ w }: { w: HostWizard }) {
  const { t, d, busy, submit, startingPrice, offerLabels } = w;
  const from = startingPrice();
  const unit = d.type === 'homestay' ? t('ob.wz.night') : (d.type === 'driver' || d.type === 'guide') ? t('ob.wz.day') : '';
  const plan = useHostPlanPrice(d.type || 'homestay');
  const icon = d.type ? TYPE_ICON[d.type] : 'home';
  return (
    <Frame w={w} title={t('ob.wz.review')}
      cta={(
        <>
          <NextButton onClick={submit} disabled={busy} data-testid="onboard-submit">
            {busy ? t('common.loading') : d.payWhen === 'now' ? t('ob.wz.put_pay', { price: rupees(plan.base) }) : t('ob.wz.put')}
          </NextButton>
          <FeeList />
        </>
      )}>
      <article className="ag-onboard-card">
        <span className="pic" style={d.photos[0] ? { backgroundImage: `url(${d.photos[0]})` } : undefined}>
          {d.photos[0] ? <span className="tag"><Icon name={icon} /></span> : <Icon name={icon} />}
        </span>
        <span className="body">
          <span className="name">{d.name}</span>
          <span className="ag-small">{d.place?.name}</span>
          {from > 0 && <span><b className="price">₹{from.toLocaleString('en-IN')}</b> {unit && <span className="ag-small">{unit}</span>}</span>}
        </span>
      </article>
      {offerLabels().length > 0 && (
        <ul className="ag-onboard-facts">
          {offerLabels().map((l) => <li key={l}><Icon name="check" />{l}</li>)}
        </ul>
      )}
      <p className="ag-onboard-muted">+91 {d.phone}</p>
    </Frame>
  );
}

/* ---------- done ---------- */
function DoneStep({ w }: { w: HostWizard }) {
  const { t, d } = w;
  return (
    <section className="ag-main ag-onboard" data-testid="wz-done">
      <Box tone="blush" className="ag-onboard-done">
        <span className="big"><Icon name="party" /></span>
        <h1 tabIndex={-1}>{t('ob.wz.in_title')}</h1>
        <p>{t('ob.wz.in_body')}</p>
        <ButtonLink go to="/provider/dashboard" data-testid="wz-dashboard">{t('ob.wz.biz')}</ButtonLink>
        <ButtonLink go to="/my-listings" icon={<Icon name="plus" />} data-testid="wz-another">{d.type === 'driver' ? t('ob.wz.addveh') : t('ob.wz.addprop')}</ButtonLink>
      </Box>
    </section>
  );
}

/** The wizard body for the current step, inside the 720px column. */
export default function HostWizardScreens({ w }: { w: HostWizard }) {
  const screen = useMemo(() => w.step, [w.step]);
  const top = useRef<HTMLDivElement>(null);
  useEffect(() => { top.current?.querySelector<HTMLElement>('h1')?.focus?.({ preventScroll: true }); }, [screen]);
  return (
    <div className="ag-wrap" ref={top}>
      {screen === 'type' && <TypeStep w={w} />}
      {screen === 'place' && <PlaceStep w={w} />}
      {screen === 'name' && <NameStep w={w} />}
      {screen === 'price' && <PriceStep w={w} />}
      {screen === 'menu' && <MenuStep w={w} />}
      {screen === 'extras' && <ExtrasStep w={w} />}
      {screen === 'review' && <ReviewStep w={w} />}
      {screen === 'done' && <DoneStep w={w} />}
    </div>
  );
}
