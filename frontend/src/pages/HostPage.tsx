import React, { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useParams } from 'react-router-dom';
import { Icon } from '@/components/ag/Icon';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import api from '@/lib/api';
import Seo from '@/components/Seo';
import HostMiniSite from '@/components/provider/HostMiniSite';
import { themeVars, useMode } from '@/lib/theme';
import DeliveryRequestButton from '@/components/DeliveryRequestButton';
import { Box, ButtonA, ButtonLink, PageHead, Seg } from '@/components/ag';
import SmartImg from '@/components/SmartImg';
import { useCrumbTitle } from '@/components/PageBack';
import { useFavorites } from '@/context/FavoritesContext';
import { useLoginGate } from '@/components/LoginGate';

/**
 * A host's public page, aanganerp.in/<type>/<business-name> (board: "Profile - all profiles should
 * look like individual websites"). The same mini-site the host sees as a live preview while
 * editing, with the address to copy, the actions under the name, their listings and reviews.
 *
 * Two ways for the host to see their own page: "Your view" is for editing (Edit page, each listing
 * opens its editor, no booking), "Guest view" is exactly what travellers get (Ask to book,
 * Save, Share, and Direction for a homestay).
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
  // The host looking at their own page: their view (Ask to book off) or exactly what a traveller sees.
  const [viewAs, setViewAs] = useState<'owner' | 'traveller'>('owner');
  const { isFavorite, toggle } = useFavorites();
  const { requireAuth } = useLoginGate();
  useCrumbTitle(data?.page?.name, type);

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

  const { page, listings, reviews } = data;
  const own = data.own === true;
  const ownerView = own && viewAs === 'owner';
  const url = `${window.location.origin}${page.path || pathname}`;
  // Direction only for a homestay (people travel to it; a driver or guide comes to them), and only
  // for travellers: the host does not need directions to their own place.
  const direction = type !== 'homestay' || ownerView ? null : page.latitude && page.longitude
    ? `https://www.google.com/maps/dir/?api=1&destination=${page.latitude},${page.longitude}`
    : page.location ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${page.name} ${page.location}`)}` : null;
  const first = listings[0];
  const liked = !!first && isFavorite(first.id);
  const save = () => {
    if (!first || !requireAuth('save')) return;
    toggle(first.id).catch(() => {});
  };
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
          copyUrl={url}
          underAddress={own && (
            <div className="flex flex-col gap-1.5" data-testid="own-page-preview">
              <Seg<'owner' | 'traveller'> value={viewAs} onChange={setViewAs} label={t('business_gate.view_as', 'View as')} className="self-start"
                options={[
                  { value: 'owner', label: t('business_gate.view_owner', 'Your view'), testId: 'page-view-as-owner' },
                  { value: 'traveller', label: t('business_gate.view_traveller', 'Guest view'), testId: 'page-view-as-traveller' },
                ]} />
              <p className="ag-small">
                {ownerView
                  ? t('business_gate.page_preview_edit', 'Your view: edit your page and listings here. Travellers see Ask to book.')
                  : t('business_gate.page_preview_traveller', 'This is exactly what travellers see on your page.')}
              </p>
            </div>
          )}
          actions={(
            <div className="ag-listing-acts" data-testid="host-page-actions">
              {ownerView ? (
                <ButtonLink variant="primary" go size="sm" to="/provider/profile" data-testid="host-page-edit">
                  {t('host.edit_page', 'Edit page')}
                </ButtonLink>
              ) : (
                <>
                  {first && (
                    <ButtonLink variant="primary" go size="sm" to={`/listing/${first.id}`} data-testid="host-page-book">
                      {t('listing.book', 'Ask to book')}
                    </ButtonLink>
                  )}
                  {page.homeDelivery && first && <DeliveryRequestButton listing={{ ...first, extras: { ...first.extras, home_delivery: true } }} />}
                  {direction && (
                    <ButtonA variant="tonal" href={direction} target="_blank" rel="noreferrer" icon={<Icon name="pin" />} data-testid="mini-site-direction">
                      {t('miniSite.direction')}
                    </ButtonA>
                  )}
                  {first && (
                    <button type="button" className={`ag-listing-rowic${liked ? ' on' : ''}`} aria-pressed={liked} onClick={save}
                      aria-label={liked ? t('listing.saved', 'Saved') : t('listing.save', 'Save')} title={liked ? t('listing.saved', 'Saved') : t('listing.save', 'Save')}
                      data-testid="host-page-save">
                      <Icon name="heart" />
                    </button>
                  )}
                </>
              )}
              <button type="button" className="ag-listing-rowic" onClick={share} data-testid="host-page-share"
                aria-label={t('ui.hostPage.share')} title={t('ui.hostPage.share')}>
                <Icon name="share" />
              </button>
            </div>
          )}
        />

        {listings.length > 0 && (
          <section className="flex flex-col gap-2.5">
            <h2 className="m-0 text-[18px] leading-6 font-medium text-[var(--ink-strong)]">{t('ui.hostPage.book_with', { name: page.name })}</h2>
            <div className="grid grid-cols-2 gap-2.5">
              {listings.map((l: any) => (
                <Link key={l.id} to={ownerView ? `/provider/listings/${l.id}` : `/listing/${l.id}`} data-testid={`host-page-listing-${l.id}`}
                  className="relative block aspect-square rounded-[16px] overflow-hidden bg-[var(--creme2)] no-underline">
                  {l.image && <SmartImg src={l.image} alt="" className="absolute inset-0 w-full h-full object-cover" />}
                  <span className="absolute inset-x-0 bottom-0 p-2.5 flex flex-col text-white bg-gradient-to-t from-black/70 to-transparent">
                    <span className="text-[13px] leading-4 font-medium line-clamp-2">{l.title}</span>
                    {Number(l.price) > 0 && <b className="text-[13px] leading-5 font-semibold">₹{Number(l.price).toLocaleString('en-IN')}</b>}
                    <span className="mt-0.5 inline-flex items-center gap-1 text-[12px] leading-4">{ownerView ? t('host.edit', 'Edit') : t('ui.hostPage.view_and_book')} <Icon name="arrowne" size={12} /></span>
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

      </div>
    </div>
  );
}
