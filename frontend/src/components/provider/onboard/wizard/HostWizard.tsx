import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  House, Car, PersonSimpleHike, Coffee, ShoppingBag, MagnifyingGlass, Crosshair, MapPin, Check, Plus, X,
  Minus, Confetti, Storefront, CircleNotch,
} from '@phosphor-icons/react';
import api from '@/lib/api';
import { rupees, useHostPlanPrice } from '@/lib/prices';
import { SUPPORTED_IMAGE_ACCEPT, uploadImage } from '@/lib/uploadImage';
import { distanceTo } from '@/lib/places';
import { isValidPhone } from '@/lib/hostFormChecks';
import { Box, Button, ButtonLink, Chip, Chips, FieldError, IconButton, Option, StepBar, TextField } from '@/components/ag';
import { HelpWhatsApp, useHostSignupInfo } from '@/components/provider/onboard/QuickFill';
import { HOST_TYPES, HUBS, MAX_PHOTOS, OFFERS, PRESETS, QUICK_DISHES, type HostType, type HostWizard, type Place } from './useHostWizard';

const TYPE_ICON: Record<HostType, React.ElementType> = { homestay: House, driver: Car, guide: PersonSimpleHike, cafe: Coffee, shop: ShoppingBag };

/** Question, step bar and "Step n / total" over every step except done. */
function Frame({ w, title, sub, children, cta }: { w: HostWizard; title: React.ReactNode; sub?: React.ReactNode; children: React.ReactNode; cta?: React.ReactNode }) {
  const { t, i, steps, err, next } = w;
  return (
    <section className="ag-main" aria-labelledby="wz-q" data-testid={`wz-step-${steps[i]}`}>
      <StepBar total={steps.length} at={i} label={t('ob.wz.step', { n: i + 1, total: steps.length })} />
      <div className="ag-q">
        <p className="ag-small">{t('ob.wz.step', { n: i + 1, total: steps.length })}</p>
        <h1 id="wz-q">{title}</h1>
        {sub != null && <p className="ag-small">{sub}</p>}
      </div>
      {children}
      <FieldError id="wz-err">{err}</FieldError>
      <div className="ag-flowbar">
        {cta ?? <Button variant="primary" go block onClick={next} data-testid="wz-next">{t('ob.wz.next')}</Button>}
      </div>
    </section>
  );
}

/* ---------- 1. What do you want to list? ---------- */
function TypeStep({ w }: { w: HostWizard }) {
  const { t, d, set, pickType } = w;
  const full = useHostPlanPrice('homestay');
  const small = useHostPlanPrice('cafe');
  const { grace_bookings } = useHostSignupInfo();
  const plan = useHostPlanPrice(d.type || 'homestay');
  const price = rupees(plan.base);
  return (
    <Frame w={w} title={t('ob.wz.what')} sub={t('ob.wz.onelist')}>
      <div className="ag-pick" role="radiogroup" aria-label={t('ob.wz.what')}>
        {HOST_TYPES.map((ty) => {
          const Icon = TYPE_ICON[ty];
          return (
            <Option key={ty} role="radio" aria-checked={d.type === ty} on={d.type === ty} onClick={() => pickType(ty)} data-testid={`wz-type-${ty}`}
              icon={<Icon />} title={t(`ob.wz.t_${ty}`)} sub={t(`ob.wz.t_${ty}_s`)} />
          );
        })}
      </div>

      <Box>
        <span className="ag-eyebrow" data-testid="onboard-free-chip">{t('ob.wz.ch_eye')}</span>
        <ul className="grid gap-1.5 ag-small !text-[var(--ink7)]">
          <li>{t('ob.wz.fee_full', { price: rupees(full.base) })}</li>
          <li>{t('ob.wz.fee_small', { price: rupees(small.base) })}</li>
          <li>{t('ob.free.chip', { count: grace_bookings })}</li>
          <li className="font-medium text-[var(--ink-strong)]">{t('ob.wz.fp_5')}</li>
        </ul>
        <span className="ag-eyebrow">{t('ob.wz.ch_when')}</span>
        <div className="ag-pick" role="radiogroup" aria-label={t('ob.wz.ch_when')}>
          <Option role="radio" aria-checked={d.payWhen === 'later'} on={d.payWhen === 'later'} onClick={() => set({ payWhen: 'later' })} data-testid="plan-later"
            title={t('plan_card.later_title')} sub={t('plan_card.later_body', { price, count: grace_bookings })} />
          <Option role="radio" aria-checked={d.payWhen === 'now'} on={d.payWhen === 'now'} onClick={() => set({ payWhen: 'now' })} data-testid="plan-now"
            title={t('plan_card.now_title')} sub={t('plan_card.now_body', { price })} />
        </div>
        <p className="ag-small">{t('ob.wz.gst_note')}</p>
      </Box>
      <HelpWhatsApp type={d.type || undefined} className="self-start" />
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
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="relative flex-1">
          <MagnifyingGlass className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--ink-muted)]" aria-hidden="true" />
          <input type="search" className="ag-in !pl-12" placeholder={t('ob.wz.wz_find')} value={q} onChange={(e) => setQ(e.target.value)}
            autoComplete="off" aria-label={t('ob.wz.wz_find')} data-testid="wz-place-search" />
        </label>
        <Button onClick={myLocation} disabled={locating} icon={locating ? <CircleNotch className="animate-spin" /> : <Crosshair />} data-testid="wz-myloc">
          {t('ob.wz.myloc')}
        </Button>
      </div>
      <Chips role="list">
        {chips.map((p) => (
          <Chip key={`${p.name}${p.lat}`} on={d.place?.name === p.name} onClick={() => set({ place: p })} data-testid={`wz-place-${p.name}`}>
            <MapPin aria-hidden="true" />{p.name}
          </Chip>
        ))}
      </Chips>
      {looking && <p className="ag-small">{t('common.loading')}</p>}
      {!looking && q.trim().length >= 3 && chips.length === 0 && <p className="ag-small">{t('ob.wz.tp_none')}</p>}
      {d.place && <p className="ag-small inline-flex items-center gap-1.5 !text-[var(--ok)]"><Check weight="bold" aria-hidden="true" />{d.place.name}</p>}
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
  const setRoom = (k: number, patch: Partial<{ name: string; price: string }>) => set({ rooms: d.rooms.map((r, j) => (j === k ? { ...r, ...patch } : r)) });
  return (
    <Frame w={w} title={stay ? t('ob.wz.prStay') : t('ob.wz.prDay')}>
      {stay && (
        <Chips>
          <Chip on={!rooms} onClick={() => set({ roomsMode: false })} data-testid="wz-price-one">{t('ob.wz.prOne')}</Chip>
          <Chip on={rooms} onClick={() => set({ roomsMode: true, rooms: d.rooms.length ? d.rooms : [{ name: t('ob.wz.rStd'), price: String(n || 1000) }] })} data-testid="wz-price-rooms">
            {t('ob.wz.prRooms')}
          </Chip>
        </Chips>
      )}
      {!rooms ? (
        <>
          <Box>
            <div className="ag-stepper">
              <IconButton label={t('ob.wz.minus')} tint onClick={() => bump(-100)}><Minus /></IconButton>
              <label className="flex items-baseline gap-1 n">
                <span aria-hidden="true">₹</span>
                <input type="number" inputMode="numeric" min={0} step={50} value={d.price} aria-label={t('ob.wz.price')}
                  onChange={(e) => set({ price: e.target.value.replace(/[^\d]/g, '') })} data-testid="onboard-price"
                  className="w-[6ch] bg-transparent text-center outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" />
              </label>
              <IconButton label={t('ob.wz.plus')} tint onClick={() => bump(100)}><Plus /></IconButton>
            </div>
            <p className="ag-small text-center">{t('ob.wz.prEditS')}</p>
          </Box>
          <Chips>
            {presets.map((v) => <Chip key={v} on={n === v} onClick={() => set({ price: String(v) })}>₹{v.toLocaleString('en-IN')}</Chip>)}
          </Chips>
        </>
      ) : (
        <Box>
          <p className="ag-small">{t('ob.wz.roomsS2')}</p>
          {d.rooms.map((r, k) => (
            <div key={k} className="flex items-center gap-2">
              <input className="ag-in flex-1 min-w-0" value={r.name} placeholder={t('ob.wz.rnShort')} aria-label={t('ob.wz.rnShort')}
                onChange={(e) => setRoom(k, { name: e.target.value })} data-testid={`wz-room-name-${k}`} />
              <input className="ag-in !w-32" type="number" inputMode="numeric" min={0} value={r.price} placeholder="₹" aria-label={t('ob.wz.price')}
                onChange={(e) => setRoom(k, { price: e.target.value.replace(/[^\d]/g, '') })} data-testid={`wz-room-price-${k}`} />
              <IconButton label={t('ob.wz.remove')} small onClick={() => set({ rooms: d.rooms.filter((_, j) => j !== k) })}><X /></IconButton>
            </div>
          ))}
          <Button size="sm" icon={<Plus />} onClick={() => set({ rooms: [...d.rooms, { name: '', price: '' }] })} data-testid="wz-add-room">{t('ob.wz.addroom')}</Button>
        </Box>
      )}
    </Frame>
  );
}

/* ---------- 4b. Your menu (cafe, shop) ---------- */
function MenuStep({ w }: { w: HostWizard }) {
  const { t, d, set, setErr } = w;
  const [upAt, setUpAt] = useState<number | null>(null);
  const quick = QUICK_DISHES.filter((q) => !d.menu.some((m) => m.name === q));
  const setDish = (k: number, patch: Partial<{ name: string; price: string; photo: string }>) => set({ menu: d.menu.map((m, j) => (j === k ? { ...m, ...patch } : m)) });
  const photo = async (k: number, f?: File) => {
    if (!f) return;
    setUpAt(k);
    try { setDish(k, { photo: await uploadImage(f) }); } catch (e) { setErr(typeof e === 'string' ? e : t('kyc.uploadFailed')); } finally { setUpAt(null); }
  };
  return (
    <Frame w={w} title={t('ob.wz.mn_h')} sub={t('ob.wz.mn_s')}>
      {quick.length > 0 && (
        <>
          <span className="ag-eyebrow">{t('ob.wz.mn_quick')}</span>
          <Chips>
            {quick.map((q) => <Chip key={q} onClick={() => set({ menu: [...d.menu, { name: q, price: '' }] })}><Plus aria-hidden="true" />{q}</Chip>)}
          </Chips>
        </>
      )}
      <Box>
        {d.menu.length === 0 && <p className="ag-small">{t('ob.wz.mn_need')}</p>}
        {d.menu.map((m, k) => (
          <div key={k} className="flex items-center gap-2">
            <label className="relative w-14 h-14 flex-none rounded-2xl overflow-hidden grid place-items-center cursor-pointer bg-[var(--creme2)] text-[var(--r)] bg-cover bg-center"
              style={m.photo ? { backgroundImage: `url(${m.photo})` } : undefined} title={t('ob.wz.photo')}>
              {upAt === k ? <CircleNotch className="animate-spin" /> : !m.photo && <Plus aria-hidden="true" />}
              <input type="file" accept={SUPPORTED_IMAGE_ACCEPT} className="sr-only" onChange={(e) => photo(k, e.target.files?.[0])} aria-label={t('ob.wz.photo')} />
            </label>
            <input className="ag-in flex-1 min-w-0" value={m.name} maxLength={40} placeholder={t('ob.wz.mn_dish')} aria-label={t('ob.wz.mn_dish')}
              onChange={(e) => setDish(k, { name: e.target.value })} data-testid={`wz-dish-name-${k}`} />
            <input className="ag-in !w-28" type="number" inputMode="numeric" min={0} value={m.price} placeholder={t('ob.wz.mn_price')} aria-label={t('ob.wz.mn_price')}
              onChange={(e) => setDish(k, { price: e.target.value.replace(/[^\d]/g, '') })} data-testid={`wz-dish-price-${k}`} />
            <IconButton label={t('ob.wz.remove')} small onClick={() => set({ menu: d.menu.filter((_, j) => j !== k) })}><X /></IconButton>
          </div>
        ))}
        <Button size="sm" onClick={() => set({ menu: [...d.menu, { name: '', price: '' }] })} data-testid="wz-add-dish">{t('ob.wz.mn_add')}</Button>
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
      <Chips>
        {keys.map((k) => (
          <Chip key={k} on={d.offers.includes(k)} onClick={() => toggle(k)} data-testid={`wz-offer-${k}`}>
            {d.offers.includes(k) ? <Check weight="bold" aria-hidden="true" /> : <Plus aria-hidden="true" />}{t(`ob.wz.fo.${k}`)}
          </Chip>
        ))}
      </Chips>
      <Box>
        <div className="ag-row justify-between">
          <h2>{t('ob.wz.wzph')}</h2>
          <span className={`ag-status${count ? ' ok' : ''}`}>
            {count ? <><Check weight="bold" aria-hidden="true" />{t('ob.wz.photos_added', { count })}</> : t('ob.wz.wzph0')}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {d.photos.map((src, k) => (
            <div key={src} className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-[var(--creme2)]">
              <img src={src} alt="" className="w-full h-full object-cover" />
              {k === 0 && <span className="absolute left-1.5 bottom-1.5 ag-status info">{t('ob.wz.cover')}</span>}
              <button type="button" className="absolute right-1.5 top-1.5 ag-iconbtn sm" aria-label={t('ob.wz.remove')}
                onClick={() => set({ photos: d.photos.filter((_, j) => j !== k) })}><X /></button>
            </div>
          ))}
          {count < MAX_PHOTOS && (
            <label className="aspect-[4/3] rounded-2xl border border-dashed border-[var(--outline)] grid place-items-center text-center cursor-pointer text-[var(--r)] ag-small">
              <span className="flex flex-col items-center gap-1">
                {uploading ? <CircleNotch className="w-6 h-6 animate-spin" /> : <Plus className="w-6 h-6" aria-hidden="true" />}
                {count ? t('ob.wz.addmore') : t('ob.wz.addphotos')}
              </span>
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
  const Icon = d.type ? TYPE_ICON[d.type] : Storefront;
  const from = startingPrice();
  const unit = d.type === 'homestay' ? t('ob.wz.night') : (d.type === 'driver' || d.type === 'guide') ? t('ob.wz.day') : '';
  const plan = useHostPlanPrice(d.type || 'homestay');
  const { grace_bookings } = useHostSignupInfo();
  return (
    <Frame w={w} title={t('ob.wz.review')}
      cta={(
        <Button variant="primary" go block onClick={submit} disabled={busy} data-testid="onboard-submit">
          {busy ? t('common.loading') : d.payWhen === 'now' ? t('ob.wz.put_pay', { price: rupees(plan.base) }) : t('ob.wz.put')}
        </Button>
      )}>
      <article className="ag-card">
        {d.photos[0]
          ? <img src={d.photos[0]} alt="" className="img" />
          : <div className="img grid place-items-center text-[var(--r)]"><Icon className="w-10 h-10" aria-hidden="true" /></div>}
        <div className="body">
          <span className="name">{d.name}</span>
          <span className="meta">{d.place?.name}</span>
          {from > 0 && <span className="ag-price">₹{from.toLocaleString('en-IN')} {unit && <span className="unit">{unit}</span>}</span>}
        </div>
      </article>
      {offerLabels().length > 0 && (
        <ul className="grid gap-1.5">
          {offerLabels().map((l) => <li key={l} className="inline-flex items-center gap-2"><Check weight="bold" className="text-[var(--ok)]" aria-hidden="true" />{l}</li>)}
        </ul>
      )}
      <p className="ag-small">+91 {d.phone}</p>
      <Box tone="blush" flat>
        <p className="ag-small !text-[var(--ink7)]">
          {d.payWhen === 'now' ? t('plan_card.now_body', { price: rupees(plan.base) }) : t('plan_card.later_body', { price: rupees(plan.base), count: grace_bookings })}
        </p>
        <p className="ag-small">{t('ob.wz.fp_5')}</p>
      </Box>
    </Frame>
  );
}

/* ---------- done ---------- */
function DoneStep({ w }: { w: HostWizard }) {
  const { t, d } = w;
  return (
    <section className="ag-main" data-testid="wz-done">
      <div className="ag-done">
        <span className="big"><Confetti aria-hidden="true" /></span>
        <div className="ag-q"><h1>{t('ob.wz.in_title')}</h1></div>
        <p className="ag-lead !font-normal !text-[var(--ink7)]">{t('ob.wz.in_body')}</p>
        <div className="ag-stack w-full">
          <ButtonLink variant="primary" go to="/provider/dashboard" data-testid="wz-dashboard">{t('ob.wz.biz')}</ButtonLink>
          <ButtonLink go to="/my-listings" icon={<Plus />} data-testid="wz-another">{d.type === 'driver' ? t('ob.wz.addveh') : t('ob.wz.addprop')}</ButtonLink>
        </div>
      </div>
    </section>
  );
}

/** The wizard body for the current step, inside the 720px column. */
export default function HostWizardScreens({ w }: { w: HostWizard }) {
  const screen = useMemo(() => w.step, [w.step]);
  const top = useRef<HTMLDivElement>(null);
  useEffect(() => { top.current?.querySelector<HTMLElement>('h1')?.focus?.(); }, [screen]);
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
