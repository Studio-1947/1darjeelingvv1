import nodemailer from 'nodemailer';
import { MessagingProvider, NotificationMessage, OtpMessage } from '../types';
import { requireCredentials } from '../providerConfig';
import { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } from '../../config';
import { log } from '../../config';

const REQUEST_TIMEOUT_MS = 10_000;

/**
 * SMTP email provider via Nodemailer.
 *
 * Used for transactional emails (booking confirmations, receipts, etc.).
 * When SMTP_HOST is not set, the provider is not registered — so it cannot be
 * accidentally selected. Email sending is optional: if SMTP is not configured,
 * booking notifications still work via SMS/WhatsApp, just without the email copy.
 */
export function createSmtpProvider(env: NodeJS.ProcessEnv): MessagingProvider {
  // Build the transporter at init time so a bad config fails at boot.
  let transporter: nodemailer.Transporter;

  return {
    name: 'smtp',

    init() {
      requireCredentials('smtp', env, ['SMTP_HOST']);
      // Port 25 (plain), 465 (SSL), 587 (STARTTLS) — all handled by nodemailer.
      transporter = nodemailer.createTransport({
        host: env.SMTP_HOST!.trim(),
        port: parseInt(env.SMTP_PORT || '587', 10),
        secure: parseInt(env.SMTP_PORT || '587', 10) === 465,
        auth: env.SMTP_USER && env.SMTP_PASS
          ? { user: env.SMTP_USER!.trim(), pass: env.SMTP_PASS!.trim() }
          : undefined,
        connectionTimeout: REQUEST_TIMEOUT_MS,
        greetingTimeout: REQUEST_TIMEOUT_MS,
      });
    },

    /**
     * OTPs are delivered via SMS/WhatsApp, not email. This method exists to satisfy the
     * interface but is never called for OTP delivery — the OTP messaging provider (msg91,
     * whatsapp, etc.) handles that. If a caller does reach this path, it is a bug.
     */
    async sendOtp({ phone, otp, channel }: OtpMessage) {
      log.warn(`[smtp] sendOtp called for ****${phone.slice(-4)} — OTPs should be delivered via SMS/WhatsApp, not email`);
      return { channel: 'email' };
    },

    /**
     * Delivers a transactional email. The template text is provided by the caller,
     * so the SMTP provider does not need its own template system — it just sends.
     */
    async sendNotification({ phone, template, text, vars }: NotificationMessage) {
      const toEmail = vars.email || vars.to_email;
      if (!toEmail) {
        // No email address — this is expected when the user only has a phone number.
        // SMS/WhatsApp still sends the notification; email is best-effort.
        log.info(`[smtp] No email address for notification template=${template} phone=****${phone.slice(-4)} — skipping email`);
        return { channel: 'email_skipped' };
      }

      const subjectMap: Record<string, string> = {
        booking_confirmed_guest: 'Booking Confirmed — 1 Darjeeling',
        booking_confirmed_host: 'New Booking — 1 Darjeeling',
        booking_cancelled_guest: 'Booking Cancelled — 1 Darjeeling',
      };

      const subject = subjectMap[template] || `1 Darjeeling — ${template.replace(/_/g, ' ')}`;

      const htmlBody = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1a1a1a;">
          <div style="text-align: center; margin-bottom: 24px;">
            <h1 style="font-size: 20px; color: #2d5a27;">🏔 1 Darjeeling</h1>
          </div>
          <div style="background: #f8f9fa; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
            <pre style="font-family: inherit; white-space: pre-wrap; margin: 0; font-size: 14px; line-height: 1.6;">${text}</pre>
          </div>
          <p style="font-size: 12px; color: #999; text-align: center;">
            This is a transactional message from 1 Darjeeling. You are receiving this because you have an active booking.
          </p>
        </div>
      `;

      try {
        const info = await transporter.sendMail({
          from: SMTP_FROM,
          to: toEmail,
          subject,
          text,
          html: htmlBody,
        });

        log.info(`[smtp] Email sent: template=${template} to=****${toEmail.slice(-10)} messageId=${info.messageId}`);
        return { ref: info.messageId, channel: 'email' };
      } catch (err) {
        log.error(`[smtp] Email delivery failed: template=${template} to=****${toEmail.slice(-10)} error=${(err as Error).message}`);
        throw err;
      }
    },
  };
}
