/**
 * Site-wide switches an admin flips from the panel, stored in `app_settings`.
 *
 * Maintenance is the first one. The server's .env still sets the default (MAINTENANCE, see
 * config.ts), and an admin's choice in the panel overrides it until they reset it. So a restart
 * or a redeploy never undoes what an admin turned on or off, and the .env value still decides on
 * a fresh database.
 *
 * GET /api/app/status reads this on every website load, so the value is cached for a few seconds.
 * A write clears the cache at once on this instance; any other instance catches up within
 * CACHE_MS.
 */
import { eq } from 'drizzle-orm';

import { db, schema } from '../db';
import { log, maintenanceEnabled } from '../config';

const MAINTENANCE_KEY = 'maintenance';
const CACHE_MS = 5_000;

export interface MaintenanceState {
  /** What the website does right now. */
  enabled: boolean;
  /** 'admin' when the panel set it; 'env' when it comes from the server's .env default. */
  source: 'admin' | 'env';
  /** What the .env default would be with no admin choice. */
  env_default: boolean;
  updated_at: string | null;
  updated_by: string | null;
}

type Row = typeof schema.appSettings.$inferSelect;
// Only the database row is cached; the .env default is read on every call.
let cached: { at: number; row: Row | null } | null = null;

/** For tests: forget the cached row. */
export function resetSiteSettingsCache(): void {
  cached = null;
}

async function maintenanceRow(): Promise<Row | null> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.row;
  const [row] = await db.select().from(schema.appSettings).where(eq(schema.appSettings.key, MAINTENANCE_KEY)).limit(1);
  cached = { at: Date.now(), row: row ?? null };
  return cached.row;
}

export async function maintenanceState(): Promise<MaintenanceState> {
  const envDefault = maintenanceEnabled();
  const fallback: MaintenanceState = { enabled: envDefault, source: 'env', env_default: envDefault, updated_at: null, updated_by: null };
  let row: Row | null;
  try {
    row = await maintenanceRow();
  } catch (err) {
    // The .env default is the safe answer: the website must still load if this read fails.
    log.error(`[siteSettings] could not read maintenance: ${(err as Error).message}`);
    return fallback;
  }
  if (!row || typeof row.value !== 'boolean') return fallback;
  return { enabled: row.value, source: 'admin', env_default: envDefault, updated_at: row.updatedAt, updated_by: row.updatedBy };
}

export async function isMaintenanceOn(): Promise<boolean> {
  return (await maintenanceState()).enabled;
}

/** `enabled` true or false is the admin's choice; null removes it, so the .env default applies again. */
export async function setMaintenance(enabled: boolean | null, by: string): Promise<MaintenanceState> {
  if (enabled === null) {
    await db.delete(schema.appSettings).where(eq(schema.appSettings.key, MAINTENANCE_KEY));
  } else {
    const now = new Date().toISOString();
    await db.insert(schema.appSettings)
      .values({ key: MAINTENANCE_KEY, value: enabled, updatedAt: now, updatedBy: by })
      .onConflictDoUpdate({ target: schema.appSettings.key, set: { value: enabled, updatedAt: now, updatedBy: by } });
  }
  cached = null;
  return maintenanceState();
}
