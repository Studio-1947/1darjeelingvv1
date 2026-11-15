import React, { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useParams } from 'react-router-dom';
import { ArrowUpRight, ShareNetwork, Star, Lock, WhatsappLogo } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import api from '@/lib/api';
import Seo from '@/components/Seo';
import HostMiniSite from '@/components/provider/HostMiniSite';
import DeliveryRequestButton from '@/components/DeliveryRequestButton';
import { waLink, waShare } from '@/lib/tripMessages';
import { Box, Button, ButtonA, ButtonLink, PageHead, SecHead } from '@/components/ag';

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
  if (data === null) return <div className="ag-wrap"><div className="ag-main"><p className="ag-small">{t('common.loading')}</p></div></div>;
  if (data === false) {
    return (
      <div className="ag-wrap">
        <div className="ag-main" data-testid="host-page-missing">
          <PageHead title={t('ui.hostPage.missing_title')} sub={t('ui.hostPage.missing_body')} />
          <ButtonLink to="/explore" go className="self-start">{t('ui.hostPage.explore')}</ButtonLink>
        </div>
      </div>
    );
  }

  const { page, contact, listings, reviews } = data;
  const url = `${window.location.origin}${page.path || pathname}`;
  const direction = page.latitude && page.longitude
    ? `https://www.google.com/maps/dir/?api=1&destination=${page.latitude},${page.longitude}`
    : page.location ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${page.name} ${page.location}`)}` : null;
  const share = async () => {
    const text = t('ui.hostPage.share_text', { name: page.name, url });
    try {
      if (navigator.share) await navigator.share({ title: page.name, text, url });
      else { await navigator.clipboard.writeText(url); toast.success(t('ui.hostPage.link_copied')); }
    } catch { /* closed */ }
  };

  return (
    <div className="ag-wrap">
      <div className="ag-main" data-testid="host-page">
        <Seo title={page.name} description={(page.about || '').slice(0, 155)} />
        {data.not_live && (
          <Box tone="blush" flat data-testid="host-page-not-live">
            <p className="text-sm text-[var(--ink-strong)]">{t('ui.hostPage.not_live')}</p>
          </Box>
        )}
        <HostMiniSite
          data={page}
          actions={{
            call: contact.phone ? `tel:${contact.phone}` : null,
            whatsapp: contact.whatsapp ? waLink(contact.whatsapp, t('ui.hostPage.wa_hello', { name: page.hostName || page.name })) : null,
            direction,
            locked: contact.locked ? (
              <span className="inline-flex items-center gap-1"><Lock size={14} aria-hidden="true" /> {t('ui.hostPage.locked')}</span>
            ) : null,
          }}
        />

        <div className="ag-row">
          {page.homeDelivery && listings[0] && <DeliveryRequestButton listing={{ ...listings[0], extras: { ...listings[0].extras, home_delivery: true } }} />}
          <Button size="sm" icon={<ShareNetwork />} onClick={share} data-testid="host-page-share">{t('ui.hostPage.share')}</Button>
          <ButtonA size="sm" icon={<WhatsappLogo />} href={waShare(t('ui.hostPage.share_text', { name: page.name, url }))} target="_blank" rel="noreferrer">
            {t('ui.hostPage.share_whatsapp')}
          </ButtonA>
        </div>

        {listings.length > 0 && (
          <section>
            <SecHead title={t('ui.hostPage.book_with', { name: page.name })} className="!mt-0" />
            <div className="grid grid-cols-2 gap-2.5">
              {listings.map((l: any) => (
                <Link key={l.id} to={`/listing/${l.id}`} data-testid={`host-page-listing-${l.id}`} className="ag-card">
                  {l.image ? <img src={l.image} alt="" className="img" /> : <div className="img" />}
                  <div className="body">
                    <span className="name line-clamp-2">{l.title}</span>
                    <span className="meta">{l.location}{l.price ? t('ui.hostPage.from_price', { price: Number(l.price).toLocaleString('en-IN') }) : ''}</span>
                    <span className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-[var(--r)]">{t('ui.hostPage.view_and_book')} <ArrowUpRight size={14} aria-hidden="true" /></span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section data-testid="host-page-reviews">
          <SecHead title={t('ui.hostPage.reviews')} className="!mt-0" />
          {reviews.length === 0 ? (
            <p className="ag-small">{t('ui.hostPage.no_reviews')}</p>
          ) : (
            <ul className="grid gap-2.5">
              {reviews.map((r: any) => (
                <li key={r.id}>
                  <Box flat className="!gap-1.5">
                    <div className="flex flex-wrap items-center gap-1.5 text-sm">
                      <span className="inline-flex gap-0.5" aria-label={`${r.rating} / 5`}>
                        {[1, 2, 3, 4, 5].map((n) => <Star key={n} size={14} weight={n <= r.rating ? 'fill' : 'regular'} className={n <= r.rating ? 'text-[var(--star)]' : 'text-[var(--outline)]'} aria-hidden="true" />)}
                      </span>
                      <b className="font-medium text-[var(--ink-strong)]">{r.author}</b>
                      <span className="ag-small">· {new Date(r.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    </div>
                    {r.comment && <p className="text-sm text-[var(--ink7)]">{r.comment}</p>}
                  </Box>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
