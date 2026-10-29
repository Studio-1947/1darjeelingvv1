import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, ExternalLink, Eye, EyeOff, Flag, Loader2, Newspaper, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import api from '@/lib/api';

/**
 * MODERATION — reports from travellers and hosts, and the host feed.
 *
 * Reports: each one shows what was reported (a listing, a review or a feed post) right in the row,
 * so it can be judged without opening anything, plus how many open reports that item has. The
 * actions fit the kind of item: hide or delete a post, delete a review, open a listing. Acting on
 * an item resolves every open report about it.
 *
 * Feed posts: every post, hidden ones included, with Hide/Unhide and Delete.
 */

type TargetType = 'listing' | 'review' | 'post';

type Report = {
  id: string;
  reporter_name: string | null;
  target_type: TargetType;
  target_id: string;
  target: {
    title?: string;
    type?: string;
    location?: string;
    text?: string;
    rating?: number;
    author_name?: string;
    listing_id?: string;
    listing_title?: string | null;
    photos?: string[];
    hidden?: boolean;
  } | null;
  open_reports_on_target: number;
  reason: string;
  details: string;
  status: 'open' | 'resolved';
  created_at: string;
  resolved_at: string | null;
};

type Post = {
  id: string;
  body: string;
  photos: string[];
  created_at: string;
  host: { name: string; type: string; location: string; verified: boolean };
  listing: { id: string; title: string } | null;
  hidden?: boolean;
  hidden_reason?: string | null;
};

const REASON_LABEL: Record<string, string> = {
  fake: 'Fake or misleading',
  offensive: 'Rude or offensive',
  unsafe: 'Unsafe or a scam',
  spam: 'Spam',
  other: 'Something else',
};

const TYPE_LABEL: Record<TargetType, string> = { listing: 'Listing', review: 'Review', post: 'Feed post' };

/** The public site sits on the same origin as the admin panel (/admin). */
const siteUrl = (path: string) => `${window.location.origin}${path}`;

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

const errorText = (e: any) => e?.response?.data?.detail || e?.message || 'Something went wrong';

export default function Moderation() {
  const [tab, setTab] = useState<'reports' | 'posts'>('reports');

  return (
    <div className="mx-auto max-w-7xl px-4 md:px-8 py-8" data-testid="moderation-page">
      <div className="mb-6">
        <div className="text-[11px] font-bold uppercase tracking-widest text-flag flex items-center gap-1.5">
          <ShieldCheck size={14} /> System Administrator
        </div>
        <h1 className="mt-1 font-display font-extrabold text-4xl text-ink leading-none">Moderation</h1>
      </div>

      <div className="flex gap-2 border-b border-[var(--line)] mb-6" role="tablist">
        {[
          { id: 'reports' as const, label: 'Reports', Icon: Flag },
          { id: 'posts' as const, label: 'Feed posts', Icon: Newspaper },
        ].map(({ id, label, Icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`inline-flex items-center gap-1.5 px-5 py-3 font-bold text-sm border-b-2 transition-all ${
              tab === id ? 'border-flag text-flag' : 'border-transparent text-ink-soft hover:text-ink'
            }`}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {tab === 'reports' ? <ReportsPanel /> : <PostsPanel />}
    </div>
  );
}

function ReportsPanel() {
  const [status, setStatus] = useState<'open' | 'resolved'>('open');
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/admin/reports', { params: { status } });
      setReports(data.reports || []);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => { load(); }, [load]);

  /** Runs an action on the reported item, then resolves every open report about it. */
  const act = async (r: Report, key: string, action: () => Promise<unknown>, done: string) => {
    setBusy(`${r.id}:${key}`);
    setNotice('');
    try {
      await action();
      if (r.status === 'open') await api.post(`/admin/reports/${r.id}/resolve`, null, { params: { all: 1 } });
      setNotice(done);
      await load();
    } catch (e) {
      setNotice(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  const resolveOnly = (r: Report) => act(r, 'resolve', async () => {}, 'Marked as dealt with.');
  const hidePost = (r: Report) => {
    const reason = window.prompt('Reason shown to the host (optional)', REASON_LABEL[r.reason] || '');
    if (reason === null) return;
    return act(r, 'hide', () => api.post(`/posts/${r.target_id}/hide`, { reason }), 'Post hidden from the feed.');
  };
  const unhidePost = (r: Report) => act(r, 'unhide', () => api.post(`/posts/${r.target_id}/unhide`), 'Post is back in the feed.');
  const deletePost = (r: Report) => {
    if (!window.confirm('Delete this post for good? The host will not be able to get it back.')) return;
    return act(r, 'delete', () => api.delete(`/posts/${r.target_id}`), 'Post deleted.');
  };
  const deleteReview = (r: Report) => {
    if (!window.confirm('Delete this review for good?')) return;
    return act(r, 'delete', () => api.delete(`/reviews/${r.target_id}`), 'Review deleted.');
  };

  const isBusy = (r: Report, key: string) => busy === `${r.id}:${key}`;
  const btn = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-colors disabled:opacity-50';

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {(['open', 'resolved'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            aria-pressed={status === s}
            className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-colors ${
              status === s ? 'bg-ink text-white border-ink' : 'bg-white text-ink border-[var(--line)] hover:border-ink'
            }`}
          >
            {s === 'open' ? 'Open' : 'Resolved'}
          </button>
        ))}
        <button onClick={load} className={`${btn} border-[var(--line)] text-ink-soft hover:text-ink ml-auto`}>
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {notice && <div className="mb-4 rounded-xl bg-mist px-4 py-2.5 text-sm text-ink">{notice}</div>}

      {loading ? (
        <div className="p-16 text-center text-ink-soft"><Loader2 className="inline animate-spin" size={20} /></div>
      ) : error ? (
        <div className="p-10 text-center text-flag font-semibold">{error}</div>
      ) : reports.length === 0 ? (
        <div className="mist-panel p-10 text-center text-ink-soft" data-testid="reports-empty">
          {status === 'open' ? 'No open reports. Nothing needs you right now.' : 'No resolved reports yet.'}
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map((r) => (
            <div key={r.id} data-testid={`report-${r.id}`} className="rounded-2xl border border-[var(--line)] bg-white p-4 md:p-5">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="px-2.5 py-1 rounded-full bg-ink text-white font-bold">{TYPE_LABEL[r.target_type]}</span>
                <span className="px-2.5 py-1 rounded-full bg-flag/10 text-flag font-bold">{REASON_LABEL[r.reason] || r.reason}</span>
                {r.open_reports_on_target > 1 && r.status === 'open' && (
                  <span className="px-2.5 py-1 rounded-full bg-gold/20 text-[#8a6b04] font-bold">
                    {r.open_reports_on_target} open reports on this
                  </span>
                )}
                <span className="text-ink-soft ml-auto">
                  {r.reporter_name || 'Deleted account'} · {when(r.created_at)}
                  {r.resolved_at ? ` · resolved ${when(r.resolved_at)}` : ''}
                </span>
              </div>

              {r.details && <p className="mt-2 text-sm text-ink-soft">“{r.details}”</p>}

              <div className="mt-3 rounded-xl bg-mist/60 p-3 text-sm">
                {!r.target ? (
                  <span className="text-ink-soft italic">This {TYPE_LABEL[r.target_type].toLowerCase()} has since been deleted.</span>
                ) : r.target_type === 'listing' ? (
                  <div>
                    <div className="font-bold text-ink">{r.target.title}</div>
                    <div className="text-xs text-ink-soft">{r.target.type} · {r.target.location}</div>
                  </div>
                ) : r.target_type === 'review' ? (
                  <div>
                    <div className="text-xs text-ink-soft">
                      {r.target.author_name} · {'★'.repeat(r.target.rating || 0)} · on {r.target.listing_title || 'a deleted listing'}
                    </div>
                    <p className="mt-1 text-ink whitespace-pre-line">{r.target.text || <em className="text-ink-soft">No text</em>}</p>
                  </div>
                ) : (
                  <div>
                    <div className="text-xs text-ink-soft">
                      {r.target.author_name}
                      {r.target.hidden && <span className="ml-2 font-bold text-flag">Hidden</span>}
                    </div>
                    <p className="mt-1 text-ink whitespace-pre-line">{r.target.text}</p>
                    {r.target.photos && r.target.photos.length > 0 && (
                      <div className="mt-2 flex gap-2">
                        {r.target.photos.map((p) => (
                          <a key={p} href={p} target="_blank" rel="noopener noreferrer">
                            <img src={p} alt="" className="w-16 h-16 rounded-lg object-cover" />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {r.target_type === 'listing' && r.target && (
                  <a href={siteUrl(`/listing/${r.target_id}`)} target="_blank" rel="noopener noreferrer"
                    className={`${btn} border-[var(--line)] text-ink hover:border-ink`}>
                    <ExternalLink size={12} /> Open listing
                  </a>
                )}
                {r.target_type === 'review' && r.target?.listing_id && (
                  <a href={siteUrl(`/listing/${r.target.listing_id}#reviews`)} target="_blank" rel="noopener noreferrer"
                    className={`${btn} border-[var(--line)] text-ink hover:border-ink`}>
                    <ExternalLink size={12} /> Open listing
                  </a>
                )}
                {r.target_type === 'review' && r.target && (
                  <button onClick={() => deleteReview(r)} disabled={busy !== null} className={`${btn} border-flag/40 text-flag hover:bg-flag/10`}>
                    {isBusy(r, 'delete') ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />} Delete review
                  </button>
                )}
                {r.target_type === 'post' && r.target && !r.target.hidden && (
                  <button onClick={() => hidePost(r)} disabled={busy !== null} className={`${btn} border-[var(--line)] text-ink hover:border-ink`}>
                    {isBusy(r, 'hide') ? <Loader2 size={12} className="animate-spin" /> : <EyeOff size={12} />} Hide post
                  </button>
                )}
                {r.target_type === 'post' && r.target?.hidden && (
                  <button onClick={() => unhidePost(r)} disabled={busy !== null} className={`${btn} border-[var(--line)] text-ink hover:border-ink`}>
                    {isBusy(r, 'unhide') ? <Loader2 size={12} className="animate-spin" /> : <Eye size={12} />} Unhide post
                  </button>
                )}
                {r.target_type === 'post' && r.target && (
                  <button onClick={() => deletePost(r)} disabled={busy !== null} className={`${btn} border-flag/40 text-flag hover:bg-flag/10`}>
                    {isBusy(r, 'delete') ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />} Delete post
                  </button>
                )}
                {r.status === 'open' && (
                  <button onClick={() => resolveOnly(r)} disabled={busy !== null} data-testid={`resolve-${r.id}`}
                    className={`${btn} border-pine/40 text-pine hover:bg-pine/10 ml-auto`}>
                    {isBusy(r, 'resolve') ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />} Nothing wrong, resolve
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PostsPanel() {
  const [onlyHidden, setOnlyHidden] = useState(false);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/posts/admin/list', { params: onlyHidden ? { hidden: 1 } : {} });
      setPosts(data.posts || []);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, [onlyHidden]);

  useEffect(() => { load(); }, [load]);

  const run = async (id: string, action: () => Promise<unknown>) => {
    setBusy(id);
    try {
      await action();
      await load();
    } catch (e) {
      window.alert(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  const hide = (p: Post) => {
    const reason = window.prompt('Reason shown to the host (optional)', '');
    if (reason === null) return;
    run(p.id, () => api.post(`/posts/${p.id}/hide`, { reason }));
  };
  const unhide = (p: Post) => run(p.id, () => api.post(`/posts/${p.id}/unhide`));
  const remove = (p: Post) => {
    if (!window.confirm('Delete this post for good?')) return;
    run(p.id, () => api.delete(`/posts/${p.id}`));
  };

  const btn = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-colors disabled:opacity-50';

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        {[false, true].map((h) => (
          <button
            key={String(h)}
            onClick={() => setOnlyHidden(h)}
            aria-pressed={onlyHidden === h}
            className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-colors ${
              onlyHidden === h ? 'bg-ink text-white border-ink' : 'bg-white text-ink border-[var(--line)] hover:border-ink'
            }`}
          >
            {h ? 'Hidden' : 'All posts'}
          </button>
        ))}
        <button onClick={load} className={`${btn} border-[var(--line)] text-ink-soft hover:text-ink ml-auto`}>
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {loading ? (
        <div className="p-16 text-center text-ink-soft"><Loader2 className="inline animate-spin" size={20} /></div>
      ) : error ? (
        <div className="p-10 text-center text-flag font-semibold">{error}</div>
      ) : posts.length === 0 ? (
        <div className="mist-panel p-10 text-center text-ink-soft">{onlyHidden ? 'No hidden posts.' : 'No posts yet.'}</div>
      ) : (
        <div className="space-y-3">
          {posts.map((p) => (
            <div key={p.id} data-testid={`admin-post-${p.id}`} className={`rounded-2xl border bg-white p-4 md:p-5 ${p.hidden ? 'border-flag/40' : 'border-[var(--line)]'}`}>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-bold text-ink text-sm">{p.host.name}</span>
                <span className="text-ink-soft">{p.host.type} · {p.host.location} · {when(p.created_at)}</span>
                {p.hidden && (
                  <span className="px-2.5 py-1 rounded-full bg-flag/10 text-flag font-bold">
                    Hidden{p.hidden_reason ? `: ${p.hidden_reason}` : ''}
                  </span>
                )}
              </div>
              <p className="mt-2 text-sm text-ink whitespace-pre-line">{p.body}</p>
              {p.photos.length > 0 && (
                <div className="mt-2 flex gap-2">
                  {p.photos.map((src) => (
                    <a key={src} href={src} target="_blank" rel="noopener noreferrer">
                      <img src={src} alt="" className="w-16 h-16 rounded-lg object-cover" />
                    </a>
                  ))}
                </div>
              )}
              {p.listing && <div className="mt-2 text-xs text-ink-soft">About: {p.listing.title}</div>}
              <div className="mt-3 flex gap-2">
                {p.hidden ? (
                  <button onClick={() => unhide(p)} disabled={busy !== null} className={`${btn} border-[var(--line)] text-ink hover:border-ink`}>
                    <Eye size={12} /> Unhide
                  </button>
                ) : (
                  <button onClick={() => hide(p)} disabled={busy !== null} className={`${btn} border-[var(--line)] text-ink hover:border-ink`}>
                    <EyeOff size={12} /> Hide
                  </button>
                )}
                <button onClick={() => remove(p)} disabled={busy !== null} className={`${btn} border-flag/40 text-flag hover:bg-flag/10`}>
                  {busy === p.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />} Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
