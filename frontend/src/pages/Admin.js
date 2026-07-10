import React, { useEffect, useState } from 'react';
import api from '@/lib/api';

export default function Admin() {
  const [stats, setStats] = useState(null);
  const [msg, setMsg] = useState('');
  const load = () => api.get('/admin/stats').then((r) => setStats(r.data));
  useEffect(() => { load(); }, []);

  const seed = async () => {
    setMsg('Seeding…');
    const { data } = await api.post('/admin/seed');
    setMsg(`Seeded ${data.seeded} new listings (of ${data.total_in_seed} total).`);
    load();
  };

  return (
    <div className="mx-auto max-w-4xl px-5 md:px-8 py-10" data-testid="admin-page">
      <h1 className="font-display font-extrabold text-4xl text-ink">Admin</h1>
      <div className="mt-6 grid grid-cols-2 md:grid-cols-5 gap-4">
        {stats && Object.entries(stats).map(([k, v]) => (
          <div key={k} className="mist-panel p-5">
            <div className="text-xs uppercase tracking-widest text-ink-soft">{k}</div>
            <div className="mt-1 font-display font-extrabold text-3xl text-ink">{v}</div>
          </div>
        ))}
      </div>
      <div className="mt-8">
        <button onClick={seed} data-testid="admin-seed" className="px-5 py-3 rounded-full bg-pine text-white font-bold btn-hover">Seed sample content</button>
        {msg && <p className="mt-3 text-sm text-ink-soft">{msg}</p>}
      </div>
    </div>
  );
}
