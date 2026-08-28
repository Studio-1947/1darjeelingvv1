import { NotificationTemplate } from './types';

/**
 * The configuration checks every provider adapter needs, in one place.
 *
 * Three adapters grew the same two guards independently, and by the third the
 * NOTIFY_BOOKINGS block was byte-identical in all of them. The per-vendor payload shaping is
 * genuinely different and stays in the adapters; this is only the part that was the same.
 */

/** Reports missing credentials as one error naming all of them, not the first one found. */
export function requireCredentials(provider: string, env: NodeJS.ProcessEnv, keys: string[]): void {
  const missing = keys.filter((k) => !env[k]?.trim());
  if (missing.length > 0) {
    throw new Error(
      `[messaging] MESSAGING_PROVIDER=${provider} requires ${missing.join(', ')}. ` +
      `Set them, or use MESSAGING_PROVIDER=mock.`
    );
  }
}

/**
 * A deployment that means to notify people must fail at BOOT rather than at the first confirmed
 * booking — the same reasoning as the Razorpay checks in config.ts. Only demanded when
 * notifications are actually switched on, so a provider configured for login codes alone does
 * not have to register templates it will never send.
 *
 * `where` names the place to go and create them, which differs per vendor.
 */
export function requireNotificationTemplates(
  provider: string,
  env: NodeJS.ProcessEnv,
  templateEnvVars: Record<NotificationTemplate, string>,
  where: string
): void {
  if (env.NOTIFY_BOOKINGS?.trim().toLowerCase() !== 'true') return;

  const missing = Object.values(templateEnvVars).filter((k) => !env[k]?.trim());
  if (missing.length > 0) {
    throw new Error(
      `[messaging] NOTIFY_BOOKINGS=true with MESSAGING_PROVIDER=${provider} requires a template ` +
      `for every transactional message: ${missing.join(', ')}. ${where}, or set ` +
      `NOTIFY_BOOKINGS=false to leave booking notifications off.`
    );
  }
}
