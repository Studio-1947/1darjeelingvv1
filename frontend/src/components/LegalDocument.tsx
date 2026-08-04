import React from 'react';
import { useTranslation } from 'react-i18next';

/**
 * The renderer shared by every policy page — Privacy, Terms, Refunds and Contact.
 *
 * All four are the same document shape (title, updated stamp, intro paragraphs, numbered
 * sections, an optional contact card) differing only in which i18n namespace they read, so they
 * share one component rather than four near-copies that drift apart. A page is therefore content
 * plus one line of code, which is what makes adding the policies Razorpay requires cheap.
 */

/**
 * Shape of one block in `<ns>.sections`. Every field past `h` is optional, so a section can be a
 * plain paragraph, a lead-in plus bullets, a set of numbered sub-sections, or the contact card.
 */
export interface Block {
  h: string;
  p?: string;
  items?: string[];
  /** Trailing paragraph, for the "you can control cookies…" style closers. */
  note?: string;
  sub?: Block[];
  contact?: { name: string; email: string; address: string };
}

/** Paragraph + bullets + closer — the body shared by sections and sub-sections. */
function Body({ block }: { block: Block }) {
  return (
    <>
      {block.p && <p className="mt-2 text-sm md:text-base text-ink-soft leading-relaxed">{block.p}</p>}
      {block.items && block.items.length > 0 && (
        <ul className="mt-3 space-y-2 text-sm md:text-base text-ink-soft leading-relaxed">
          {block.items.map((it, i) => (
            <li key={i} className="flex gap-3">
              <span aria-hidden="true" className="mt-2 w-1.5 h-1.5 rounded-full bg-pine flex-shrink-0" />
              <span>{it}</span>
            </li>
          ))}
        </ul>
      )}
      {block.note && <p className="mt-3 text-sm md:text-base text-ink-soft leading-relaxed">{block.note}</p>}
    </>
  );
}

export default function LegalDocument({ ns, testId }: { ns: string; testId: string }) {
  const { t } = useTranslation();

  // These documents are authored in English only and reach the other languages through i18next's
  // fallback. If a lookup ever fails to resolve, t() hands back the key as a string — guard so a
  // legal page degrades to empty rather than throwing.
  const rawIntro = t(`${ns}.intro`, { returnObjects: true });
  const intro: string[] = Array.isArray(rawIntro) ? rawIntro : [];
  const rawSections = t(`${ns}.sections`, { returnObjects: true });
  const sections: Block[] = Array.isArray(rawSections) ? rawSections : [];

  return (
    <div className="mx-auto max-w-3xl px-4 md:px-8 py-10 md:py-14" data-testid={testId}>
      <h1 className="font-display font-extrabold text-3xl sm:text-4xl md:text-5xl text-ink leading-tight">{t(`${ns}.title`)}</h1>
      <p className="text-sm text-ink-soft mt-2">{t(`${ns}.updated`)}</p>

      <div className="mt-6 space-y-4">
        {intro.map((p, i) => (
          <p key={i} className="text-sm md:text-base text-ink-soft leading-relaxed">{p}</p>
        ))}
      </div>

      <div className="mt-8 md:mt-10 space-y-8 md:space-y-10">
        {sections.map((s, i) => (
          <section key={i}>
            <h2 className="font-display font-bold text-xl md:text-2xl text-ink">{s.h}</h2>
            <Body block={s} />

            {s.sub?.map((sub, j) => (
              <div key={j} className="mt-5 pl-4 border-l-2 border-[var(--line)]">
                <h3 className="font-display font-bold text-base md:text-lg text-ink">{sub.h}</h3>
                <Body block={sub} />
              </div>
            ))}

            {s.contact && (
              <address className="mt-4 not-italic rounded-2xl border border-[var(--line)] bg-white p-4 md:p-5 text-sm md:text-base text-ink-soft leading-relaxed">
                <div className="font-bold text-ink">{s.contact.name}</div>
                <div className="mt-1">
                  {t('privacy.email_label')}{' '}
                  <a href={`mailto:${s.contact.email}`} className="font-semibold text-pine hover:underline">
                    {s.contact.email}
                  </a>
                </div>
                <div className="mt-1">{t('privacy.address_label')} {s.contact.address}</div>
              </address>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
