# Messaging Provider Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make real OTP delivery a config change rather than a code change, so any provider can be swapped in, and close the OTP expiry and brute-force gaps in the same path.

**Architecture:** A `src/messaging/` module exposes one function, `sendOtp()`. Provider adapters implement a small `MessagingProvider` interface and are chosen by name from a registry using the `MESSAGING_PROVIDER` env var. The selected provider validates its own credentials at boot, so a half-configured provider prevents startup instead of failing in front of a user. `routes/auth.ts` imports `sendOtp` and gains no provider-specific branching.

**Tech Stack:** TypeScript, Express 5, Drizzle ORM, Postgres, Vitest + Supertest. Node 20 in Docker/CI (global `fetch` and `AbortSignal.timeout` are available; no HTTP client dependency is added).

**Spec:** `docs/superpowers/specs/2026-07-20-otp-provider-layer-design.md`

## Global Constraints

- All 80 existing backend tests must stay green after every task. Run `npm test` from `backend/`.
- `npx tsc --noEmit` must be clean from `backend/` after every task.
- No new runtime dependencies. Use global `fetch`.
- Never log or return a provider credential. Never forward a provider response body to an HTTP client.
- Schema changes go through `npm run db:generate` and the generated SQL is committed. CI fails if `schema.ts` changes without a matching migration.
- Existing test helper `registerUser()` logs in with OTP `123456`. That universal code must keep working under `APP_ENV=test`, which it does because `MESSAGING_PROVIDER` defaults to `mock`.
- Work happens on branch `feat/otp-provider-layer`. Do not push to `main` — pushing to `main` triggers the VPS deploy.

## Deviation from the spec

The spec lists `MSG91_SENDER_ID` as required. It is **optional** in this plan: MSG91's v5 OTP API takes the sender from the approved template, so requiring it would block boot on a variable the request never uses. Required for `msg91` are `MSG91_AUTH_KEY` and `MSG91_TEMPLATE_ID` only.

## File Structure

| File | Responsibility |
|---|---|
| `backend/src/messaging/types.ts` | `MessagingProvider` interface, `OtpMessage`, `MessageDeliveryError`. No logic. |
| `backend/src/messaging/providers/mock.ts` | Logs the code. Current dev behaviour, now behind the interface. |
| `backend/src/messaging/providers/msg91.ts` | Real HTTP delivery, injectable `fetch` for tests. |
| `backend/src/messaging/registry.ts` | Pure `selectProvider(name, env)`. Unknown name and missing creds both throw here. |
| `backend/src/messaging/index.ts` | Holds the selected provider; exports `sendOtp()` and a test seam. |
| `backend/src/config.ts` | Adds `MESSAGING_PROVIDER`, `MOCK_OTP`, `OTP_TTL_SECONDS`, `OTP_MAX_ATTEMPTS` + prod warning. |
| `backend/src/schema.ts` | Adds `attempts` to `otps`. |
| `backend/src/routes/auth.ts` | Calls `sendOtp`; 502 on failure; TTL and attempt checks on verify. |
| `backend/test/messaging.test.ts` | Registry + mock provider unit tests. |
| `backend/test/msg91.test.ts` | MSG91 adapter unit tests against a stubbed fetch. |
| `backend/test/otp.test.ts` | Route-level: 502 on delivery failure, TTL, attempt cap. |

---

### Task 1: Provider interface, mock adapter, and registry

**Files:**
- Create: `backend/src/messaging/types.ts`
- Create: `backend/src/messaging/providers/mock.ts`
- Create: `backend/src/messaging/registry.ts`
- Test: `backend/test/messaging.test.ts`

**Interfaces:**
- Consumes: `log` from `backend/src/config.ts`.
- Produces:
  - `interface MessagingProvider { readonly name: string; init(): void; sendOtp(m: OtpMessage): Promise<{ ref?: string }> }`
  - `interface OtpMessage { phone: string; otp: string; channel: string }`
  - `class MessageDeliveryError extends Error { readonly provider: string }`
  - `createMockProvider(): MessagingProvider`
  - `selectProvider(name: string, env: NodeJS.ProcessEnv): MessagingProvider`
  - `PROVIDER_FACTORIES: Record<string, (env: NodeJS.ProcessEnv) => MessagingProvider>`

- [ ] **Step 1: Write the failing test**

Create `backend/test/messaging.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { selectProvider, PROVIDER_FACTORIES } from '../src/messaging/registry';
import { MessageDeliveryError } from '../src/messaging/types';

describe('messaging registry', () => {
  it('selects the mock provider by name', () => {
    const provider = selectProvider('mock', {});
    expect(provider.name).toBe('mock');
  });

  it('throws for an unregistered provider name, listing what is available', () => {
    expect(() => selectProvider('carrier-pigeon', {})).toThrow(/not a registered provider/);
    expect(() => selectProvider('carrier-pigeon', {})).toThrow(/mock/);
  });

  it('registers both mock and msg91', () => {
    expect(Object.keys(PROVIDER_FACTORIES).sort()).toEqual(['mock', 'msg91']);
  });

  it('runs init() during selection so bad config fails at selection time', () => {
    // msg91 with no credentials must throw here, not at first send.
    expect(() => selectProvider('msg91', {})).toThrow(/MSG91_AUTH_KEY/);
  });

  it('does not validate providers that are not selected', () => {
    // Selecting mock must not care that MSG91 credentials are absent.
    expect(() => selectProvider('mock', {})).not.toThrow();
  });
});

describe('mock provider', () => {
  it('resolves without contacting anything', async () => {
    const provider = selectProvider('mock', {});
    await expect(provider.sendOtp({ phone: '+919999999999', otp: '123456', channel: 'whatsapp' }))
      .resolves.toEqual({});
  });
});

describe('MessageDeliveryError', () => {
  it('carries the provider name', () => {
    const err = new MessageDeliveryError('msg91', 'boom');
    expect(err.provider).toBe('msg91');
    expect(err.name).toBe('MessageDeliveryError');
    expect(err.message).toBe('boom');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run test/messaging.test.ts`
Expected: FAIL — `Cannot find module '../src/messaging/registry'`

- [ ] **Step 3: Write the types**

Create `backend/src/messaging/types.ts`:

```ts
export interface OtpMessage {
  phone: string;
  otp: string;
  channel: string;
}

export interface MessagingProvider {
  readonly name: string;

  /**
   * Validates this provider's required configuration. Runs at selection time for the
   * selected provider only, so a half-configured provider prevents startup rather than
   * failing in front of the first user. Throws on incomplete configuration.
   */
  init(): void;

  /**
   * Resolves only on confirmed handoff to the provider. Throws MessageDeliveryError on
   * any failure — a resolved promise is what allows the route to report `sent: true`.
   */
  sendOtp(msg: OtpMessage): Promise<{ ref?: string }>;
}

/**
 * Delivery failure. The message is a server-side diagnostic and may name the provider and
 * quote its response; it is never returned to an HTTP client.
 */
export class MessageDeliveryError extends Error {
  readonly provider: string;

  constructor(provider: string, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'MessageDeliveryError';
    this.provider = provider;
  }
}
```

- [ ] **Step 4: Write the mock provider**

Create `backend/src/messaging/providers/mock.ts`:

```ts
import { log } from '../../config';
import { MessagingProvider, OtpMessage } from '../types';

/**
 * Delivers nothing and says so. Preserves the pre-existing dev behaviour of logging the
 * code, now behind the provider interface. The route is what surfaces the code in the
 * response body; this adapter only logs.
 */
export function createMockProvider(): MessagingProvider {
  return {
    name: 'mock',

    init() {
      // No configuration to validate.
    },

    async sendOtp({ phone, otp }: OtpMessage) {
      log.info(`[MOCK OTP] phone=****${phone.slice(-4)} otp=${otp}`);
      return {};
    },
  };
}
```

- [ ] **Step 5: Write the registry**

Create `backend/src/messaging/registry.ts`:

```ts
import { MessagingProvider } from './types';
import { createMockProvider } from './providers/mock';
import { createMsg91Provider } from './providers/msg91';

/**
 * Adding a provider is two lines: an adapter file implementing MessagingProvider, and one
 * entry here. Nothing else in the codebase learns the provider's name.
 */
export const PROVIDER_FACTORIES: Record<string, (env: NodeJS.ProcessEnv) => MessagingProvider> = {
  mock: () => createMockProvider(),
  msg91: (env) => createMsg91Provider(env),
};

export function selectProvider(name: string, env: NodeJS.ProcessEnv): MessagingProvider {
  const factory = PROVIDER_FACTORIES[name];
  if (!factory) {
    throw new Error(
      `[messaging] MESSAGING_PROVIDER="${name}" is not a registered provider. ` +
      `Available: ${Object.keys(PROVIDER_FACTORIES).join(', ')}.`
    );
  }

  const provider = factory(env);
  // Validate here rather than at first send: a missing credential should stop the process
  // at boot, not strand a user on the code-entry screen.
  provider.init();
  return provider;
}
```

- [ ] **Step 6: Create a stub msg91 adapter so the registry imports resolve**

Task 2 fills this in and tests it properly. It needs to exist now only so `registry.ts` compiles.

Create `backend/src/messaging/providers/msg91.ts`:

```ts
import { MessagingProvider } from '../types';

export function createMsg91Provider(env: NodeJS.ProcessEnv): MessagingProvider {
  return {
    name: 'msg91',

    init() {
      const missing = ['MSG91_AUTH_KEY', 'MSG91_TEMPLATE_ID'].filter((k) => !env[k]?.trim());
      if (missing.length > 0) {
        throw new Error(
          `[messaging] MESSAGING_PROVIDER=msg91 requires ${missing.join(', ')}. ` +
          `Set them, or use MESSAGING_PROVIDER=mock.`
        );
      }
    },

    async sendOtp() {
      throw new Error('not implemented — see Task 2');
    },
  };
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd backend && npx vitest run test/messaging.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 8: Typecheck and run the full suite**

Run: `cd backend && npx tsc --noEmit && npm test`
Expected: clean typecheck; 87 tests passing (80 existing + 7 new).

- [ ] **Step 9: Commit**

```bash
git add backend/src/messaging backend/test/messaging.test.ts
git commit -m "feat(messaging): add provider interface, mock adapter and registry

Selection validates the chosen provider's config at selection time, so a
half-configured provider stops the process rather than failing in front of
a user. Non-selected providers are not validated."
```

---

### Task 2: MSG91 adapter

**Files:**
- Modify: `backend/src/messaging/providers/msg91.ts` (replace the Task 1 stub)
- Test: `backend/test/msg91.test.ts`

**Interfaces:**
- Consumes: `MessagingProvider`, `OtpMessage`, `MessageDeliveryError` from `../types`.
- Produces: `createMsg91Provider(env: NodeJS.ProcessEnv, fetchImpl?: typeof fetch): MessagingProvider`. The second parameter defaults to global `fetch` and exists so tests can stub the network.

- [ ] **Step 1: Verify the endpoint against current MSG91 docs**

Before writing code, confirm these against MSG91's current API reference, since the vendor may have revised v5:

- Endpoint `POST https://control.msg91.com/api/v5/otp`
- Query params `template_id`, `mobile`, `otp`
- Header `authkey`
- Success body `{"type":"success","request_id":"..."}`; failures return **HTTP 200** with `{"type":"error","message":"..."}`

If any differ, adjust the constants and the response-parsing branch below. The tests assert behaviour (throws on error-shaped body, returns ref on success), so they stay valid if the field names change — update the fixtures to match.

- [ ] **Step 2: Write the failing test**

Create `backend/test/msg91.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { createMsg91Provider } from '../src/messaging/providers/msg91';
import { MessageDeliveryError } from '../src/messaging/types';

const ENV = { MSG91_AUTH_KEY: 'secret-key-abc123', MSG91_TEMPLATE_ID: 'tpl_42' };
const MSG = { phone: '+91 99999 99999', otp: '654321', channel: 'whatsapp' };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('msg91 adapter', () => {
  it('returns the provider reference on success', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ type: 'success', request_id: 'req_99' }));
    const provider = createMsg91Provider(ENV, fetchImpl as unknown as typeof fetch);

    await expect(provider.sendOtp(MSG)).resolves.toEqual({ ref: 'req_99' });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('sends the auth key as a header and normalises the phone to digits', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ type: 'success', request_id: 'r' }));
    const provider = createMsg91Provider(ENV, fetchImpl as unknown as typeof fetch);

    await provider.sendOtp(MSG);

    const [url, init] = fetchImpl.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(init.headers.authkey).toBe('secret-key-abc123');
    // "+91 99999 99999" must reach MSG91 as "919999999999".
    expect(url).toContain('mobile=919999999999');
    expect(url).toContain('template_id=tpl_42');
    expect(url).toContain('otp=654321');
  });

  it('throws when MSG91 reports an error under HTTP 200', async () => {
    // The quirk a generic HTTP sender would read as success.
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ type: 'error', message: 'invalid template' }));
    const provider = createMsg91Provider(ENV, fetchImpl as unknown as typeof fetch);

    await expect(provider.sendOtp(MSG)).rejects.toBeInstanceOf(MessageDeliveryError);
    await expect(provider.sendOtp(MSG)).rejects.toThrow(/invalid template/);
  });

  it('throws on a non-2xx response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ message: 'unauthorized' }, 401));
    const provider = createMsg91Provider(ENV, fetchImpl as unknown as typeof fetch);

    await expect(provider.sendOtp(MSG)).rejects.toThrow(/HTTP 401/);
  });

  it('throws on a non-JSON body', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('<html>gateway</html>', { status: 200 }));
    const provider = createMsg91Provider(ENV, fetchImpl as unknown as typeof fetch);

    await expect(provider.sendOtp(MSG)).rejects.toThrow(/non-JSON/);
  });

  it('throws on a network failure', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const provider = createMsg91Provider(ENV, fetchImpl as unknown as typeof fetch);

    await expect(provider.sendOtp(MSG)).rejects.toThrow(/network error/);
  });

  it('never leaks the auth key in a thrown message', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ type: 'error', message: 'nope' }));
    const provider = createMsg91Provider(ENV, fetchImpl as unknown as typeof fetch);

    await expect(provider.sendOtp(MSG)).rejects.toThrow(
      expect.objectContaining({ message: expect.not.stringContaining('secret-key-abc123') })
    );
  });

  it('rejects incomplete configuration at init', () => {
    expect(() => createMsg91Provider({ MSG91_AUTH_KEY: 'k' }).init()).toThrow(/MSG91_TEMPLATE_ID/);
    expect(() => createMsg91Provider({ MSG91_TEMPLATE_ID: 't' }).init()).toThrow(/MSG91_AUTH_KEY/);
    expect(() => createMsg91Provider({ ...ENV }).init()).not.toThrow();
  });

  it('treats a whitespace-only credential as missing', () => {
    expect(() => createMsg91Provider({ MSG91_AUTH_KEY: '   ', MSG91_TEMPLATE_ID: 't' }).init())
      .toThrow(/MSG91_AUTH_KEY/);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && npx vitest run test/msg91.test.ts`
Expected: FAIL — the stub throws `not implemented — see Task 2`.

- [ ] **Step 4: Implement the adapter**

Replace the entire contents of `backend/src/messaging/providers/msg91.ts`:

```ts
import { MessagingProvider, OtpMessage, MessageDeliveryError } from '../types';

const MSG91_OTP_URL = 'https://control.msg91.com/api/v5/otp';

// A hung provider must not hold an Express handler open indefinitely.
const REQUEST_TIMEOUT_MS = 10_000;

const MAX_QUOTED_BODY = 200;

/**
 * MSG91 v5 OTP API.
 *
 * `fetchImpl` is injectable purely so the suite can exercise every failure branch without a
 * network — the same reason rateLimiter takes `opts.enabled`. Application code always gets
 * the global fetch.
 */
export function createMsg91Provider(
  env: NodeJS.ProcessEnv,
  fetchImpl: typeof fetch = fetch
): MessagingProvider {
  return {
    name: 'msg91',

    init() {
      const missing = ['MSG91_AUTH_KEY', 'MSG91_TEMPLATE_ID'].filter((k) => !env[k]?.trim());
      if (missing.length > 0) {
        throw new Error(
          `[messaging] MESSAGING_PROVIDER=msg91 requires ${missing.join(', ')}. ` +
          `Set them, or use MESSAGING_PROVIDER=mock.`
        );
      }
    },

    async sendOtp({ phone, otp }: OtpMessage) {
      const authKey = env.MSG91_AUTH_KEY!.trim();
      const templateId = env.MSG91_TEMPLATE_ID!.trim();

      // MSG91 wants a bare country-code-prefixed number ("919999999999"), not the "+91 ..."
      // form this app stores.
      const mobile = phone.replace(/\D/g, '');

      const url =
        `${MSG91_OTP_URL}?template_id=${encodeURIComponent(templateId)}` +
        `&mobile=${encodeURIComponent(mobile)}` +
        `&otp=${encodeURIComponent(otp)}`;

      let res: Response;
      try {
        res = await fetchImpl(url, {
          method: 'POST',
          // The key travels as a header, never in the URL, so it cannot end up in a log line
          // that quotes the request.
          headers: { authkey: authKey, 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch (err) {
        throw new MessageDeliveryError(
          'msg91',
          `network error contacting MSG91: ${(err as Error).message}`,
          { cause: err }
        );
      }

      const bodyText = await res.text().catch(() => '');

      if (!res.ok) {
        throw new MessageDeliveryError('msg91', `MSG91 returned HTTP ${res.status}: ${bodyText.slice(0, MAX_QUOTED_BODY)}`);
      }

      let body: { type?: string; message?: string; request_id?: string };
      try {
        body = JSON.parse(bodyText);
      } catch {
        throw new MessageDeliveryError('msg91', `MSG91 returned a non-JSON body: ${bodyText.slice(0, MAX_QUOTED_BODY)}`);
      }

      // MSG91 reports application-level failures with HTTP 200 and type:"error". Treating a
      // 2xx as success here would mean reporting delivery for a code that was never sent —
      // the exact defect this layer exists to prevent.
      if (body?.type !== 'success') {
        throw new MessageDeliveryError(
          'msg91',
          `MSG91 rejected the request: ${body?.message ?? bodyText.slice(0, MAX_QUOTED_BODY)}`
        );
      }

      return { ref: body.request_id };
    },
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && npx vitest run test/msg91.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 6: Typecheck and run the full suite**

Run: `cd backend && npx tsc --noEmit && npm test`
Expected: clean; 96 tests passing.

- [ ] **Step 7: Commit**

```bash
git add backend/src/messaging/providers/msg91.ts backend/test/msg91.test.ts
git commit -m "feat(messaging): implement MSG91 OTP adapter

Classifies non-2xx, error-shaped 200 bodies, malformed bodies and network
failures as MessageDeliveryError. MSG91 reports application errors under
HTTP 200, so a 2xx alone is not treated as delivery."
```

---

### Task 3: Config wiring and the module singleton

**Files:**
- Modify: `backend/src/config.ts`
- Create: `backend/src/messaging/index.ts`
- Test: `backend/test/messaging.test.ts` (append)

**Interfaces:**
- Consumes: `selectProvider` from `./registry`.
- Produces:
  - From `config.ts`: `MESSAGING_PROVIDER: string`, `MOCK_OTP: boolean`, `OTP_TTL_SECONDS: number`, `OTP_MAX_ATTEMPTS: number`
  - From `messaging/index.ts`: `sendOtp(msg: OtpMessage): Promise<{ ref?: string }>`, `getProvider(): MessagingProvider`, `setProviderForTests(p: MessagingProvider): MessagingProvider` (returns the previous provider so a test can restore it)

- [ ] **Step 1: Write the failing test**

Append to `backend/test/messaging.test.ts`:

```ts
import { MESSAGING_PROVIDER, MOCK_OTP, OTP_TTL_SECONDS, OTP_MAX_ATTEMPTS } from '../src/config';
import { sendOtp, getProvider, setProviderForTests } from '../src/messaging';

describe('messaging config', () => {
  it('defaults to the mock provider, which keeps the 123456 test login working', () => {
    expect(MESSAGING_PROVIDER).toBe('mock');
    expect(MOCK_OTP).toBe(true);
  });

  it('applies the documented OTP defaults', () => {
    expect(OTP_TTL_SECONDS).toBe(300);
    expect(OTP_MAX_ATTEMPTS).toBe(5);
  });
});

describe('messaging module singleton', () => {
  it('exposes the configured provider', () => {
    expect(getProvider().name).toBe('mock');
  });

  it('routes sendOtp through the active provider', async () => {
    const calls: string[] = [];
    const previous = setProviderForTests({
      name: 'spy',
      init() {},
      async sendOtp({ otp }) { calls.push(otp); return { ref: 'spy-ref' }; },
    });

    try {
      await expect(sendOtp({ phone: '+919999999999', otp: '111111', channel: 'whatsapp' }))
        .resolves.toEqual({ ref: 'spy-ref' });
      expect(calls).toEqual(['111111']);
    } finally {
      setProviderForTests(previous);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run test/messaging.test.ts`
Expected: FAIL — `MESSAGING_PROVIDER` is not exported from config; `../src/messaging` not found.

- [ ] **Step 3: Add the config values**

In `backend/src/config.ts`, add after the `RATE_LIMIT_ENABLED` export:

```ts
// Which messaging provider delivers OTPs. `mock` delivers nothing and is the default, so
// development and the test suite work with no configuration. The selected provider validates
// its own credentials at startup — see src/messaging/registry.ts.
export const MESSAGING_PROVIDER = process.env.MESSAGING_PROVIDER?.trim() || 'mock';

// True when OTPs are not actually delivered. Gates both the mock_otp field in the /otp/send
// response and the 123456 universal code. Deliberately keyed to the provider rather than to
// APP_ENV, so a production-configured staging deployment stays usable while still being able
// to switch to real delivery with one variable.
export const MOCK_OTP = MESSAGING_PROVIDER === 'mock';

function requirePositiveInt(name: string, raw: string | undefined, fallback: number): number {
  const trimmed = raw?.trim();
  if (!trimmed) return fallback;
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`[config] ${name} must be a positive integer, got "${raw}".`);
  }
  return parsed;
}

// How long an issued OTP stays valid, and how many wrong guesses it tolerates before it must
// be reissued. Enforced in routes/auth.ts.
export const OTP_TTL_SECONDS = requirePositiveInt('OTP_TTL_SECONDS', process.env.OTP_TTL_SECONDS, 300);
export const OTP_MAX_ATTEMPTS = requirePositiveInt('OTP_MAX_ATTEMPTS', process.env.OTP_MAX_ATTEMPTS, 5);
```

- [ ] **Step 4: Add the production warning**

In `backend/src/config.ts`, inside the existing `if (IS_PROD) { ... }` block, add alongside the `MOCK_PAYMENTS` warning:

```ts
  if (MOCK_OTP) {
    log.error(
      '[config] MESSAGING_PROVIDER=mock with APP_ENV=production — OTPs are not delivered and ' +
      'the 123456 universal code is active, so anyone can log in as any phone number. ' +
      'Set MESSAGING_PROVIDER to a real provider before taking real users.'
    );
  }
```

- [ ] **Step 5: Write the module singleton**

Create `backend/src/messaging/index.ts`:

```ts
import { MESSAGING_PROVIDER } from '../config';
import { selectProvider } from './registry';
import { MessagingProvider, OtpMessage } from './types';

// Resolved once at import time. A misconfigured provider throws here, which surfaces as a
// failed boot rather than a runtime error on the first login attempt.
let provider: MessagingProvider = selectProvider(MESSAGING_PROVIDER, process.env);

export function getProvider(): MessagingProvider {
  return provider;
}

/**
 * Test seam, mirroring rateLimiter's `opts.enabled`: lets the suite exercise delivery-failure
 * paths without standing up a real provider or a network. Returns the previous provider so a
 * test can restore it. Not used by application code.
 */
export function setProviderForTests(next: MessagingProvider): MessagingProvider {
  const previous = provider;
  provider = next;
  return previous;
}

export async function sendOtp(msg: OtpMessage): Promise<{ ref?: string }> {
  return provider.sendOtp(msg);
}

export { MessageDeliveryError } from './types';
export type { MessagingProvider, OtpMessage } from './types';
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd backend && npx vitest run test/messaging.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 7: Typecheck and run the full suite**

Run: `cd backend && npx tsc --noEmit && npm test`
Expected: clean; 100 tests passing.

- [ ] **Step 8: Commit**

```bash
git add backend/src/config.ts backend/src/messaging/index.ts backend/test/messaging.test.ts
git commit -m "feat(messaging): wire provider selection into config

MESSAGING_PROVIDER defaults to mock so dev and tests need no configuration.
MOCK_OTP is keyed to the provider rather than APP_ENV, and a mock provider
under APP_ENV=production now warns as loudly as MOCK_PAYMENTS does."
```

---

### Task 4: Route `/otp/send` through the provider

**Files:**
- Modify: `backend/src/routes/auth.ts:49-81`
- Test: `backend/test/otp.test.ts` (create)

**Interfaces:**
- Consumes: `sendOtp`, `setProviderForTests` from `../messaging`; `MOCK_OTP` from `../config`.
- Produces: no new exports. `/auth/otp/send` returns 502 `{ detail: 'Could not send OTP, please try again' }` on delivery failure.

- [ ] **Step 1: Write the failing test**

Create `backend/test/otp.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { setProviderForTests, getProvider, MessageDeliveryError } from '../src/messaging';
import { nextPhone } from './helpers';

const realProvider = getProvider();

afterEach(() => {
  setProviderForTests(realProvider);
});

function failingProvider(message: string) {
  return {
    name: 'failing',
    init() {},
    async sendOtp(): Promise<{ ref?: string }> {
      throw new MessageDeliveryError('failing', message);
    },
  };
}

describe('POST /auth/otp/send delivery', () => {
  it('returns the mock code while the mock provider is active', async () => {
    const res = await request(app).post('/api/auth/otp/send').send({ phone: nextPhone() });

    expect(res.status).toBe(200);
    expect(res.body.sent).toBe(true);
    expect(res.body.mock_otp).toMatch(/^\d{6}$/);
  });

  it('returns 502 and does not claim sent when delivery fails', async () => {
    setProviderForTests(failingProvider('provider exploded'));

    const res = await request(app).post('/api/auth/otp/send').send({ phone: nextPhone() });

    // The whole point of this layer: an undelivered code can never be reported as sent.
    expect(res.status).toBe(502);
    expect(res.body.sent).toBeUndefined();
    expect(res.body.detail).toBe('Could not send OTP, please try again');
  });

  it('does not leak the provider diagnostic to the client', async () => {
    setProviderForTests(failingProvider('authkey rejected: secret-abc'));

    const res = await request(app).post('/api/auth/otp/send').send({ phone: nextPhone() });

    expect(JSON.stringify(res.body)).not.toContain('secret-abc');
    expect(JSON.stringify(res.body)).not.toContain('authkey');
  });

  it('still requires a phone number', async () => {
    const res = await request(app).post('/api/auth/otp/send').send({});
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run test/otp.test.ts`
Expected: FAIL — the 502 test gets 200, because the route never calls a provider.

- [ ] **Step 3: Update the imports in `routes/auth.ts`**

Replace lines 6-7 of `backend/src/routes/auth.ts`:

```ts
import { authenticateToken, makeToken, verifyPassword, hashPassword, needsRehash } from '../middleware/auth';
import { log, ADMIN_USERNAME, ADMIN_PASSWORD, MOCK_OTP, OTP_TTL_SECONDS, OTP_MAX_ATTEMPTS } from '../config';
import { sendOtp } from '../messaging';
```

`IS_PROD` is no longer used by this file — remove it from the import to keep the typecheck clean. `OTP_TTL_SECONDS` and `OTP_MAX_ATTEMPTS` are consumed in Task 5.

- [ ] **Step 4: Replace the send handler body**

In `backend/src/routes/auth.ts`, replace everything from `const otp = Math.floor(...)` through the end of the `/otp/send` handler (currently lines 55-81) with:

```ts
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const now = new Date().toISOString();

  await db.insert(schema.otps)
    .values({ phone, otp, channel, createdAt: now })
    .onConflictDoUpdate({
      target: schema.otps.phone,
      set: { otp, channel, createdAt: now }
    });

  // Check if the user already exists
  const [user] = await db.select().from(schema.users).where(eq(schema.users.phone, phone)).limit(1);
  const exists = !!user;

  // Only a resolved send permits reporting `sent: true`. The previous version returned success
  // unconditionally, so in production every caller was told a code had been sent when nothing
  // had been dispatched at all.
  try {
    await sendOtp({ phone, otp, channel });
  } catch (err) {
    // The diagnostic can name the provider and quote its response, so it stays server-side.
    log.error(`[otp] delivery failed for ****${phone.slice(-4)}: ${(err as Error).message}`);
    return res.status(502).json({ detail: 'Could not send OTP, please try again' });
  }

  if (MOCK_OTP) {
    return res.json({
      sent: true,
      channel,
      mock_otp: otp,
      hint: "Mock mode: use the OTP shown or 123456",
      exists
    });
  }

  return res.json({ sent: true, channel, exists });
```

Note the mock provider already logs the code, so the old `log.info` line is intentionally gone.

- [ ] **Step 5: Update the OpenAPI 502 response**

In the `@openapi` block above `/auth/otp/send`, add under `responses:` after the `400` entry:

```yaml
 *       502:
 *         description: The messaging provider could not be reached or rejected the request
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd backend && npx vitest run test/otp.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 7: Typecheck and run the full suite**

Run: `cd backend && npx tsc --noEmit && npm test`
Expected: clean; 104 tests passing. `auth.test.ts` must still pass — `registerUser()` depends on the mock provider staying active by default.

- [ ] **Step 8: Commit**

```bash
git add backend/src/routes/auth.ts backend/test/otp.test.ts
git commit -m "fix(auth): only report sent:true when a provider confirms delivery

/otp/send previously returned {sent:true} unconditionally, so in production
it reported success for a code no provider had ever been asked to deliver.
Delivery failure is now 502, with the provider diagnostic logged server-side
and never returned to the caller."
```

---

### Task 5: OTP expiry and attempt cap

**Files:**
- Modify: `backend/src/schema.ts:16-21`
- Create: `backend/drizzle/0001_*.sql` (generated)
- Modify: `backend/src/routes/auth.ts` (`/otp/send` upsert and the `/otp/verify` handler)
- Test: `backend/test/otp.test.ts` (append)

**Interfaces:**
- Consumes: `OTP_TTL_SECONDS`, `OTP_MAX_ATTEMPTS`, `MOCK_OTP` from `../config`.
- Produces: `otps.attempts` column. `/auth/otp/verify` returns 429 on attempt-cap breach and 400 `OTP expired. Request a new one.` past the TTL.

- [ ] **Step 1: Write the failing test**

Append to `backend/test/otp.test.ts`:

```ts
import { db, schema } from '../src/db';
import { eq } from 'drizzle-orm';
import { OTP_MAX_ATTEMPTS } from '../src/config';

async function issueOtp(phone: string): Promise<string> {
  const res = await request(app).post('/api/auth/otp/send').send({ phone });
  return res.body.mock_otp as string;
}

describe('POST /auth/otp/verify expiry', () => {
  it('rejects a code older than the TTL', async () => {
    const phone = nextPhone();
    const otp = await issueOtp(phone);

    // Backdate the issue time past the 300s window.
    const stale = new Date(Date.now() - 301 * 1000).toISOString();
    await db.update(schema.otps).set({ createdAt: stale }).where(eq(schema.otps.phone, phone));

    const res = await request(app).post('/api/auth/otp/verify').send({ phone, otp, name: 'Expired User' });

    expect(res.status).toBe(400);
    expect(res.body.detail).toMatch(/expired/i);
  });

  it('accepts a code inside the TTL', async () => {
    const phone = nextPhone();
    const otp = await issueOtp(phone);

    const res = await request(app).post('/api/auth/otp/verify').send({ phone, otp, name: 'Fresh User' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
  });
});

describe('POST /auth/otp/verify attempt cap', () => {
  it('increments attempts on each wrong guess', async () => {
    const phone = nextPhone();
    await issueOtp(phone);

    await request(app).post('/api/auth/otp/verify').send({ phone, otp: '000000' });
    await request(app).post('/api/auth/otp/verify').send({ phone, otp: '000001' });

    const [rec] = await db.select().from(schema.otps).where(eq(schema.otps.phone, phone)).limit(1);
    expect(rec.attempts).toBe(2);
  });

  it('returns 429 once the cap is reached, even for the correct code', async () => {
    const phone = nextPhone();
    const otp = await issueOtp(phone);

    for (let i = 0; i < OTP_MAX_ATTEMPTS; i++) {
      await request(app).post('/api/auth/otp/verify').send({ phone, otp: '000000' });
    }

    const res = await request(app).post('/api/auth/otp/verify').send({ phone, otp, name: 'Brute User' });

    expect(res.status).toBe(429);
    expect(res.body.detail).toMatch(/too many/i);
  });

  it('resets the attempt counter when a new code is issued', async () => {
    const phone = nextPhone();
    await issueOtp(phone);
    await request(app).post('/api/auth/otp/verify').send({ phone, otp: '000000' });

    const fresh = await issueOtp(phone);
    const [rec] = await db.select().from(schema.otps).where(eq(schema.otps.phone, phone)).limit(1);
    expect(rec.attempts).toBe(0);

    const res = await request(app).post('/api/auth/otp/verify').send({ phone, otp: fresh, name: 'Reset User' });
    expect(res.status).toBe(200);
  });

  it('clears the row on successful verification', async () => {
    const phone = nextPhone();
    const otp = await issueOtp(phone);

    await request(app).post('/api/auth/otp/verify').send({ phone, otp, name: 'Clean User' });

    const rows = await db.select().from(schema.otps).where(eq(schema.otps.phone, phone));
    expect(rows).toHaveLength(0);
  });

  it('still honours the universal code with no stored row while mocking', async () => {
    // Regression guard for the ordering bug caught in spec review: the universal bypass must
    // precede the stored-row checks, because test helpers log in without calling /otp/send.
    const res = await request(app)
      .post('/api/auth/otp/verify')
      .send({ phone: nextPhone(), otp: '123456', name: 'Universal User' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run test/otp.test.ts`
Expected: FAIL — `rec.attempts` is undefined and the expiry test returns 200.

- [ ] **Step 3: Add the schema column**

In `backend/src/schema.ts`, replace the `otps` table definition:

```ts
export const otps = pgTable('otps', {
  phone: text('phone').primaryKey(),
  otp: text('otp').notNull(),
  channel: text('channel').notNull(),
  createdAt: text('created_at').notNull(),
  // Wrong guesses against the current code. Reset to 0 whenever a new code is issued.
  attempts: integer('attempts').notNull().default(0),
});
```

`integer` is already imported at the top of the file — no import change needed.

- [ ] **Step 4: Generate and apply the migration**

Run: `cd backend && npm run db:generate`
Expected: a new `drizzle/0001_*.sql` containing `ALTER TABLE "otps" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;`

Then rebuild the test database so the suite runs against the migrated schema:

Run: `cd backend && npm run test:setup`
Expected: migrations applied with no error.

- [ ] **Step 5: Reset attempts when a code is issued**

In `backend/src/routes/auth.ts`, update the `/otp/send` upsert so a reissued code starts with a clean counter:

```ts
  await db.insert(schema.otps)
    .values({ phone, otp, channel, createdAt: now, attempts: 0 })
    .onConflictDoUpdate({
      target: schema.otps.phone,
      set: { otp, channel, createdAt: now, attempts: 0 }
    });
```

- [ ] **Step 6: Replace the verify checks**

In `backend/src/routes/auth.ts`, replace the block that currently reads:

```ts
  const [otpRec] = await db.select().from(schema.otps).where(eq(schema.otps.phone, phone)).limit(1);
  const universalOk = (!IS_PROD) && otp === '123456';

  if (!universalOk && (!otpRec || otpRec.otp !== otp)) {
    return res.status(400).json({ detail: 'Invalid OTP' });
  }
```

with:

```ts
  const [otpRec] = await db.select().from(schema.otps).where(eq(schema.otps.phone, phone)).limit(1);

  // The universal bypass is evaluated first and deliberately: it has to work with no stored
  // row at all, which is how the test helpers and mock-mode logins work.
  const universalOk = MOCK_OTP && otp === '123456';

  if (!universalOk) {
    if (!otpRec) {
      return res.status(400).json({ detail: 'Invalid OTP' });
    }

    // Checked before expiry: someone who has burned the cap should be told to request a new
    // code regardless of whether the old one also aged out, since that is the actionable step.
    if (otpRec.attempts >= OTP_MAX_ATTEMPTS) {
      return res.status(429).json({ detail: 'Too many incorrect attempts. Request a new OTP.' });
    }

    const ageMs = Date.now() - new Date(otpRec.createdAt).getTime();
    if (ageMs > OTP_TTL_SECONDS * 1000) {
      return res.status(400).json({ detail: 'OTP expired. Request a new one.' });
    }

    if (otpRec.otp !== otp) {
      await db.update(schema.otps)
        .set({ attempts: otpRec.attempts + 1 })
        .where(eq(schema.otps.phone, phone));
      return res.status(400).json({ detail: 'Invalid OTP' });
    }
  }
```

- [ ] **Step 7: Update the OpenAPI block for verify**

In the `@openapi` block above `/auth/otp/verify`, add under `responses:` after the `400` entry:

```yaml
 *       429:
 *         description: Too many incorrect attempts against the current OTP
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `cd backend && npx vitest run test/otp.test.ts`
Expected: PASS, 11 tests (4 from Task 4 + 7 added here).

- [ ] **Step 9: Typecheck and run the full suite**

Run: `cd backend && npx tsc --noEmit && npm test`
Expected: clean; 111 tests passing.

- [ ] **Step 10: Commit**

```bash
git add backend/src/schema.ts backend/src/routes/auth.ts backend/drizzle backend/test/otp.test.ts
git commit -m "feat(auth): expire OTPs and cap wrong attempts

created_at was written but never read, so an issued code stayed valid
indefinitely. Adds a 5-minute TTL and a 5-attempt cap backed by a new
otps.attempts column. The universal mock code is evaluated before the
stored-row checks so it still works with no row present."
```

---

### Task 6: Documentation and environment examples

**Files:**
- Modify: `backend/.env.example`
- Modify: `.env.production.example`
- Modify: `README.md`
- Modify: `INVESTIGATION.md`

**Interfaces:**
- Consumes: nothing. Documentation only.
- Produces: nothing.

- [ ] **Step 1: Add the variables to `backend/.env.example`**

Append:

```bash
# --- Messaging / OTP delivery ---
# Which provider delivers login OTPs. `mock` delivers nothing and returns the code in the
# API response, which is what makes local development work with no accounts set up.
# Registered values: mock, msg91
MESSAGING_PROVIDER=mock

# Required when MESSAGING_PROVIDER=msg91. The server refuses to start without them.
# MSG91_AUTH_KEY=
# MSG91_TEMPLATE_ID=

# How long an issued OTP stays valid, and how many wrong guesses it tolerates before the
# caller must request a new one. Both optional; defaults shown.
OTP_TTL_SECONDS=300
OTP_MAX_ATTEMPTS=5
```

- [ ] **Step 2: Add the variables to `.env.production.example`**

Append, matching the file's existing commentary style:

```bash
# --- Messaging / OTP delivery ---
# `mock` means OTPs are NOT delivered and the 123456 universal code is accepted, so anyone
# can log in as any phone number. That is intentional for a pre-launch staging deployment and
# the server logs a loud error about it at startup — but it must not be left this way once
# real users exist. Set a real provider and supply its credentials below.
MESSAGING_PROVIDER=mock

# Required when MESSAGING_PROVIDER=msg91 (startup fails without them).
# Dashboard -> API -> Auth Key, and the approved OTP template's ID.
MSG91_AUTH_KEY=
MSG91_TEMPLATE_ID=

OTP_TTL_SECONDS=300
OTP_MAX_ATTEMPTS=5
```

- [ ] **Step 3: Document the layer in `README.md`**

Add a section after the existing Razorpay setup section:

```markdown
## OTP delivery

Login OTPs go out through a provider chosen by `MESSAGING_PROVIDER`. The default, `mock`,
delivers nothing and returns the code in the `/auth/otp/send` response — this is what lets
local development and the test suite run with no provider account.

Going live is a config change, not a code change:

    MESSAGING_PROVIDER=msg91
    MSG91_AUTH_KEY=...
    MSG91_TEMPLATE_ID=...

The selected provider validates its own credentials at startup, so a half-configured
provider stops the process rather than failing at a user's first login attempt. A mock
provider under `APP_ENV=production` logs a loud error, because it means the `123456`
universal code is live and anyone can log in as anyone.

`/auth/otp/send` returns **502** if the provider rejects the request or cannot be reached.
It reports `sent: true` only when the provider has confirmed handoff.

### Adding another provider

1. Create `backend/src/messaging/providers/<name>.ts` exporting a factory that returns a
   `MessagingProvider` — `init()` validates its env vars, `sendOtp()` delivers or throws
   `MessageDeliveryError`.
2. Add one entry to `PROVIDER_FACTORIES` in `backend/src/messaging/registry.ts`.
3. Set `MESSAGING_PROVIDER=<name>`.

Nothing else in the codebase learns the provider's name. See `backend/src/messaging/providers/msg91.ts`
for a worked example, including why a 2xx response is not by itself treated as delivery.
```

- [ ] **Step 4: Correct the stale "Known issues" paragraph in `README.md`**

The current text cites inoperative production rate limiting and `drizzle-kit push --force` as open problems. Both were fixed (INVESTIGATION §5.A, §5.B). Replace that paragraph with:

```markdown
This repo carries some rough edges from a rapid AI-assisted build. See **`INVESTIGATION.md`**
for the full audit — what's been fixed and the still-open table. The most important open item
is **§6.A: booking confirmation notifications are not implemented**, so a paid, confirmed
booking currently notifies neither the tourist nor the provider. Read that table before any
public deployment.
```

- [ ] **Step 5: Mark §6.B resolved in `INVESTIGATION.md`**

Change the §6.B heading from `⏳ OPEN` to `✅ FIXED` and append:

```markdown
**Resolved 2026-07-20:** `/auth/otp/verify` now enforces a 5-minute TTL (`OTP_TTL_SECONDS`)
and a 5-attempt cap (`OTP_MAX_ATTEMPTS`) backed by a new `otps.attempts` column, reset
whenever a code is reissued. The universal mock code is evaluated before the stored-row
checks so it still works with no row present.
```

Update §6.A to note the OTP half is resolved while the notification half stays open:

```markdown
**Partially resolved 2026-07-20:** the OTP half is closed — `src/messaging/` provides a
provider-agnostic delivery layer, `/auth/otp/send` returns 502 rather than a false
`sent: true`, and a half-configured provider fails at boot. **The booking-confirmation half
remains open** and must be closed before real bookings are taken.
```

- [ ] **Step 6: Verify the docs match the code**

Run: `cd backend && grep -n "MESSAGING_PROVIDER\|OTP_TTL_SECONDS\|OTP_MAX_ATTEMPTS" src/config.ts .env.example ../.env.production.example`
Expected: every variable named in the examples exists in `config.ts`.

- [ ] **Step 7: Full verification**

Run: `cd backend && npx tsc --noEmit && npm test`
Expected: clean; 111 tests passing.

- [ ] **Step 8: Commit**

```bash
git add backend/.env.example .env.production.example README.md INVESTIGATION.md
git commit -m "docs: document the messaging layer and refresh stale known-issues

Adds MESSAGING_PROVIDER and the OTP tuning vars to both env examples, a
README section covering provider swap and the 502 contract, and corrects
the known-issues paragraph, which still cited two problems fixed in 5.A
and 5.B while omitting the open notification gap."
```

---

## Final verification

- [ ] `cd backend && npx tsc --noEmit` — clean
- [ ] `cd backend && npm test` — 111 passing, 0 failing
- [ ] `cd backend && npx drizzle-kit generate` produces no new migration (schema and migrations in sync, which is what CI checks)
- [ ] `git log --oneline feat/otp-provider-layer` shows six implementation commits
- [ ] Boot check, mock path: `MESSAGING_PROVIDER=mock APP_ENV=development npx tsx src/server.ts` starts
- [ ] Boot check, misconfigured path: `MESSAGING_PROVIDER=msg91 APP_ENV=development npx tsx src/server.ts` **fails** with a message naming `MSG91_AUTH_KEY`
- [ ] Boot check, unknown provider: `MESSAGING_PROVIDER=nope APP_ENV=development npx tsx src/server.ts` **fails** listing `mock, msg91`

Do not push to `main`. Open a PR from `feat/otp-provider-layer` instead — a push to `main` triggers the VPS deploy.
