// MUST stay the first import. Sentry instruments http/express/postgres by patching those modules
// as they load, so anything required ahead of this is invisible to it. See observability.ts.
import { SENTRY_ENABLED } from './observability';
import { app } from './app';
import { pool } from './db';
import { ensureBucketsExist } from './lib/s3';
import { PORT, log } from './config';
import { startRequestExpiry } from './lib/requestExpiry';
import { startGraceSweep } from './lib/hostGrace';
import { refreshSearchIndex } from './lib/searchIndex';
import { startSearchEventSweep } from './lib/searchEvents';


const server = app.listen(PORT, () => {
  log.info(`Server running on http://localhost:${PORT}`);
  log.info(`API docs available at http://localhost:${PORT}/api-docs`);
  // Stated at boot either way. "Errors are being reported" is the kind of assumption that is only
  // discovered to be false during the incident it was supposed to help with.
  log.info(
    SENTRY_ENABLED
      ? 'Error reporting: enabled (SENTRY_DSN is set)'
      : 'Error reporting: DISABLED  no SENTRY_DSN set, unhandled errors will only reach the container log.'
  );

  // Not awaited, and safe not to be: ensureBucketsExist() never rejects, and the port should open
  // whether or not MinIO is answering yet. Started here rather than before listen() so a slow
  // storage layer delays nothing  compose already gates this container on MinIO being healthy,
  // so in production this normally completes before the first request arrives.
  void ensureBucketsExist();

  // Booking requests a host never answered close by themselves (lib/requestExpiry.ts).
  startRequestExpiry();
  // Hosts on the free start hear when their 3rd booking is completed (lib/hostGrace.ts).
  startGraceSweep();
  // Searches older than SEARCH_LOG_DAYS (180) are deleted, as the Privacy Policy says (lib/searchEvents.ts).
  startSearchEventSweep();
  // Read every new or changed listing into the search index now, so the first search after a
  // deploy does not wait for it (each search also does this for what changed since).
  refreshSearchIndex()
    .then((n) => { if (n) log.info(`Search index: ${n} listings read.`); })
    .catch((e) => log.error(`Search index refresh failed; searches will retry it: ${e?.message || e}`));
});

process.on('SIGTERM', () => {
  log.info('SIGTERM signal received. Shutting down gracefully.');
  server.close(() => {
    pool.end(() => {
      log.info('Database pool shut down. Server stopped.');
    });
  });
});
