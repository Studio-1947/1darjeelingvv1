import { useEffect, useState } from 'react';
import { Loader2, Medal, X } from 'lucide-react';
import api from '@/lib/api';

/**
 * One traveller in full: the profile from the board's "Profile Setup" (WhatsApp, gender, age,
 * address, places, foods, type, diet), the aangan pass, and the dashboard they see (points,
 * awards, travel totals) from GET /admin/users/:id/dashboard.
 */
const LABELS: Record<string, string> = {
  female: 'Female', male: 'Male', other: 'Other', prefer_not: 'Prefer not to say',
  solo: 'Solo', couple: 'Couple', family: 'Family', friends: 'Friends', business: 'Work trip', backpacker: 'Backpacker',
  veg: 'Veg', non_veg: 'Non-veg', vegan: 'Vegan',
  // Places (the app's vibe ids) and foods, as the traveller saw them.
  nature: 'Nature & wildlife', food: 'Local food', treks: 'Treks & sunrise', culture: 'Culture & heritage', photo: 'Photo spots', shopping: 'Shopping local',
  momo: 'Momo', thukpa: 'Thukpa', nepali_thali: 'Nepali thali', tea: 'Darjeeling tea', coffee: 'Coffee', bakery: 'Bakery',
  street_food: 'Street food', chinese: 'Chinese', tibetan: 'Tibetan', continental: 'Continental', bengali: 'Bengali', sweets: 'Sweets',
};
const nice = (v: string | null | undefined) => (v ? LABELS[v] || v.replace(/_/g, ' ') : '—');

const AWARD_TITLES: Record<string, string> = {
  first_trip: 'First trip', homestay_explorer: 'Homestay explorer', cafe_hopper: 'Cafe hopper', local_supporter: 'Local supporter',
  road_tripper: 'Road tripper', storyteller: 'Storyteller', connector: 'Connector', pass_holder: 'Pass holder', profile_complete: 'All set',
};

export default function TravellerDrawer({ user, onClose }: { user: any; onClose: () => void }) {
  const [dash, setDash] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    api.get(`/admin/users/${user.id}/dashboard`)
      .then(({ data }) => live && setDash(data))
      .catch((e) => live && setError(e?.response?.data?.detail || 'Could not load the dashboard'));
    return () => { live = false; };
  }, [user.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const age = user.birthYear ? new Date().getFullYear() - user.birthYear : null;
  const passUntil = user.supportExpiresAt ? new Date(user.supportExpiresAt) : null;
  const passActive = !!passUntil && passUntil.getTime() > Date.now();
  const row = (label: string, value: React.ReactNode) => (
    <div className="flex justify-between gap-4 py-2 border-b border-[var(--line)] text-sm">
      <span className="text-ink-soft">{label}</span>
      <span className="font-semibold text-ink text-right">{value}</span>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={user.name} data-testid="traveller-drawer">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <aside className="relative w-full max-w-md h-full bg-white shadow-2xl overflow-y-auto p-6">
        <div className="flex items-start gap-3">
          <div className="w-14 h-14 rounded-full overflow-hidden bg-pine text-white grid place-items-center font-bold text-xl flex-shrink-0">
            {user.avatar ? <img src={user.avatar} alt="" className="w-full h-full object-cover" /> : (user.name || '?').charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-display font-extrabold text-xl text-ink truncate">{user.name}</div>
            <div className="text-xs text-ink-soft">{user.phone} · joined {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—'}</div>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-2 rounded-full hover:bg-mist"><X size={18} /></button>
        </div>

        <h3 className="mt-6 text-xs font-bold uppercase tracking-widest text-ink-soft">Profile</h3>
        {row('WhatsApp', user.whatsapp || 'Same as phone / not set')}
        {row('Email', user.email || '—')}
        {row('Gender', nice(user.gender))}
        {row('Age', age ?? '—')}
        {row('Address', user.address ? `${user.address}${user.pincode ? ` · ${user.pincode}` : ''}` : (user.pincode || '—'))}
        {row('Type of traveller', nice(user.travellerType))}
        {row('Food preference', nice(user.diet))}
        {row('Places they love', user.interests?.length ? user.interests.map(nice).join(', ') : '—')}
        {row('Foods they like', user.likedFoods?.length ? user.likedFoods.map(nice).join(', ') : '—')}

        <h3 className="mt-6 text-xs font-bold uppercase tracking-widest text-ink-soft">aangan pass</h3>
        {row('Status', passActive ? <span className="text-pine">Active</span> : user.supportExpiresAt ? 'Lapsed' : 'Never taken')}
        {passUntil && row(passActive ? 'Valid until' : 'Ended', passUntil.getFullYear() >= 9999 ? 'Lifetime' : passUntil.toLocaleDateString())}

        <h3 className="mt-6 text-xs font-bold uppercase tracking-widest text-ink-soft">Dashboard</h3>
        {error ? <p className="py-3 text-sm text-flag">{error}</p> : !dash ? (
          <div className="py-6 text-center text-ink-soft"><Loader2 className="inline animate-spin" size={18} /></div>
        ) : (
          <>
            {row('Aangan Points', dash.points.toLocaleString('en-IN'))}
            {row('Trips taken', dash.totals.trips)}
            {row('Homestays stayed', dash.totals.homestays)}
            {row('Cafes visited', dash.totals.cafes)}
            {row('Local shops', dash.totals.shops)}
            {row('Reviews written', dash.totals.reviews)}
            {row('Friends referred', dash.referrals.joined)}
            {row('Profile', dash.profile.complete ? 'Complete' : `Missing: ${dash.profile.missing.join(', ')}`)}
            <div className="mt-3 flex flex-wrap gap-2">
              {dash.awards.map((a: any) => (
                <span key={a.id} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${a.earned ? 'bg-gold/20 text-[#7a5d00]' : 'bg-mist text-ink-soft'}`}>
                  <Medal size={12} /> {AWARD_TITLES[a.id] || a.id}{!a.earned && a.goal > 1 ? ` ${a.progress}/${a.goal}` : ''}
                </span>
              ))}
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
