import React from 'react';
import { useTranslation } from 'react-i18next';
import { useSeo } from '@/components/Seo';
import { Box, PageHead } from '@/components/ag';
import { Icon } from '@/components/ag/Icon';

/**
 * Travel responsibly (prototype data.js INFO.resp, drawn by V.info): a short intro, then the six
 * promises as a checked list in one box. Only what we can stand behind: no figures that live data
 * does not support.
 */
const PROMISES: [string, string, string, string][] = [
  ['responsible.p1_b', 'Say no to plastic.', 'responsible.p1_t', 'Carry your own bottle, bag and cup.'],
  ['responsible.p2_b', 'Stay local.', 'responsible.p2_t', 'Choose homestays. Your money reaches the family that hosts you.'],
  ['responsible.p3_b', 'Respect wildlife.', 'responsible.p3_t', 'Do not feed or chase animals. Watch from far.'],
  ['responsible.p4_b', 'Save the tea gardens.', 'responsible.p4_t', 'Walk on marked paths only.'],
  ['responsible.p5_b', 'Honour culture.', 'responsible.p5_t', 'Ask before you photograph monasteries, rituals and people.'],
  ['responsible.p6_b', 'Keep it quiet.', 'responsible.p6_t', 'Keep noise low. Quiet hours are 8 pm to 6 am.'],
];

export default function Responsible() {
  const { t } = useTranslation();
  const intro = t('responsible.intro', 'Darjeeling is a fragile Himalayan place. Six promises keep it that way. Ask them of yourself and of anyone you travel with.');
  useSeo({ title: t('responsible.title'), description: intro });

  return (
    <div className="ag-wrap" data-testid="responsible-page">
      <div className="ag-main">
        <PageHead eyebrow={t('responsible.eyebrow')} title={t('responsible.title')} />
        <p className="m-0 text-base leading-relaxed text-[var(--ink7)]" data-testid="responsible-intro">{intro}</p>

        <Box>
          <ul className="ag-host-track">
            {PROMISES.map(([bk, bd, tk, td], i) => (
              <li key={bk} className="done" data-testid={`responsible-promise-${i}`}>
                <span className="d" aria-hidden="true"><Icon name="check" /></span>
                <span className="min-w-0 text-[15px] leading-[22px] text-[var(--ink7)]">
                  <b className="!inline !font-medium !text-[var(--ink-strong)]">{t(bk, bd)}</b> {t(tk, td)}
                </span>
              </li>
            ))}
          </ul>
        </Box>
      </div>
    </div>
  );
}
