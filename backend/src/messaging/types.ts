export interface OtpMessage {
  phone: string;
  otp: string;
  channel: string;
}

/**
 * The kinds of transactional message this app sends. Deliberately a closed set rather than free
 * text: Indian SMS providers deliver transactional messages only against a pre-approved DLT
 * template, so "what messages exist" is a fixed list that operations has to register, not
 * something a caller invents at runtime.
 */
export type NotificationTemplate =
  | 'booking_confirmed_guest'
  | 'booking_confirmed_host'
  | 'booking_cancelled_guest';

export interface NotificationMessage {
  phone: string;
  template: NotificationTemplate;
  /** Template variables, in the order the registered DLT template declares them. */
  vars: Record<string, string>;
  /**
   * The same message as plain text. Providers with an approved template ignore it; the mock
   * provider logs it, and it is what makes a log line readable without cross-referencing a
   * template ID.
   */
  text: string;
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

  /**
   * Delivers a transactional notification. Same contract as sendOtp: resolves only on confirmed
   * handoff, throws MessageDeliveryError otherwise — so a caller can never record "notified"
   * for a message that was not sent. This is the half of the messaging layer that booking
   * confirmations needed and did not have (INVESTIGATION.md §6.A).
   */
  sendNotification(msg: NotificationMessage): Promise<{ ref?: string; channel: string }>;
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
