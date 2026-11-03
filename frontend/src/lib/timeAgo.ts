/** "3 h ago", "2 d ago", then a date: a feed reads by recency, not by timestamp. */
export function timeAgo(iso: string, lang: string, t: (k: string, o?: any) => string): string {
  const diff = Date.now() - Date.parse(iso);
  const mins = Math.round(diff / 60000);
  if (mins < 1) return t('feed.just_now');
  if (mins < 60) return t('feed.minutes_ago', { count: mins });
  const hours = Math.round(mins / 60);
  if (hours < 24) return t('feed.hours_ago', { count: hours });
  const days = Math.round(hours / 24);
  if (days < 7) return t('feed.days_ago', { count: days });
  return new Date(iso).toLocaleDateString(lang, { day: 'numeric', month: 'short', year: 'numeric' });
}
