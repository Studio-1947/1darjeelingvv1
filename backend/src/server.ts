// MUST stay the first import. Sentry instruments http/express/postgres by patching those modules
// as they load, so anything required ahead of this is invisible to it. See observability.ts.
import { SENTRY_ENABLED } from './observability';
import { app } from './app';
import { pool } from './db';
import { PORT, log } from './config';


const server = app.listen(PORT, () => {
  log.info(`Server running on http://localhost:${PORT}`);
  log.info(`API docs available at http://localhost:${PORT}/api-docs`);
  // Stated at boot either way. "Errors are being reported" is the kind of assumption that is only
  // discovered to be false during the incident it was supposed to help with.
  log.info(
    SENTRY_ENABLED
      ? 'Error reporting: enabled (SENTRY_DSN is set)'
      : 'Error reporting: DISABLED — no SENTRY_DSN set, unhandled errors will only reach the container log.'
  );
});

process.on('SIGTERM', () => {
  log.info('SIGTERM signal received. Shutting down gracefully.');
  server.close(() => {
    pool.end(() => {
      log.info('Database pool shut down. Server stopped.');
    });
  });
});
