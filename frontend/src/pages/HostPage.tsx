import React, { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useParams } from 'react-router-dom';
import { Lock } from '@phosphor-icons/react';
import { Icon } from '@/components/ag/Icon';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import api from '@/lib/api';
import Seo from '@/components/Seo';
import HostMiniSite from '@/components/provider/HostMiniSite';
import { themeVars, useMode } from '@/lib/theme';
import DeliveryRequestButton from '@/components/DeliveryRequestButton';
import { waLink, waShare } from '@/lib/tripMessages';
import { Box, Button, ButtonA, ButtonLink, PageHead } from '@/components/ag';
import SmartImg from '@/components/SmartImg';

/**
 * A host's public page, aanganerp.in/<type>/<business-name> (board: "Profile - all profiles should
 * look like individual websites"). The same mini-site the host sees as a live preview while
 * editing, now with working Call / WhatsApp / Direction, their listings to book, and reviews.
 */
export default function HostPage() {
  // Re-render when dark mode is switched, so the business colour follows it.
  const [colourMode] = useMode();
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
    // The whole page in the business's own colour (profile.theme), when the host picked one.
    <div className="ag-wrap ag-listing" style={themeVars(page.theme, colourMode)}>
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

        {/* The prototype's action row (site.js): Ask to book, home delivery, share. */}
        <div className="ag-listing-acts">
          {listings[0] && (
            <ButtonLink variant="primary" go size="sm" to={`/listing/${listings[0].id}`} data-testid="host-page-book">
              {t('listing.book', 'Ask to book')}
            </ButtonLink>
          )}
          {page.homeDelivery && listings[0] && <DeliveryRequestButton listing={{ ...listings[0], extras: { ...listings[0].extras, home_delivery: true } }} />}
          <button type="button" className="ag-listing-rowic" onClick={share} data-testid="host-page-share"
            aria-label={t('ui.hostPage.share')} title={t('ui.hostPage.share')}>
            <Icon name="share" />
          </button>
        </div>

        {listings.length > 0 && (
          <section className="flex flex-col gap-2.5">
            <h2 className="m-0 text-[18px] leading-6 font-medium text-[var(--ink-strong)]">{t('ui.hostPage.book_with', { name: page.name })}</h2>
            <div className="grid grid-cols-2 gap-2.5">
              {listings.map((l: any) => (
                <Link key={l.id} to={`/listing/${l.id}`} data-testid={`host-page-listing-${l.id}`}
                  className="relative block aspect-square rounded-[16px] overflow-hidden bg-[var(--creme2)] no-underline">
                  {l.image && <SmartImg src={l.image} alt="" className="absolute inset-0 w-full h-full object-cover" />}
                  <span className="absolute inset-x-0 bottom-0 p-2.5 flex flex-col text-white bg-gradient-to-t from-black/70 to-transparent">
                    <span className="text-[13px] leading-4 font-medium line-clamp-2">{l.title}</span>
                    {Number(l.price) > 0 && <b className="text-[13px] leading-5 font-semibold">₹{Number(l.price).toLocaleString('en-IN')}</b>}
                    <span className="mt-0.5 inline-flex items-center gap-1 text-[12px] leading-4">{t('ui.hostPage.view_and_book')} <Icon name="arrowne" size={12} /></span>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        <Box data-testid="host-page-reviews">
          <h2>{t('listing.reviews', 'Reviews')}</h2>
          {reviews.length === 0 ? (
            <p className="m-0 text-[var(--ink-muted)]">{t('listing.norev', 'No reviews yet.')}</p>
          ) : reviews.map((r: any) => (
            <div key={r.id} className="ag-listing-rev">
              <span className="ag-listing-starline"><Icon name="star" />{r.rating}</span>
              {r.comment && <p className="text-[16px] leading-6 text-[var(--ink7)]">{r.comment}</p>}
              <p className="ag-small">{r.author}, {new Date(r.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
            </div>
          ))}
        </Box>

        {/* The prototype's website box: the address, Copy link and share (WhatsApp as well). */}
        <Box tone="blush" data-testid="host-page-website">
          <span className="ag-eyebrow">{t('listing.pf_site', 'Website')}</span>
          <p className="m-0 text-[16px] leading-6 text-[var(--ink7)] break-all">{url.replace(/^https?:\/\//, '')}</p>
          <div className="ag-row">
            <Button size="sm" onClick={() => { navigator.clipboard?.writeText(url).then(() => toast.success(t('ui.hostPage.link_copied'))).catch(() => {}); }}
              data-testid="host-page-copy">{t('listing.copylink', 'Copy link')}</Button>
            <ButtonA size="sm" href={waShare(t('ui.hostPage.share_text', { name: page.name, url }))} target="_blank" rel="noreferrer" icon={<Icon name="wa" />}>
              {t('ui.hostPage.share_whatsapp')}
            </ButtonA>
          </div>
        </Box>
      </div>
    </div>
  );
}
