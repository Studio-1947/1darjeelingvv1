import React, { useEffect, useRef } from 'react';
import { Box } from '@/components/ag';
import { Icon, type IconName } from '@/components/ag/Icon';

/**
 * The animated "done" card: a payment confirmed (Membership), a listing put up (host sign-up).
 * The blush card slides in, the icon pops with a ring that pulses out once and a few confetti
 * dots, then the text and buttons rise in. Motion is skipped for people who ask for reduced
 * motion (styles/screens/account.css, .ag-paydone).
 *
 * `celebrate` (a purchase such as the membership pass) adds a confetti shower that bursts from
 * the icon and falls, a light sweep across the card and a second ring pulse.
 */

/** Confetti pieces, spread by index rather than Math.random so every render is the same. */
const CONFETTI = Array.from({ length: 28 }, (_, i) => {
  const side = i % 2 ? 1 : -1;
  const spread = 40 + ((i * 37) % 140);
  return {
    '--x': `${side * spread}px`,
    '--y': `${-(20 + ((i * 53) % 60))}px`,
    '--rot': `${(i * 67) % 360}deg`,
    '--d': `${0.5 + ((i * 29) % 40) / 100}s`,
  } as React.CSSProperties;
});

export default function PaymentDoneCard({ icon = 'check', title, body, note, children, testId = 'payment-done', celebrate = false }: {
  icon?: IconName;
  title: string;
  body: React.ReactNode;
  /** A short confirmed line under the body, e.g. "Host plan paid". */
  note?: React.ReactNode;
  /** The buttons. */
  children: React.ReactNode;
  testId?: string;
  /** The bigger celebration, for a purchase. */
  celebrate?: boolean;
}) {
  const head = useRef<HTMLHeadingElement>(null);
  useEffect(() => { head.current?.focus({ preventScroll: true }); }, []);
  return (
    <Box tone="blush" className={`ag-paydone${icon === 'check' ? ' tick' : ''}${celebrate ? ' celebrate' : ''}`} data-testid={testId}>
      {celebrate && (
        <span className="confetti" aria-hidden="true">
          {CONFETTI.map((style, i) => <i key={i} style={style} />)}
        </span>
      )}
      <span className="burst" aria-hidden="true">
        {Array.from({ length: 8 }, (_, i) => <i key={i} style={{ '--a': `${i * 45}deg` } as React.CSSProperties} />)}
      </span>
      <span className="big" aria-hidden="true"><Icon name={icon} /></span>
      <h1 ref={head} tabIndex={-1} role="status">{title}</h1>
      <p>{body}</p>
      {note && <span className="paid" data-testid={`${testId}-note`}><Icon name="check" />{note}</span>}
      {children}
    </Box>
  );
}
