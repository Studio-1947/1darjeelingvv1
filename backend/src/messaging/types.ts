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
   * failing in front of a user. Throws on incomplete configuration.
   */
  init(): void;

  /**
   * Resolves only on confirmed handoff to the provider. Throws MessageDeliveryError on
   * any failure — a resolved promise is what allows the route to report `sent: true`.
   * The returned `channel` is the channel actually used for delivery, which may differ
   * from the one requested in `msg` — the caller must report what happened, not what was
   * asked for.
   */
  sendOtp(msg: OtpMessage): Promise<{ ref?: string; channel: string }>;
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
