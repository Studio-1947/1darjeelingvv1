import { app } from './app';
import { pool } from './db';
import { PORT, log } from './config';

const server = app.listen(PORT, () => {
  log.info(`Server running on http://localhost:${PORT}`);
  log.info(`API docs available at http://localhost:${PORT}/api-docs`);
});

process.on('SIGTERM', () => {
  log.info('SIGTERM signal received. Shutting down gracefully.');
  server.close(() => {
    pool.end(() => {
      log.info('Database pool shut down. Server stopped.');
    });
  });
});
