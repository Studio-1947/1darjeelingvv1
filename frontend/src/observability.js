import * as Sentry from "@sentry/react";

/**
 * Browser error reporting. Imported first in index.tsx so it is listening before the app renders.
 *
 * Inert without REACT_APP_SENTRY_DSN, which is the normal state for development. Note the
 * build-time catch: Create React App inlines REACT_APP_* variables into the bundle during
 * `yarn build`, so this is fixed at image build time, NOT read from the container's environment.
 * Turning it on therefore requires a rebuild — see deploy/nginx/Dockerfile, where the value is
 * threaded through as a build arg from the stack's .env.
 *
 * Scrubbing mirrors backend/src/lib/scrub.ts, and matters for the same reason: this platform
 * handles phone numbers and government ID documents, and an error report is assembled from
 * exactly the material most likely to contain them.
 */

const DSN = process.env.REACT_APP_SENTRY_DSN;

const REDACTED = "[redacted]";

/** Substring-matched, case-insensitive — `phone` also covers `contactPhone`, `phone_number`. */
const SENSITIVE = [
  "phone", "mobile", "otp", "email", "token", "password", "auth", "secret",
  "aadhaar", "aadhar", "pan", "licence", "license",
  "file", "document", "image", "avatar", "photo", "base64",
];

function isSensitive(key) {
  const lower = String(key).toLowerCase();
  return SENSITIVE.some((needle) => lower.includes(needle));
}

function scrub(value, depth = 0) {
  if (value === null || value === undefined) return value;
  if (depth >= 6) return REDACTED;
  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1));
  if (typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = isSensitive(k) ? REDACTED : scrub(v, depth + 1);
    }
    return out;
  }
  if (typeof value === "string" && value.length > 1024) {
    return `${value.slice(0, 128)}… [truncated ${value.length} chars]`;
  }
  return value;
}

/** Query VALUES stripped, keys kept — a login URL otherwise carries a real phone number. */
function scrubUrl(url) {
  if (!url) return url;
  try {
    const parsed = new URL(url, window.location.origin);
    for (const key of Array.from(parsed.searchParams.keys())) {
      parsed.searchParams.set(key, REDACTED);
    }
    return parsed.toString();
  } catch {
    return String(url).split("?")[0];
  }
}

/**
 * Which deployment this browser is talking to.
 *
 * Derived from the hostname at runtime rather than baked in at build time, for two reasons: the
 * SAME bundle is deployed to both stacks, so a build-time value would be wrong on one of them;
 * and NODE_ENV is "production" for every production build, so it cannot tell staging from real.
 * Without this, staging errors and real incidents arrive in Sentry indistinguishable.
 *
 * The canonical host is named explicitly and everything else defaults to staging — the same
 * inversion as the $robots_tag map in deploy/nginx/app.conf, and for the same reason: a new
 * preview host should be non-production by default rather than by someone remembering.
 */
function deploymentEnvironment() {
  if (process.env.NODE_ENV !== "production") return "development";
  const host = window.location.hostname.toLowerCase();
  return /^(www\.)?1darjeeling\.in$/.test(host) ? "production" : "staging";
}

export const SENTRY_ENABLED = Boolean(DSN);

if (DSN) {
  Sentry.init({
    dsn: DSN,
    environment: deploymentEnvironment(),

    // Session Replay and performance tracing are deliberately NOT enabled. Replay records the
    // DOM — on this site that means the OTP a user typed, the ID document they picked, and the
    // phone number in their profile. It is the single most invasive thing this SDK offers and
    // nothing about diagnosing a crash needs it.
    tracesSampleRate: 0,

    sendDefaultPii: false,

    beforeSend(event) {
      if (event.request) {
        event.request.url = scrubUrl(event.request.url);
        event.request.query_string = undefined;
        event.request.headers = undefined;
        if (event.request.data !== undefined) event.request.data = scrub(event.request.data);
      }
      event.user = undefined;
      if (event.extra) event.extra = scrub(event.extra);
      return event;
    },

    beforeBreadcrumb(breadcrumb) {
      // Navigation and fetch breadcrumbs carry full URLs, which on this app include phone numbers
      // in the auth flow.
      if (breadcrumb.data?.url) breadcrumb.data.url = scrubUrl(breadcrumb.data.url);
      if (breadcrumb.data?.to) breadcrumb.data.to = scrubUrl(breadcrumb.data.to);
      if (breadcrumb.data?.from) breadcrumb.data.from = scrubUrl(breadcrumb.data.from);
      // A `ui.input` breadcrumb records what was typed into a field. Never useful here, and on the
      // login screen it is the OTP.
      if (breadcrumb.category === "ui.input") return null;
      return breadcrumb;
    },
  });
}
