/**
 * Sends one booking notification template to a phone, with example values, through the
 * configured provider (Interakt in production).
 *
 *   npm run notify:test -- +91XXXXXXXXXX booking_confirmed_guest
 *
 * Use it after the templates are approved and their names are in .env, BEFORE setting
 * NOTIFY_BOOKINGS=true: it proves each template is live and that every value lands in the right
 * slot. It does not need NOTIFY_BOOKINGS, and it touches no booking.
 *
 * The values are passed in the same order lib/notifications.ts builds them, which is the order the
 * templates in docs/WHATSAPP_TEMPLATES.md expect.
 */
import { MESSAGING_PROVIDER } from '../src/config';
import { sendNotification } from '../src/messaging';
import type { NotificationTemplate } from '../src/messaging';

export const EXAMPLES: Record<NotificationTemplate, { vars: Record<string, string>; text: string }> = {
  booking_confirmed_guest: {
    vars: {
      name: 'Asha Rai',
      listing: 'Peak View Homestay',
      stay: '2026-09-01 to 2026-09-03',
      host: 'Host: Tenzing Bhutia, +919876543210.',
    },
    text: 'Test: booking confirmed (guest)',
  },
  booking_confirmed_host: {
    vars: {
      listing: 'Peak View Homestay',
      guest: 'Asha Rai',
      guest_phone: '+919876543210',
      stay: '2026-09-01 to 2026-09-03',
      guests: '3',
    },
    text: 'Test: booking confirmed (host)',
  },
  booking_cancelled_guest: {
    vars: {
      name: 'Asha Rai',
      listing: 'Peak View Homestay',
      stay: '2026-09-01 to 2026-09-03',
      refund: 'Your payment has been refunded and will reach your account in 5-7 working days.',
    },
    text: 'Test: booking cancelled (guest)',
  },
};

async function main() {
  const [phone, template] = process.argv.slice(2);
  const names = Object.keys(EXAMPLES) as NotificationTemplate[];
  if (!phone || !template || !names.includes(template as NotificationTemplate)) {
    console.error(`Usage: npm run notify:test -- +91XXXXXXXXXX <${names.join('|')}>`);
    process.exit(2);
  }
  if (!/^\+\d{10,15}$/.test(phone)) {
    console.error('Give the phone with its country code, like +919800000000.');
    process.exit(2);
  }
  console.log(`Provider: ${MESSAGING_PROVIDER}. Sending "${template}" to ****${phone.slice(-4)}…`);
  if (MESSAGING_PROVIDER === 'mock') {
    console.log('(MESSAGING_PROVIDER=mock: nothing is actually delivered.)');
  }

  const example = EXAMPLES[template as NotificationTemplate];
  try {
    const result = await sendNotification({ phone, template: template as NotificationTemplate, vars: example.vars, text: example.text });
    console.log(`✓ Accepted by ${MESSAGING_PROVIDER} (${result.channel}${result.ref ? `, ref ${result.ref}` : ''}). Check WhatsApp on that phone.`);
    process.exit(0);
  } catch (err) {
    console.error(`✗ Not sent: ${(err as Error).message}`);
    process.exit(1);
  }
}

// Only when run as a script, so a test can import EXAMPLES without sending anything.
if (require.main === module) void main();
