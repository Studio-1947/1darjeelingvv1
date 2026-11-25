import React, { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import api from '@/lib/api';
import { useTranslation } from 'react-i18next';
import Seo from '@/components/Seo';
import { PageHead, SecHead } from '@/components/ag';
import { useCrumbTitle } from '@/components/PageBack';

/** Old /business/<id> address: forwards to the host's page, or shows the business and its listings. */
export default function PublicBusiness() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const [data, setData] = useState<any>(null);
  useCrumbTitle(data?.business?.name);
  useEffect(() => { api.get(`/providers/public/${id}`).then((r) => setData(r.data)).catch(() => setData(false)); }, [id]);
  if (data === null) return <div className="ag-wrap"><div className="ag-main"><p className="ag-small">{t('ui.publicBusiness.loading')}</p></div></div>;
  if (!data) return <div className="ag-wrap"><div className="ag-main"><PageHead title={t('ui.publicBusiness.not_found')} /></div></div>;
  const { business, listings } = data;
  // Old /business/<id> links go to the host's page address.
  if (business.page_path) return <Navigate to={business.page_path} replace />;
  return (
    <div className="ag-wrap">
      <div className="ag-main">
        <Seo title={business.name} description={business.description} />
        {business.images?.[0] && (
          <img src={business.images[0]} alt="" className="aspect-[16/9] w-full rounded-[var(--r-card)] border border-[var(--warmline)] object-cover" />
        )}
        <PageHead eyebrow={t(`categories.${business.type}`, { defaultValue: business.type })} title={business.name} sub={business.description} />
        {listings.length > 0 && (
          <section>
            <SecHead title={t('ui.hostPage.book_with', { name: business.name })} className="!mt-0" />
            <div className="grid grid-cols-2 gap-2.5">
              {listings.map((listing: any) => (
                <Link key={listing.id} to={`/listing/${listing.id}`} className="ag-card">
                  {listing.image ? <img src={listing.image} alt="" className="img" /> : <div className="img" />}
                  <div className="body">
                    <span className="name line-clamp-2">{listing.title}</span>
                    <span className="meta">{listing.location}{listing.price ? ` · ${t('ui.publicBusiness.from_price', { price: listing.price })}` : ''}</span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
