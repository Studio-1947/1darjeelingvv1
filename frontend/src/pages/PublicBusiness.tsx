import React, { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import api from '@/lib/api';
import Seo from '@/components/Seo';

export default function PublicBusiness() {
  const { id = '' } = useParams(); const [data, setData] = useState<any>(null);
  useEffect(() => { api.get(`/providers/public/${id}`).then((r) => setData(r.data)).catch(() => setData(false)); }, [id]);
  if (data === null) return <div className="p-10 text-center">Loading business…</div>;
  if (!data) return <div className="p-10 text-center">Business not found.</div>;
  const { business, listings } = data;
  // Old /business/<id> links go to the host's page address.
  if (business.page_path) return <Navigate to={business.page_path} replace />;
  return <div className="mx-auto max-w-5xl px-4 py-8 pb-24"><Seo title={business.name} description={business.description} /><div className="overflow-hidden rounded-3xl bg-pine text-white"><div className="aspect-[3/1] bg-pine-dark">{business.images?.[0] && <img src={business.images[0]} alt="" className="h-full w-full object-cover opacity-80" />}</div><div className="p-6"><p className="text-xs font-bold uppercase tracking-widest">{business.type}</p><h1 className="font-display text-4xl font-extrabold">{business.name}</h1><p className="mt-2 max-w-2xl text-white/85">{business.description}</p></div></div><section className="mt-8 grid gap-4 sm:grid-cols-2">{listings.map((listing: any) => <Link key={listing.id} to={`/listing/${listing.id}`} className="overflow-hidden rounded-2xl border border-[var(--line)] bg-white"><div className="aspect-video bg-mist">{listing.image && <img src={listing.image} alt="" className="h-full w-full object-cover" />}</div><div className="p-4"><p className="text-xs font-bold uppercase text-pine">{listing.type}</p><h2 className="font-display text-xl font-extrabold text-ink">{listing.title}</h2><p className="mt-1 text-sm text-ink-soft">{listing.location}{listing.price ? ` · From ₹${listing.price}` : ''}</p></div></Link>)}</section></div>;
}
