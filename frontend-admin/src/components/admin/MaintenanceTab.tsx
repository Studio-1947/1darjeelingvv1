import { useState, type ReactNode } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';

import api from '@/lib/api';
import CleanupPanel from './CleanupPanel';

/**
 * Clean-up: the server's maintenance checks, so nobody has to run scripts on the server.
 * Every card first shows what it found; the fix button works the list out again on the server
 * (routes/adminMaintenance.ts), so it never acts on a stale page.
 */

type Listing = { id: string; title: string; type: string; bookings: number; reviews: number; saves: number; stock_photos: number };
type Demo = { remove: Listing[]; booked: Listing[]; adminOwned: Listing[]; stockPhotos: Listing[] };
type PhotoChange = { table: string; column: string; id: string; before: string; after: string };
type ContentItem = { kind: 'listing' | 'post' | 'review'; id: string; label: string; type?: string; problems: string[] };
type Bucket = { bucket: string; total: number; used: number; unused: string[] };

const errText = (e: any, fallback: string) => e?.response?.data?.detail || fallback;

/** One check: a "Check" button, the findings, and an optional fix button with a confirm. */
function Card<T>(props: {
  title: string;
  about: string;
  load: () => Promise<T>;
  isEmpty: (data: T) => boolean;
  emptyText: string;
  render: (data: T, reload: () => void) => ReactNode;
  fix?: { label: (data: T) => string; confirm: (data: T) => string; run: () => Promise<string> };
}) {
  const [data, setData] = useState<T | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const check = async () => {
    setBusy(true);
    setMessage('');
    try {
      setData(await props.load());
    } catch (e) {
      setMessage(errText(e, 'The check failed.'));
    } finally {
      setBusy(false);
    }
  };

  const fix = async () => {
    if (!props.fix || !data || !window.confirm(props.fix.confirm(data))) return;
    setBusy(true);
    setMessage('');
    try {
      setMessage(await props.fix.run());
      setData(await props.load());
    } catch (e) {
      setMessage(errText(e, 'That did not work. Nothing was changed.'));
    } finally {
      setBusy(false);
    }
  };

  const empty = data !== null && props.isEmpty(data);
  return (
    <div className="mist-panel border border-[var(--line)] p-5 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-bold text-ink">{props.title}</div>
          <p className="text-xs text-ink-soft mt-1">{props.about}</p>
        </div>
        <button
          onClick={check}
          disabled={busy}
          className="shrink-0 min-h-[44px] px-4 rounded-lg border border-[var(--line)] text-xs font-bold text-ink hover:bg-mist cursor-pointer disabled:opacity-50"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : data ? 'Check again' : 'Check'}
        </button>
      </div>

      {empty && (
        <div className="flex items-center gap-2 text-sm text-pine font-semibold">
          <CheckCircle2 size={16} /> {props.emptyText}
        </div>
      )}
      {data !== null && !empty && props.render(data, check)}
      {data !== null && !empty && props.fix && props.fix.label(data) && (
        <button
          onClick={fix}
          disabled={busy}
          className="min-h-[44px] px-4 rounded-lg bg-[#1F6656] text-white text-xs font-bold disabled:opacity-40 cursor-pointer"
        >
          {props.fix.label(data)}
        </button>
      )}
      {message && <div className="text-xs font-bold text-ink">{message}</div>}
    </div>
  );
}

function ListingRows({ title, items, note }: { title: string; items: Listing[]; note?: string }) {
  if (!items.length) return null;
  return (
    <div>
      <div className="text-xs font-bold text-ink-soft uppercase tracking-wide">
        {title} ({items.length})
      </div>
      {note && <div className="text-xs text-ink-soft">{note}</div>}
      <ul className="mt-1 text-sm text-ink divide-y divide-[var(--line)]">
        {items.map((l) => (
          <li key={l.id} className="py-1.5 flex flex-wrap gap-x-3">
            <span className="font-semibold">{l.title}</span>
            <span className="text-ink-soft capitalize">{l.type}</span>
            <span className="text-ink-soft text-xs">
              {[l.bookings && `${l.bookings} bookings`, l.reviews && `${l.reviews} reviews`, l.saves && `${l.saves} saves`]
                .filter(Boolean)
                .join(', ')}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ContentRow({ item, onDone }: { item: ContentItem; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');
  const action =
    item.kind === 'listing'
      ? { label: 'Delete listing', ask: `Delete the listing "${item.label}" for good?`, run: () => api.delete(`/admin/listings/${item.id}`), done: 'Deleted' }
      : item.kind === 'post'
        ? { label: 'Hide post', ask: 'Hide this post from the feed?', run: () => api.post(`/posts/${item.id}/hide`, { reason: 'Test content' }), done: 'Hidden' }
        : { label: 'Delete review', ask: 'Delete this review for good?', run: () => api.delete(`/reviews/${item.id}`), done: 'Deleted' };

  const act = async () => {
    if (!window.confirm(action.ask)) return;
    setBusy(true);
    try {
      await action.run();
      setDone(action.done);
      onDone();
    } catch (e) {
      setDone(errText(e, 'Failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="py-2 flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="text-xs font-bold uppercase text-ink-soft w-14">{item.kind}</span>
      <span className="font-semibold text-ink">{item.label || '(empty)'}</span>
      {item.type && <span className="text-xs text-ink-soft capitalize">{item.type}</span>}
      <span className="text-xs text-flag">{item.problems.join('; ')}</span>
      <span className="ml-auto">
        {done ? (
          <span className="text-xs font-bold text-pine">{done}</span>
        ) : (
          <button
            onClick={act}
            disabled={busy}
            className="min-h-[44px] px-3 rounded-lg border border-flag/40 text-flag text-xs font-bold hover:bg-flag/5 cursor-pointer disabled:opacity-50"
          >
            {action.label}
          </button>
        )}
      </span>
    </li>
  );
}

export default function MaintenanceTab({ onChanged }: { onChanged: () => void }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-soft">
        Each check only looks until you press its button. Take a database backup before a big clean-up.
      </p>

      <Card<{ count: number; changes: PhotoChange[] }>
        title="Broken photo addresses"
        about="Photos saved with the old domain (1darjeeling.in) or a garbled address. Repairing points them at aanganerp.in."
        load={async () => (await api.get('/admin/maintenance/photos')).data}
        isEmpty={(d) => d.count === 0}
        emptyText="Every photo address is correct."
        render={(d) => (
          <ul className="text-xs text-ink divide-y divide-[var(--line)] max-h-64 overflow-auto">
            {d.changes.map((c) => (
              <li key={`${c.table}.${c.column}.${c.id}`} className="py-1.5 break-all">
                <span className="font-bold">{c.table}.{c.column}</span> <span className="text-ink-soft">{c.id}</span>
                <div className="text-flag">from {c.before}</div>
                <div className="text-pine">to {c.after}</div>
              </li>
            ))}
          </ul>
        )}
        fix={{
          label: (d) => `Repair ${d.count} record${d.count === 1 ? '' : 's'}`,
          confirm: (d) => `Repair ${d.count} photo address record(s)?`,
          run: async () => `Repaired ${(await api.post('/admin/maintenance/photos/repair')).data.updated} record(s).`,
        }}
      />

      <Card<Demo>
        title="Demo businesses"
        about="Sample homestays, drivers, shops and cafés from the old Seed button (Mist & Pine Homestay, Glenary's...). Spots, events and nature entries are never touched."
        load={async () => (await api.get('/admin/maintenance/demo')).data}
        isEmpty={(d) => !d.remove.length && !d.booked.length && !d.adminOwned.length && !d.stockPhotos.length}
        emptyText="No demo businesses left."
        render={(d) => (
          <div className="space-y-3">
            <ListingRows title="Will be deleted" items={d.remove} />
            <ListingRows title="Demo, but has bookings" items={d.booked} note="Left alone: deleting would delete those bookings too. Delete them from Services if they are tests." />
            <ListingRows title="Other host listings owned by the admin account" items={d.adminOwned} note="Left alone: check them in Services." />
            <ListingRows title="Real hosts using stock photos" items={d.stockPhotos} note="Left alone: ask the host for their own photos." />
          </div>
        )}
        fix={{
          label: (d) => (d.remove.length ? `Delete ${d.remove.length} demo business${d.remove.length === 1 ? '' : 'es'}` : ''),
          confirm: (d) => `Delete ${d.remove.length} demo business(es) for good?`,
          run: async () => {
            const n = (await api.post('/admin/maintenance/demo/delete')).data.deleted;
            onChanged();
            return `Deleted ${n} demo business(es).`;
          },
        }}
      />

      <Card<{ items: ContentItem[] }>
        title="Test-looking content"
        about="Listings with names like &quot;D&quot; or places like &quot;asdasd&quot;, no price or no photo; keyboard-mash feed posts; reviews that are only a referral code."
        load={async () => (await api.get('/admin/maintenance/content')).data}
        isEmpty={(d) => d.items.length === 0}
        emptyText="Nothing looks like test content."
        render={(d) => (
          <ul className="text-sm divide-y divide-[var(--line)]">
            {d.items.map((i) => (
              <ContentRow key={`${i.kind}-${i.id}`} item={i} onDone={onChanged} />
            ))}
          </ul>
        )}
      />

      <Card<{ unused_total: number; buckets: Bucket[] }>
        title="Unused stored files"
        about="Photos and documents in storage that nothing in the database refers to any more, for example from deleted accounts. A file counts as in use if any record mentions it."
        load={async () => (await api.get('/admin/maintenance/storage')).data}
        isEmpty={(d) => d.unused_total === 0}
        emptyText="Every stored file is in use."
        render={(d) => (
          <ul className="text-xs text-ink space-y-1">
            {d.buckets.map((b) => (
              <li key={b.bucket}>
                <span className="font-bold">{b.bucket}</span>: {b.total} files, {b.used} in use,{' '}
                <span className="text-flag font-bold">{b.unused.length} unused</span>
              </li>
            ))}
          </ul>
        )}
        fix={{
          label: (d) => `Delete ${d.unused_total} unused file${d.unused_total === 1 ? '' : 's'}`,
          confirm: (d) => `Delete ${d.unused_total} unused file(s) from storage for good?`,
          run: async () => {
            const r = (await api.post('/admin/maintenance/storage/delete')).data;
            return `Deleted ${r.deleted} file(s)` + (r.failed ? `; ${r.failed} could not be deleted.` : '.');
          },
        }}
      />

      <CleanupPanel onDone={onChanged} />
    </div>
  );
}
