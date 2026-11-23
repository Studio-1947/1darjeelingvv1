import React, { useEffect, useRef } from 'react';
import { Box, Button } from '@/components/ag';
import { Icon } from '@/components/ag/Icon';

/**
 * "Payment done", shown the moment a payment is confirmed: the same blush card as the host
 * wizard's "Your listing is up", with the tick drawn in, a ring that pulses out once, and a few
 * confetti dots. Motion is skipped for people who ask for reduced motion (styles/screens/account.css).
 */
export default function PaymentDoneCard({ title, body, action, onAction }: {
  title: string;
  body: React.ReactNode;
  action: string;
  onAction: () => void;
}) {
  const head = useRef<HTMLHeadingElement>(null);
  useEffect(() => { head.current?.focus({ preventScroll: true }); }, []);
  return (
    <Box tone="blush" className="ag-paydone" data-testid="payment-done">
      <span className="burst" aria-hidden="true">
        {Array.from({ length: 8 }, (_, i) => <i key={i} style={{ '--a': `${i * 45}deg` } as React.CSSProperties} />)}
      </span>
      <span className="big" aria-hidden="true"><Icon name="check" /></span>
      <h1 ref={head} tabIndex={-1} role="status">{title}</h1>
      <p>{body}</p>
      <Button go onClick={onAction} data-testid="payment-done-next">{action}</Button>
    </Box>
  );
}
