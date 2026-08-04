/**
 * Error reporting. MUST be the first import in server.ts.
 *
 * Sentry instruments http/express/postgres by patching those modules as they load, so an init
 * that runs after they have been required silently captures far less. That ordering requirement
 * is also why this file reads `process.env` directly instead of importing `./config` — pulling
 * config in would drag Razorpay (and therefore `http`) in ahead of the patching.
 *
 * WHY THIS EXISTS: 1darjeeling.in was down for 25 hours in August 2026 and nobody knew. Nothing
 * in the stack reported anything, because nothing was watching. This covers one half of that —
 * errors thrown by a RUNNING server. It cannot report a server that never started, which is what
 * actually happened; an external uptime check on /api/health is the other half, and neither
 * substitutes for the other. See README "Monitoring".
 *
 * Inert without SENTRY_DSN. That is the normal state for development and the test suite, and it
 * means nothing leaves the machine until an operator deliberately supplies a destination.
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as Sentry from '@sentry/node';
import { scrubHeaders, scrubUrl, scrubValue } from './lib/scrub';

dotenv.config({ path: path.join(__dirname, '../.env') });

const DSN = process.env.SENTRY_DSN?.trim();
const APP_ENV = process.env.APP_ENV?.trim() || 'development';

export const SENTRY_ENABLED = Boolean(DSN);

if (DSN) {
  Sentry.init({
    dsn: DSN,
    environment: APP_ENV,

    // Performance tracing is off by default: it samples ordinary successful requests, which is a
    // continuous stream of URLs and timings rather than the exceptional events this is here for.
    // Raise deliberately and temporarily if a latency question needs answering.
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0),

    // Sentry's own PII switch — off means it does not attach IP addresses, cookies or user
    // identity of its own accord. beforeSend below is the belt to this pair of braces; neither is
    // trusted alone, because this codebase handles government ID documents.
    sendDefaultPii: false,

    beforeSend(event) {
      // Request: the highest-risk object in the payload. It carries the Authorization header that
      // authenticated the call and, on an upload route, a base64 Aadhaar scan in the body.
      if (event.request) {
        event.request.headers = scrubHeaders(event.request.headers) as Record<string, string>;
        event.request.url = scrubUrl(event.request.url);
        event.request.query_string = undefined;
        event.request.cookies = undefined;
        if (event.request.data !== undefined) {
          event.request.data = scrubValue(event.request.data);
        }
      }

      // Identity is never useful enough here to justify shipping it. A booking id in the message
      // is enough to find the row locally.
      event.user = undefined;

      if (event.extra) event.extra = scrubValue(event.extra) as Record<string, unknown>;
      if (event.contexts) event.contexts = scrubValue(event.contexts) as typeof event.contexts;

      // Stack-local variables are the quietest leak of the lot: a frame inside the KYC upload
      // handler holds the decoded document buffer, and Sentry attaches those variables when it
      // can. Drop them wholesale — the stack trace itself is what makes a report actionable.
      for (const exception of event.exception?.values ?? []) {
        for (const frame of exception.stacktrace?.frames ?? []) {
          frame.vars = undefined;
        }
      }

      return event;
    },

    beforeBreadcrumb(breadcrumb) {
      // HTTP breadcrumbs record every outbound call made before the error, URLs included — that
      // is where an OTP-send to a provider, complete with the phone number, would show up.
      if (breadcrumb.category === 'http' && breadcrumb.data?.url) {
        breadcrumb.data.url = scrubUrl(String(breadcrumb.data.url));
      }
      if (breadcrumb.data) breadcrumb.data = scrubValue(breadcrumb.data) as Record<string, unknown>;
      return breadcrumb;
    },
  });
}

/**
 * Reports an error, if reporting is configured at all.
 *
 * Wrapped rather than calling Sentry directly at the call sites so that the rest of the codebase
 * carries no dependency on the SDK, and so swapping providers is one file.
 */
export function reportError(err: unknown, context?: Record<string, unknown>): void {
  if (!SENTRY_ENABLED) return;
  Sentry.withScope((scope) => {
    if (context) scope.setContext('handler', scrubValue(context) as Record<string, unknown>);
    Sentry.captureException(err);
  });
}

export { Sentry };
