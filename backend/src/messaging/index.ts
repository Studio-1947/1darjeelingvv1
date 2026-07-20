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
