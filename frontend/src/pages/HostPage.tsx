import React, { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useParams } from 'react-router-dom';
import { ArrowRight, ShareNetwork, Star, Lock } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import api from '@/lib/api';
import Seo from '@/components/Seo';
import HostMiniSite from '@/components/provider/HostMiniSite';
import DeliveryRequestButton from '@/components/DeliveryRequestButton';
import { waLink, waShare } from '@/lib/tripMessages';

/**
 * A host's public page, aanganerp.in/<type>/<business-name> (board: "Profile - all profiles should
 * look like individual websites"). The same mini-site the host sees as a live preview while
 * editing, now with working Call / WhatsApp / Direction, their listings to book, and reviews.
 */
export default function HostPage() {
  const { t } = useTranslation();
  const { slug = '' } = useParams();
  const { pathname } = useLocation();
  const type = pathname.split('/')[1];
  const [data, setData] = useState<any>(null);
  const [moved, setMoved] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setData(null);
    api.get(`/providers/page/${type}/${encodeURIComponent(slug)}`)
      .then(({ data }) => live && setData(data))
      .catch((e) => {
        if (!live) return;
        if (e?.response?.data?.path) setMoved(e.response.data.path);
        else setData(false);
      });
    return () => { live = false; };
  }, [type, slug]);

  if (moved) return <Navigate to={moved} replace />;
  if (data === null) return <div className="p-10 text-center text-ink-soft">{t('common.loading')}</div>;
  if (data === false) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center" data-testid="host-page-missing">
        <h1 className="font-display font-extrabold text-2xl text-ink">{t('ui.hostPage.missing_title')}</h1>
        <p className="mt-2 text-ink-soft">{t('ui.hostPage.missing_body')}</p>
        <Link to="/explore" className="mt-6 inline-flex items-center gap-1.5 h-[50px] px-6 rounded-full bg-[#1F6656] text-white font-bold">{t('ui.hostPage.explore')} <ArrowRight size={16} /></Link>
      </div>
    );
  }

  const { page, contact, listings, reviews } = data;
  const url = `${window.location.origin}${page.path || pathname}`;
  const direction = page.latitude && page.longitude
    ? `https://www.google.com/maps/dir/?api=1&destination=${page.latitude},${page.longitude}`
    : page.location ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${page.name} ${page.location}`)}` : null;
  const bookable = listings.find((l: any) => ['homestay', 'driver', 'guide'].includes(l.type)) || listings[0];
  const share = async () => {
    const text = t('ui.hostPage.share_text', { name: page.name, url });
    try {
      if (navigator.share) await navigator.share({ title: page.name, text, url });
      else { await navigator.clipboard.writeText(url); toast.success(t('ui.hostPage.link_copied')); }
    } catch { /* closed */ }
  };

  return (
    <div className="mx-auto max-w-3xl md:px-6 md:py-8 pb-24" data-testid="host-page">
      <Seo title={page.name} description={(page.about || '').slice(0, 155)} />
      {data.not_live && (
        <div className="bg-gold/20 text-ink text-sm font-semibold text-center px-4 py-2.5 md:rounded-2xl md:mb-4" data-testid="host-page-not-live">
          {t('ui.hostPage.not_live')}
        </div>
      )}
      <div className="md:rounded-3xl md:border md:border-[var(--line)] overflow-hidden md:shadow-sm">
        <HostMiniSite
          data={page}
          actions={{
            call: contact.phone ? `tel:${contact.phone}` : null,
            whatsapp: contact.whatsapp ? waLink(contact.whatsapp, t('ui.hostPage.wa_hello', { name: page.hostName || page.name })) : null,
            direction,
            locked: contact.locked ? (
              <span className="inline-flex items-center gap-1"><Lock size={12} /> {t('ui.hostPage.locked')}</span>
            ) : null,
          }}
        />
      </div>

      <div className="px-4 md:px-0 mt-5 flex flex-wrap gap-2">
        {page.homeDelivery && listings[0] && <DeliveryRequestButton listing={{ ...listings[0], extras: { ...listings[0].extras, home_delivery: true } }} />}
        <button type="button" onClick={share} data-testid="host-page-share"
          className="inline-flex items-center gap-1.5 h-10 px-4 rounded-full border border-[var(--line)] text-ink font-bold text-[13px] btn-hover">
          <ShareNetwork size={14} /> {t('ui.hostPage.share')}
        </button>
        <a href={waShare(t('ui.hostPage.share_text', { name: page.name, url }))} target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-1.5 h-10 px-4 rounded-full bg-[#25D366] text-white font-bold text-[13px] btn-hover">
          {t('ui.hostPage.share_whatsapp')}
        </a>
      </div>

      {listings.length > 0 && (
        <section className="px-4 md:px-0 mt-8">
          <h2 className="font-display font-extrabold text-xl text-ink">{t('ui.hostPage.book_with', { name: page.name })}</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {listings.map((l: any) => (
              <Link key={l.id} to={`/listing/${l.id}`} data-testid={`host-page-listing-${l.id}`} className="flex gap-3 rounded-2xl border border-[var(--line)] bg-white p-3 btn-hover">
                <div className="w-20 h-20 rounded-xl overflow-hidden bg-mist flex-shrink-0">{l.image && <img src={l.image} alt="" className="w-full h-full object-cover" />}</div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-ink line-clamp-2">{l.title}</p>
                  <p className="text-xs text-ink-soft">{l.location}{l.price ? t('ui.hostPage.from_price', { price: Number(l.price).toLocaleString('en-IN') }) : ''}</p>
                  <span className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-[#007C85]">{t('ui.hostPage.view_and_book')} <ArrowRight size={12} /></span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="px-4 md:px-0 mt-8" data-testid="host-page-reviews">
        <h2 className="font-display font-extrabold text-xl text-ink">{t('ui.hostPage.reviews')}</h2>
        {reviews.length === 0 ? (
          <p className="mt-2 text-sm text-ink-soft">{t('ui.hostPage.no_reviews')}</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {reviews.map((r: any) => (
              <li key={r.id} className="rounded-2xl border border-[var(--line)] bg-white p-4">
                <div className="flex items-center gap-1 text-xs">
                  {[1, 2, 3, 4, 5].map((n) => <Star key={n} size={13} weight={n <= r.rating ? 'fill' : 'regular'} className={n <= r.rating ? 'text-gold' : 'text-ink-soft/40'} />)}
                  <span className="ml-1 font-bold text-ink">{r.author}</span>
                  <span className="text-ink-soft">· {new Date(r.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                </div>
                {r.comment && <p className="mt-1.5 text-sm text-ink">{r.comment}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
