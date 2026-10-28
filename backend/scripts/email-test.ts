/**
 * Checks the SMTP settings and sends one test email.
 *
 *   npm run email:test -- you@example.com
 *
 * Run it on the server (or locally with the same env) right after adding SMTP_HOST, SMTP_PORT,
 * SMTP_USER, SMTP_PASS and SMTP_FROM. It logs in first, so a wrong password fails here with the
 * mail server's own message, before a guest ever misses a booking email.
 */
import { NOTIFY_EMAIL, SMTP_FROM, SMTP_HOST, SMTP_PORT } from '../src/config';
import { renderEmail, sendEmail, verifyEmailTransport } from '../src/lib/email';

async function main() {
  const to = process.argv[2];
  if (!to) {
    console.error('Usage: npm run email:test -- you@example.com');
    process.exit(2);
  }
  console.log(`SMTP ${SMTP_HOST || '(not set)'}:${SMTP_PORT}, from ${SMTP_FROM}, email channel ${NOTIFY_EMAIL ? 'on' : 'off'}`);

  const login = await verifyEmailTransport();
  if (!login.ok) {
    console.error(`✗ Could not log in to the mail server: ${login.error}`);
    process.exit(1);
  }
  console.log('✓ Logged in to the mail server');

  const sent = await sendEmail({
    to,
    subject: 'aangan email test',
    text: 'If you can read this, aangan can send email.',
    html: renderEmail('Email works', ['If you can read this, aangan can send booking and report emails.'], 'Sent by npm run email:test.'),
  });
  if (!sent.ok) {
    console.error(`✗ Sending failed: ${sent.error}`);
    process.exit(1);
  }
  console.log(`✓ Sent to ${to}. Check the inbox (and spam).`);
  process.exit(0);
}

void main();
