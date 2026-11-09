import type { TFunction } from 'i18next';
import i18n from '@/i18n';

/**
 * Text the server writes in English (notifications, "still needed" profile items, document names)
 * shown in the reader's language. English readers always get the server's own words; other
 * languages use the `serverText.*` translations, keyed by what the server sends alongside the
 * text (a message key, an item key, a document type), and fall back to the English text.
 */
const english = () => !i18n.language || i18n.language === 'en';

type Note = { kind?: string; title: string; body: string; msg?: { key: string; params?: Record<string, string | number> } | null };

export function noteText(t: TFunction, n: Note): { title: string; body: string } {
  const key = n.msg?.key;
  if (english() || !key || !i18n.exists(`serverText.notif.${key}.title`)) return { title: n.title, body: n.body };
  const p: Record<string, string | number> = { ...(n.msg?.params || {}) };
  if (!p.guest) p.guest = t('serverText.someone');
  const body = String(t(`serverText.notif.${key}.body`, p as any));
  return {
    title: String(t(`serverText.notif.${key}.title`, p as any)),
    // The host's own note is their words; it follows the translated sentence as written.
    body: key.startsWith('delivery_') && p.note ? `${body} ${p.note}` : body,
  };
}

export function missingLabel(t: TFunction, m: { key: string; label: string; min?: number; have?: number }, businessType?: string): string {
  if (english()) return m.label;
  const type = businessType || 'homestay';
  const k = m.key === 'images' ? `serverText.missing.images_${type}` : m.key === 'host_name' ? `serverText.missing.host_name_${type === 'homestay' ? 'host' : 'owner'}` : `serverText.missing.${m.key}`;
  if (!i18n.exists(k) || (m.key === 'images' && m.min === undefined)) return m.label;
  return String(t(k, { min: m.min, have: m.have }));
}

export function checklistLabel(t: TFunction, item: { key: string; label: string; kind?: string; action?: string | null }, businessType?: string): string {
  if (english()) return item.label;
  let k: string;
  if (item.kind === 'profile') k = item.key === 'location' ? `serverText.check.location_${item.action || 'pin'}` : `serverText.check.${item.key}`;
  else if (item.key === 'owner_photo') k = businessType === 'guide' ? 'serverText.doc.owner_photo_self' : 'serverText.doc.owner_photo';
  else if (item.key === 'premises_photo_inside') k = `serverText.doc.premises_photo_inside_${businessType === 'shop' ? 'shop' : 'cafe'}`;
  else k = `serverText.doc.${item.key}`;
  return i18n.exists(k) ? String(t(k)) : item.label;
}
