import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CircleNotch as Loader2 } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { useSeo } from '@/components/Seo';
import PostCard from '@/components/feed/PostCard';
import PostComposer from '@/components/feed/PostComposer';
import TitleTrack from '@/components/feed/TitleTrack';
import HostSites from '@/components/feed/HostSites';
import PlanCard from '@/components/feed/PlanCard';
import ReportDialog, { ReportTarget } from '@/components/listing-detail/ReportDialog';
import { fetchPlans, TripPlan } from '@/lib/plans';
import { CanPostReason, deletePost, fetchFeed, fetchMyPosts, HostPost } from '@/lib/posts';
import api from '@/lib/api';
import { HillWeather } from '@/components/WeatherForecast';
import { Box, Button, ButtonLink, FieldError, IconButton } from '@/components/ag';
import { Icon } from '@/components/ag/Icon';

/** What "Show me" can include: the kinds the app has data for (the prototype's local news has no backend). */
type Kind = 'weather' | 'plans' | 'sites' | 'posts';
const KINDS: Array<{ k: Kind; label: string; fallback: string }> = [
  { k: 'weather', label: 'feed.kind_weather', fallback: 'Weather' },
  { k: 'plans', label: 'feed.kind_plans', fallback: 'Trip plans' },
  { k: 'sites', label: 'feed.kind_sites', fallback: 'Websites' },
  { k: 'posts', label: 'feed.kind_posts', fallback: 'Host posts' },
];
const ALL: Kind[] = KINDS.map((x) => x.k);
const SHOW_KEY = 'aangan-feed-show';
function savedShow(): Kind[] {
  try {
    const v = localStorage.getItem(SHOW_KEY);
    if (v === 'weather' || v === 'posts') return [v]; // the old single choice
    const list = JSON.parse(v || 'null');
    // A list saved before trip plans existed with everything ticked still means everything.
    if (Array.isArray(list) && !list.includes('plans') && ['weather', 'sites', 'posts'].every((k) => list.includes(k))) return ALL;
    if (Array.isArray(list)) return ALL.filter((k) => list.includes(k));
  } catch { /* private window or old value */ }
  return ALL;
}

/**
 * The host feed: the hill weather and what hosts say about their own places, newest first,
 * readable by anyone. "Show me" narrows it to one kind. A host who can post sees the composer at
 * the top and their own posts (including any an admin hid) with Edit and Delete.
 */
export default function Feed() {
  const { t } = useTranslation();
  const { user, audience } = useAuth();
  // Posting and editing are business-side actions. A host browsing as a traveller sees the feed as
  // travellers do; their own posts are tagged so it is clear whose they are.
  const business = audience.side === 'business';
  useSeo({ title: t('feed.title'), description: t('feed.subtitle') });

  const [posts, setPosts] = useState<HostPost[]>([]);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  const [canPost, setCanPost] = useState(false);
  const [reason, setReason] = useState<CanPostReason>(null);
  const [mine, setMine] = useState<HostPost[]>([]);
  const [editing, setEditing] = useState<HostPost | null>(null);
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  // A shared link (/feed?post=<id>) opens that post on arrival.
  const [sp] = useSearchParams();
  const sharedPostId = sp.get('post');
  // A shared post always shows, whatever the reader last picked.
  const [show, setShow] = useState<Kind[]>(() => (sharedPostId ? ALL : savedShow()));
  const save = (list: Kind[]) => {
    setShow(list);
    try { localStorage.setItem(SHOW_KEY, JSON.stringify(list)); } catch { /* private window: just this visit */ }
  };
  const toggleKind = (k: Kind) => save(show.includes(k) ? show.filter((x) => x !== k) : ALL.filter((x) => x === k || show.includes(x)));
  const all = show.length === ALL.length;
  const [filterOpen, setFilterOpen] = useState(false);
  const [composing, setComposing] = useState(false);

  // Trip plans travellers posted (prototype plans.js), newest first, in their own section.
  const [plans, setPlans] = useState<TripPlan[] | null>(null);
  const [plansNext, setPlansNext] = useState<string | null>(null);
  const [plansMore, setPlansMore] = useState(false);
  const loadPlans = useCallback(async () => {
    try {
      const page = await fetchPlans({ limit: 10 });
      setPlans(page.plans);
      setPlansNext(page.nextBefore);
    } catch {
      setPlans([]);
    }
  }, []);
  useEffect(() => { loadPlans(); }, [loadPlans, user?.id]);
  const morePlans = async () => {
    if (!plansNext || plansMore) return;
    setPlansMore(true);
    try {
      const page = await fetchPlans({ before: plansNext, limit: 10 });
      setPlans((p) => [...(p || []), ...page.plans]);
      setPlansNext(page.nextBefore);
    } catch {
      toast.error(t('feed.load_failed'));
    } finally {
      setPlansMore(false);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const page = await fetchFeed({ limit: 20 });
      let list = page.posts;
      // An older shared post is not on the first page: fetch it and put it on top.
      if (sharedPostId && !list.some((p) => p.id === sharedPostId)) {
        try {
          const { data } = await api.get(`/posts/${encodeURIComponent(sharedPostId)}`);
          if (data?.post) list = [data.post, ...list];
        } catch { /* gone or hidden: show the feed as usual */ }
      }
      setPosts(list);
      setNextBefore(page.nextBefore);
    } catch {
      setError(t('feed.load_failed'));
    } finally {
      setLoading(false);
    }
  }, [t, sharedPostId]);

  const loadMine = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetchMyPosts();
      setCanPost(res.canPost);
      setReason(res.reason);
      setMine(res.posts);
    } catch {
      setCanPost(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadMine(); }, [loadMine]);

  const more = async () => {
    if (!nextBefore || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchFeed({ before: nextBefore, limit: 20 });
      setPosts((p) => [...p, ...page.posts]);
      setNextBefore(page.nextBefore);
    } catch {
      toast.error(t('feed.load_failed'));
    } finally {
      setLoadingMore(false);
    }
  };

  const onSaved = () => {
    setEditing(null);
    setComposing(false);
    load();
    loadMine();
  };

  const remove = async (post: HostPost) => {
    if (!window.confirm(t('feed.delete_confirm'))) return;
    try {
      await deletePost(post.id);
      toast.success(t('feed.deleted'));
      onSaved();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || t('feed.post_failed'));
    }
  };

  // My own posts that the public feed does not show (hidden by an admin), so I can see why.
  const myHidden = business ? mine.filter((p) => p.hidden) : [];
  const isMine = (p: HostPost) => !!user && p.author_user_id === user.id;
  const showWeather = show.includes('weather');
  const showPlans = show.includes('plans');
  const showSites = show.includes('sites');
  const showPosts = show.includes('posts');
  const startEdit = (post: HostPost) => { setEditing(post); setComposing(true); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  return (
    <div className="ag-wrap">
      <div className="ag-main ag-feed">
        <h1 className="sr-only">{t('feed.title')}</h1>

        <div className="ag-feed-top">
          <TitleTrack />
          <div className="ag-feed-bar">
            <IconButton label={t('feed.filter', 'Filter')} className="ag-feed-fbtn" aria-pressed={filterOpen} aria-expanded={filterOpen}
              onClick={() => setFilterOpen((v) => !v)} data-testid="feed-filter">
              <Icon name="filter" />
              {!all && <span className="ag-feed-fdot" aria-hidden="true" />}
            </IconButton>
            {user && business && canPost && (
              <Button size="sm" go className="ag-feed-barbtn" icon={<Icon name="news" />} aria-expanded={composing}
                onClick={() => { if (composing) setEditing(null); setComposing((v) => !v); }} data-testid="feed-create-post">
                {t('feed.create_post', 'Create a post')}
              </Button>
            )}
            {!business && (
              <ButtonLink to="/plan" size="sm" go className="ag-feed-barbtn" icon={<Icon name="t_trip" />} data-testid="feed-plan-trip">
                {t('plans.plan_trip', 'Plan a trip')}
              </ButtonLink>
            )}
          </div>
          {filterOpen && (
            <div className="ag-feed-pop" role="dialog" aria-label={t('feed.filter', 'Filter')} data-testid="feed-filter-sheet">
              <div className="flex items-center justify-between gap-2">
                <b className="ag-feed-poph">{t('feed.filter', 'Filter')}</b>
                <IconButton label={t('feed.close', 'Close')} onClick={() => setFilterOpen(false)}><Icon name="close" /></IconButton>
              </div>
              <p className="ag-eyebrow m-0" id="feed-show-me">{t('feed.show_me', 'Show me')}</p>
              <div className="ag-feed-fchips" role="group" aria-labelledby="feed-show-me">
                <label className="ag-feed-fchip" data-testid="feed-show-all">
                  <input type="checkbox" checked={all} onChange={() => save(all ? [] : ALL)} />
                  <span>{t('feed.kind_all', 'Everything')}</span>
                </label>
                {KINDS.map((x) => (
                  <label key={x.k} className="ag-feed-fchip" data-testid={`feed-show-${x.k}`}>
                    <input type="checkbox" checked={show.includes(x.k)} onChange={() => toggleKind(x.k)} />
                    <span>{t(x.label, x.fallback)}</span>
                  </label>
                ))}
              </div>
              <div className="ag-feed-popact">
                <Button size="sm" onClick={() => save(ALL)} data-testid="feed-filter-clear">{t('feed.clear_filters', 'Clear filters')}</Button>
                <Button size="sm" onClick={() => setFilterOpen(false)} data-testid="feed-filter-done">{t('feed.done', 'Done')}</Button>
              </div>
            </div>
          )}
        </div>

        {user && business && canPost && (composing || editing) && (
          <PostComposer editing={editing} onSaved={onSaved} onCancelEdit={() => { setEditing(null); setComposing(false); }} />
        )}
        {user && business && !canPost && (reason === 'not_verified' || reason === 'plan_not_live') && (
          <Box>
            <p className="ag-small m-0 !text-[var(--ink7)]">
              {reason === 'not_verified' ? t('feed.cannot_post_unverified') : t('feed.cannot_post_plan')}
            </p>
            <ButtonLink to="/provider/dashboard" go size="sm" className="self-start">{t('nav.business_dashboard')}</ButtonLink>
          </Box>
        )}

        {showWeather && <HillWeather />}

        {showPlans && (
          <section className="flex flex-col gap-3" aria-labelledby="feed-plans-h" data-testid="feed-plans">
            <h2 id="feed-plans-h" className={show.length > 1 ? 'ag-feed-h' : 'sr-only'}>{t('feed.kind_plans', 'Trip plans')}</h2>
            {plans === null ? (
              <div className="flex justify-center py-8 text-[var(--ink-muted)]"><Loader2 size={24} className="animate-spin" /></div>
            ) : plans.length === 0 ? (
              <Box className="ag-feed-empty" data-testid="feed-plans-empty">
                <Icon name="t_trip" />
                <p className="m-0">{t('plans.empty', 'No trip plans yet. Plan one, and other travellers can ask to join.')}</p>
                {!business && <ButtonLink to="/plan" go size="sm">{t('plans.plan_trip', 'Plan a trip')}</ButtonLink>}
              </Box>
            ) : (
              <>
                {plans.map((p) => (
                  <PlanCard key={p.id} plan={p} onChange={(np) => setPlans((list) => (list || []).map((x) => (x.id === np.id ? np : x)))} />
                ))}
                {plansNext && (
                  <Button onClick={morePlans} disabled={plansMore} data-testid="feed-plans-more" center className="self-center"
                    icon={plansMore ? <Loader2 className="animate-spin" /> : undefined}>
                    {t('feed.load_more')}
                  </Button>
                )}
              </>
            )}
          </section>
        )}

        {showSites && !loading && <HostSites posts={posts} />}

        {showPosts && (
          <section className="flex flex-col gap-3" aria-labelledby="feed-posts-h">
            <h2 id="feed-posts-h" className={show.length > 1 ? 'ag-feed-h' : 'sr-only'}>{t('feed.kind_posts', 'Host posts')}</h2>

            {myHidden.map((p) => (
              <PostCard key={p.id} post={p} isMine onEdit={startEdit} onDelete={remove} />
            ))}

            {loading ? (
              <div className="flex justify-center py-16 text-[var(--ink-muted)]"><Loader2 size={24} className="animate-spin" /></div>
            ) : error ? (
              <Box>
                <FieldError>{error}</FieldError>
                <Button size="sm" className="self-start" onClick={load}>{t('feed.retry')}</Button>
              </Box>
            ) : posts.length === 0 ? (
              <Box data-testid="feed-empty" className="ag-feed-empty">
                <Icon name="news" />
                <p className="m-0">{t('feed.empty')}</p>
                {!business && (
                  <ButtonLink to="/provider/onboard" go size="sm">{t('feed.list_cta', 'Add my homestay, car or shop')}</ButtonLink>
                )}
              </Box>
            ) : (
              <div className="flex flex-col gap-3" data-testid="feed-list">
                {posts.map((p) => (
                  <PostCard
                    key={p.id}
                    post={p}
                    isMine={business && isMine(p)}
                    ownBusiness={!business && isMine(p)}
                    canReport={!!user && !isMine(p)}
                    onEdit={startEdit}
                    onDelete={remove}
                    onReport={(post) => setReportTarget({ type: 'post', id: post.id, authorId: post.author_user_id, authorName: post.host.name })}
                    autoOpen={p.id === sharedPostId}
                  />
                ))}
                {nextBefore && (
                  <Button onClick={more} disabled={loadingMore} data-testid="feed-more" center className="self-center"
                    icon={loadingMore ? <Loader2 className="animate-spin" /> : undefined}>
                    {t('feed.load_more')}
                  </Button>
                )}
              </div>
            )}
          </section>
        )}

        {show.length === 0 && (
          <Box className="ag-feed-empty" data-testid="feed-nothing-picked"><p className="m-0">{t('feed.none_picked', 'Nothing picked. Tap the filter and choose what to see.')}</p></Box>
        )}
      </div>

      <ReportDialog target={reportTarget} onClose={() => setReportTarget(null)} onBlocked={load} />
    </div>
  );
}
