import React from 'react';
import { useTranslation } from 'react-i18next';
import Seo from '@/components/Seo';
import { Box, PageHead } from '@/components/ag';
import { COMPANY } from '@/constants/company';

/**
 * The renderer shared by every policy page  Privacy, Terms, Refunds and Contact: readable text in
 * the one column, 16px body and 500-weight headings. `children` follow the last section.
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
  /** `officer` marks the grievance card, which also names the officer from constants/company.ts. */
  contact?: { name: string; email: string; phone?: string; address: string; officer?: boolean };
}

/** Paragraph + bullets + closer  the body shared by sections and sub-sections. */
function Body({ block }: { block: Block }) {
  return (
    <>
      {block.p && <p className="m-0 text-base leading-[26px] text-[var(--ink7)]">{block.p}</p>}
      {block.items && block.items.length > 0 && (
        <ul className="m-0 p-0 list-none flex flex-col gap-2 text-base leading-[26px] text-[var(--ink7)]">
          {block.items.map((it, i) => (
            <li key={i} className="flex gap-3">
              <span aria-hidden="true" className="mt-[10px] w-1.5 h-1.5 rounded-full bg-[var(--r)] flex-none" />
              <span>{it}</span>
            </li>
          ))}
        </ul>
      )}
      {block.note && <p className="m-0 text-base leading-[26px] text-[var(--ink7)]">{block.note}</p>}
    </>
  );
}

export default function LegalDocument({ ns, testId, children }: { ns: string; testId: string; children?: React.ReactNode }) {
  const { t } = useTranslation();

  // These documents are authored in English only and reach the other languages through i18next's
  // fallback. If a lookup ever fails to resolve, t() hands back the key as a string  guard so a
  // legal page degrades to empty rather than throwing.
  const rawIntro = t(`${ns}.intro`, { returnObjects: true, email: COMPANY.email });
  const intro: string[] = Array.isArray(rawIntro) ? rawIntro : [];
  // `{{email}}` in the texts is the one support address from constants/company.ts.
  const rawSections = t(`${ns}.sections`, { returnObjects: true, email: COMPANY.email });
  const sections: Block[] = Array.isArray(rawSections) ? rawSections : [];

  return (
    <div className="ag-wrap" data-testid={testId}>
      {/* Razorpay and the Consumer Protection rules both require these pages to be
          findable, so they carry their own title and description rather than the
          site-wide default. The first intro paragraph is the document's own summary. */}
      <Seo title={t(`${ns}.title`)} description={intro[0]} />
      <article className="ag-main">
        <PageHead eyebrow={t('policies.title')} title={t(`${ns}.title`)} sub={t(`${ns}.updated`)} />

        {intro.map((p, i) => (
          <p key={i} className="m-0 text-base leading-[26px] text-[var(--ink7)]">{p}</p>
        ))}

        {sections.map((s, i) => (
          <section key={i} className="flex flex-col gap-3 pt-2">
            <h2 className="m-0 text-xl leading-7 font-medium tracking-[-0.01em] text-[var(--ink-strong)]">{s.h}</h2>
            <Body block={s} />

            {s.sub?.map((sub, j) => (
              <div key={j} className="flex flex-col gap-2 pl-4 border-l-2 border-[var(--warmline)]">
                <h3 className="m-0 text-base leading-6 font-medium text-[var(--ink-strong)]">{sub.h}</h3>
                <Body block={sub} />
              </div>
            ))}

            {s.contact && (
              <Box className="!gap-1 text-base leading-[26px] text-[var(--ink7)]">
                <address className="not-italic flex flex-col gap-1">
                  <b className="font-medium text-[var(--ink-strong)]">{s.contact.name}</b>
                  {/* constants/company.ts; each line appears once its value is filled in. */}
                  {s.contact.officer && COMPANY.grievanceOfficer && (
                    <span data-testid="grievance-officer">
                      {t('privacy.officer_label')} {COMPANY.grievanceOfficer}{COMPANY.grievanceDesignation && `, ${COMPANY.grievanceDesignation}`}
                    </span>
                  )}
                  <span>
                    {t('privacy.email_label')}{' '}
                    <a href={`mailto:${COMPANY.email}`} className="font-medium text-[var(--r)] hover:underline">{COMPANY.email}</a>
                  </span>
                  {s.contact.phone && (
                    <span>
                      {t('privacy.phone_label')}{' '}
                      <a href={`tel:${s.contact.phone.replace(/\s/g, '')}`} className="font-medium text-[var(--r)] hover:underline">{s.contact.phone}</a>
                    </span>
                  )}
                  <span>{t('privacy.address_label')} {s.contact.address}</span>
                </address>
              </Box>
            )}
          </section>
        ))}

        {children}
      </article>
    </div>
  );
}
