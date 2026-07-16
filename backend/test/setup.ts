import { beforeEach, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { db, pool } from '../src/db';

beforeEach(async () => {
  // TRUNCATE ... CASCADE clears all tables regardless of FK order and resets identity if any.
  await db.execute(sql`TRUNCATE TABLE payments, bookings, listings, providers, otps, users RESTART IDENTITY CASCADE`);
});

afterAll(async () => {
  await pool.end();
});
