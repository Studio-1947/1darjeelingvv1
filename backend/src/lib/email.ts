import nodemailer, { Transporter } from 'nodemailer';

import { NOTIFY_EMAIL, SMTP_FROM, SMTP_HOST, SMTP_PASS, SMTP_PORT, SMTP_USER, log } from '../config';

/**
 * Transactional email, as its own channel beside WhatsApp/SMS.
 *
 * Switched on by setting SMTP_HOST (and usually SMTP_USER/SMTP_PASS); nothing else changes when
 * the credentials arrive. Like the other senders it never throws: it runs after a booking or a
 * report has already been written, and a mail server being down must not undo that.
 */

const TIMEOUT_MS = 10_000;
let transporter: Transporter | null = null;

function transport(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      // 465 is implicit TLS; 587 and 25 upgrade with STARTTLS.
      secure: SMTP_PORT === 465,
      auth: SMTP_USER && SMTP_PASS ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
      connectionTimeout: TIMEOUT_MS,
      greetingTimeout: TIMEOUT_MS,
      socketTimeout: TIMEOUT_MS,
    });
  }
  return transporter;
}

export function emailEnabled(): boolean {
  return NOTIFY_EMAIL;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** The one layout every aangan email uses: a heading, the message, and why they got it. */
export function renderEmail(heading: string, lines: string[], footer: string): string {
  const body = lines.map((l) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.55;">${escapeHtml(l)}</p>`).join('');
  return `<!doctype html><html><body style="margin:0;background:#f4f1ea;padding:24px 12px;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;padding:28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#17211b;">
    <div style="font-size:20px;font-weight:800;color:#2c5e3b;margin-bottom:18px;">aangan</div>
    <h1 style="font-size:20px;margin:0 0 14px;">${escapeHtml(heading)}</h1>
    ${body}
    <p style="margin:22px 0 0;font-size:12px;color:#7a807c;">${escapeHtml(footer)}</p>
  </div>
</body></html>`;
}

export type EmailResult = { ok: true; id?: string } | { ok: false; error: string };

export async function sendEmail(msg: {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
}): Promise<EmailResult> {
  const to = (Array.isArray(msg.to) ? msg.to : [msg.to]).filter(Boolean);
  if (!NOTIFY_EMAIL) return { ok: false, error: 'email is off (SMTP_HOST not set)' };
  if (to.length === 0) return { ok: false, error: 'no email address' };
  try {
    const info = await transport().sendMail({ from: SMTP_FROM, to, subject: msg.subject, text: msg.text, html: msg.html });
    log.info(`[email] sent "${msg.subject}" to ${to.length} recipient(s) id=${info.messageId}`);
    return { ok: true, id: info.messageId };
  } catch (err) {
    const error = (err as Error)?.message || 'unknown email error';
    log.error(`[email] "${msg.subject}" failed: ${error}`);
    return { ok: false, error };
  }
}

/** Checks the SMTP login without sending anything. Used by `npm run email:test`. */
export async function verifyEmailTransport(): Promise<EmailResult> {
  if (!SMTP_HOST) return { ok: false, error: 'SMTP_HOST is not set' };
  try {
    await transport().verify();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error)?.message || 'SMTP check failed' };
  }
}
