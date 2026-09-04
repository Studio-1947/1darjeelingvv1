import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

/**
 * Per-page document metadata: title, description, canonical, Open Graph.
 *
 * Every route used to inherit the one <title> and <meta name="description"> in
 * public/index.html, so the Ghum Monastery page and the homepage looked identical
 * to Google and to a link preview, and only the <h1> said otherwise (QA 3.4).
 * The title also stayed in English after the language switch, leaving Nepali
 * visitors with English browser tabs and bookmarks (QA 3.5) - which is why the
 * strings here come through `t()` and the effect re-runs on every language change.
 *
 * The tags are written imperatively rather than rendered. React 19 will hoist a
 * <title> or <meta> from anywhere in the tree, but it appends: index.html's own
 * description would still be sitting in <head> alongside ours, and a crawler
 * picking between two is a coin toss. Writing by selector updates the existing
 * tag in place, so there is exactly one of each.
 *
 * A caveat worth stating plainly: this runs in the browser. Google executes JS
 * and will see these; WhatsApp, Facebook and iMessage fetch the raw HTML and
 * will not. Rich previews in chat apps additionally need the tags present in the
 * server response - see the crawler note in deploy/nginx/app.conf.
 */

// See the note in observability.js: a bare `process.env.*` read is a ReferenceError under Vite.
const SITE_URL =
  import.meta.env.VITE_SITE_URL ||
  (typeof process !== 'undefined' && process.env ? process.env.REACT_APP_SITE_URL : undefined) ||
  'https://aangan.in';

/** Upserts <meta {attr}="{key}" content="…">, or removes it when content is empty. */
function setMeta(attr: 'name' | 'property', key: string, content?: string) {
  const selector = `meta[${attr}="${key}"]`;
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!content) {
    if (el?.dataset.seo) el.remove();
    return;
  }
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    el.dataset.seo = 'true';
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setLink(rel: string, href?: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!href) {
    if (el?.dataset.seo) el.remove();
    return;
  }
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    el.dataset.seo = 'true';
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

export interface SeoProps {
  /** Page-specific part of the title. Omit on the homepage, which is the brand itself. */
  title?: string;
  description?: string;
  /** Absolute or site-relative image URL for the link preview. */
  image?: string;
  /** Defaults to the current path. Pass one to collapse variants onto a single URL. */
  canonical?: string;
  /** 'website' for browse pages, 'article' or 'place' for a single listing. */
  ogType?: string;
  /** Search-result and filtered pages: real content, but not their own destination. */
  noindex?: boolean;
}

/**
 * The same thing as <Seo/>, callable from a component body.
 *
 * Pages that return early - a dashboard with no business yet, a listing that 404s -
 * would otherwise have to render the element on every branch. A hook at the top
 * runs once regardless of which branch is taken.
 */
export function useSeo({ title, description, image, canonical, ogType = 'website', noindex = false }: SeoProps) {
  const { t, i18n } = useTranslation();
  const { pathname } = useLocation();

  const brand = t('brand');
  const tagline = t('brand_tagline');
  const fullTitle = title ? `${title} — ${brand}` : `${brand} — ${tagline}`;
  const desc = description || t('seo.default_description');
  // Query strings are tracking and filter state, never a distinct document; a
  // canonical that carried them would split one listing across a dozen URLs.
  const url = canonical || `${SITE_URL}${pathname}`;
  const img = image
    ? (image.startsWith('http') ? image : `${SITE_URL}${image}`)
    : `${SITE_URL}/logo512.png`;

  useEffect(() => {
    document.title = fullTitle;

    setMeta('name', 'description', desc);
    setLink('canonical', url);
    setMeta('name', 'robots', noindex ? 'noindex, follow' : undefined);

    setMeta('property', 'og:site_name', brand);
    setMeta('property', 'og:title', fullTitle);
    setMeta('property', 'og:description', desc);
    setMeta('property', 'og:url', url);
    setMeta('property', 'og:type', ogType);
    setMeta('property', 'og:image', img);
    setMeta('property', 'og:locale', i18n.language || 'en');

    // summary_large_image rather than summary: a travel listing is carried by its
    // photograph, and the small card crops it to a thumbnail beside the text.
    setMeta('name', 'twitter:card', 'summary_large_image');
    setMeta('name', 'twitter:title', fullTitle);
    setMeta('name', 'twitter:description', desc);
    setMeta('name', 'twitter:image', img);
  }, [fullTitle, desc, url, img, ogType, brand, noindex, i18n.language]);
}

export default function Seo(props: SeoProps) {
  useSeo(props);
  return null;
}
