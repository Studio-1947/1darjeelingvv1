/** A booking's pickup time ("09:30") as the reader says it ("9:30 am"), prototype drivebook.js tFmt. */
export function niceTime(hhmm: string, lang: string) {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm || '');
  if (!m) return hhmm || '';
  return new Date(2000, 0, 1, Number(m[1]), Number(m[2])).toLocaleTimeString(lang === 'en' ? 'en-IN' : lang, { hour: 'numeric', minute: '2-digit' });
}
