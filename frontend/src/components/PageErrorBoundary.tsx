import React from 'react';
import { useLocation } from 'react-router-dom';
import { WarningCircle } from '@phosphor-icons/react';
import i18n from '@/i18n';
import { Box, Button } from '@/components/ag';

/**
 * Catches a page that throws while rendering, so the visitor sees a message and a Reload button
 * inside the normal header and tab bar instead of a blank white screen. It resets when the route
 * changes, so moving to another tab recovers without a reload.
 */
class Boundary extends React.Component<{ children: React.ReactNode; resetKey: string }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    // Sentry (observability.js) picks up console errors in production.
    console.error('Page crashed', error);
  }

  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.failed) this.setState({ failed: false });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="ag-wrap">
        <div className="ag-main">
          <Box data-testid="page-error">
            <WarningCircle className="w-8 h-8 text-[var(--r)]" aria-hidden="true" />
            <h2>{i18n.t('common.something_wrong')}</h2>
            <Button variant="primary" go onClick={() => window.location.reload()} data-testid="page-error-reload">
              {i18n.t('kyc.tryAgain')}
            </Button>
          </Box>
        </div>
      </div>
    );
  }
}

export default function PageErrorBoundary({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  return <Boundary resetKey={pathname}>{children}</Boundary>;
}
