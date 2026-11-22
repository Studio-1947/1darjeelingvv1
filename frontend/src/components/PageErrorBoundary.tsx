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
/**
 * A page's code could not be fetched: the tab was opened before a deploy (or, locally, before the
 * dev server rebuilt), so the file it asks for no longer exists. A fresh load fixes it, so that
 * case reloads once by itself instead of showing the error. At most one such reload per 30
 * seconds, so a file that is really missing shows the error instead of looping.
 */
const CHUNK_ERROR = /dynamically imported module|Importing a module script failed|error loading dynamically imported|ChunkLoadError/i;
const RELOADED_KEY = 'ag-chunk-reloaded';

function reloadOnceForStaleCode(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  if (!CHUNK_ERROR.test(msg)) return false;
  try {
    if (Date.now() - Number(sessionStorage.getItem(RELOADED_KEY) || 0) < 30_000) return false;
    sessionStorage.setItem(RELOADED_KEY, String(Date.now()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

class Boundary extends React.Component<{ children: React.ReactNode; resetKey: string }, { failed: boolean; message: string }> {
  state = { failed: false, message: '' };

  static getDerivedStateFromError(error: unknown) {
    return { failed: true, message: error instanceof Error ? error.message : String(error) };
  }

  componentDidCatch(error: unknown) {
    if (reloadOnceForStaleCode(error)) return;
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
            {/* Local builds only: the reason, so a crash seen while testing can be reported exactly. */}
            {import.meta.env.DEV && this.state.message ? (
              <p className="text-[13px] opacity-70 break-words" data-testid="page-error-detail">{this.state.message}</p>
            ) : null}
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
