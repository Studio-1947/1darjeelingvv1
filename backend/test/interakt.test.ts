import { describe, it, expect, vi } from 'vitest';
import { createInteraktProvider, splitPhone } from '../src/messaging/providers/interakt';
import { MessageDeliveryError } from '../src/messaging/types';

const ENV = {
  INTERAKT_API_KEY: 'aW50ZXJha3Qtc2VjcmV0LWtleQ==',
  INTERAKT_OTP_TEMPLATE: 'aagan_otp',
};

const OTP_MSG = { phone: '+91 99999 99999', otp: '654321', channel: 'whatsapp' };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const accepted = (id = 'itk-1') => ({ result: true, id, message: 'Message sent successfully' });

describe('splitting a stored number into what Interakt wants', () => {
  // This is the sharp edge of the adapter: Interakt takes country code and subscriber number as
  // separate fields, and a wrong split does not error — it messages a real person somewhere else.
  it('splits the canonical +91 form both clients send', () => {
    expect(splitPhone('+919876543210', '+91')).toEqual({ countryCode: '+91', phoneNumber: '9876543210' });
  });

  it('tolerates the spacing people actually type', () => {
    expect(splitPhone('+91 98765 43210', '+91')).toEqual({ countryCode: '+91', phoneNumber: '9876543210' });
    expect(splitPhone('+91-98765-43210', '+91')).toEqual({ countryCode: '+91', phoneNumber: '9876543210' });
  });

  it('treats a bare national number as the configured country', () => {
    expect(splitPhone('9876543210', '+91')).toEqual({ countryCode: '+91', phoneNumber: '9876543210' });
  });

  it('drops the domestic trunk prefix', () => {
    expect(splitPhone('09876543210', '+91')).toEqual({ countryCode: '+91', phoneNumber: '9876543210' });
  });

  it('honours a different configured country code', () => {
    expect(splitPhone('+9771234567', '+977')).toEqual({ countryCode: '+977', phoneNumber: '1234567' });
  });

  it('accepts a code configured without its plus', () => {
    expect(splitPhone('+919876543210', '91')).toEqual({ countryCode: '+91', phoneNumber: '9876543210' });
  });

  it('REFUSES a foreign number rather than guessing where the country code ends', () => {
    // Guessing would send someone else's login code to a stranger. Failing is the safer answer.
    expect(() => splitPhone('+447700900123', '+91')).toThrow(MessageDeliveryError);
    expect(() => splitPhone('+447700900123', '+91')).toThrow(/cannot split/);
  });

  it('refuses something that is not a number at all', () => {
    expect(() => splitPhone('+notaphone', '+91')).toThrow(/not a phone number/);
    expect(() => splitPhone('abcdefghij', '+91')).toThrow(/not a phone number/);
  });
});

describe('interakt adapter — sending a code', () => {
  it('returns the provider reference on success', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(accepted('itk-99')));
    const provider = createInteraktProvider(ENV, fetchImpl as unknown as typeof fetch);

    await expect(provider.sendOtp(OTP_MSG)).resolves.toEqual({ ref: 'itk-99', channel: 'whatsapp' });
  });

  it('sends the code in BOTH bodyValues and buttonValues', async () => {
    // Same rule as going through Meta directly: the button is what fills the clipboard, and a
    // send without it is rejected.
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(accepted()));
    const provider = createInteraktProvider(ENV, fetchImpl as unknown as typeof fetch);

    await provider.sendOtp({ ...OTP_MSG, challengeId: 'challenge-123' });

    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body).toMatchObject({
      countryCode: '+91',
      phoneNumber: '9999999999',
      type: 'Template',
      callbackData: 'aangan:otp:challenge-123',
      template: {
        name: 'aagan_otp',
        languageCode: 'en',
        bodyValues: ['654321'],
        buttonValues: { '0': ['654321'] },
      },
    });
  });

  it('sends the key verbatim after Basic, not re-encoded', async () => {
    // Interakt's key is already base64. Encoding it again is the classic first failure and
    // presents as a flat 401 with nothing else to go on.
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(accepted()));
    const provider = createInteraktProvider(ENV, fetchImpl as unknown as typeof fetch);

    await provider.sendOtp({ ...OTP_MSG, challengeId: 'challenge-123' });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(init.headers.Authorization).toBe(`Basic ${ENV.INTERAKT_API_KEY}`);
    expect(url).toBe('https://api.interakt.ai/v1/public/message/');
    expect(url).not.toContain(ENV.INTERAKT_API_KEY);
  });

  it('uses the configured public Interakt API base URL', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(accepted()));
    const provider = createInteraktProvider(
      { ...ENV, INTERAKT_API_BASE_URL: 'https://interakt.example/v1/public/' },
      fetchImpl as unknown as typeof fetch,
    );

    await provider.sendOtp(OTP_MSG);

    expect(fetchImpl.mock.calls[0][0]).toBe('https://interakt.example/v1/public/message/');
  });

  it('refuses a code longer than WhatsApp allows', async () => {
    const fetchImpl = vi.fn();
    const provider = createInteraktProvider(ENV, fetchImpl as unknown as typeof fetch);

    await expect(provider.sendOtp({ ...OTP_MSG, otp: '1234567890123456' })).rejects.toThrow(/15 characters/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('interakt adapter — refusing to claim a send it cannot vouch for', () => {
  it('throws when Interakt answers 200 with result:false', async () => {
    // The same trap MSG91 sets with type:"error" — a 2xx alone is not an accepted message.
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ result: false, message: 'Template not found' })
    );
    const provider = createInteraktProvider(ENV, fetchImpl as unknown as typeof fetch);

    await expect(provider.sendOtp(OTP_MSG)).rejects.toThrow(/Template not found/);
  });

  it('throws on a non-2xx response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ message: 'Unauthorized' }, 401));
    const provider = createInteraktProvider(ENV, fetchImpl as unknown as typeof fetch);

    await expect(provider.sendOtp(OTP_MSG)).rejects.toThrow(/HTTP 401/);
  });

  it('throws on a non-JSON body', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('<html>gateway</html>', { status: 200 }));
    const provider = createInteraktProvider(ENV, fetchImpl as unknown as typeof fetch);

    await expect(provider.sendOtp(OTP_MSG)).rejects.toThrow(/non-JSON body/);
  });

  it('throws on a network failure', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ETIMEDOUT'));
    const provider = createInteraktProvider(ENV, fetchImpl as unknown as typeof fetch);

    await expect(provider.sendOtp(OTP_MSG)).rejects.toThrow(/network error/);
  });

  it('never leaks the API key in a thrown message', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('boom'));
    const provider = createInteraktProvider(ENV, fetchImpl as unknown as typeof fetch);

    await expect(provider.sendOtp(OTP_MSG)).rejects.not.toThrow(new RegExp(ENV.INTERAKT_API_KEY));
  });
});

describe('interakt adapter — booking notifications', () => {
  const NOTIFY_ENV = {
    ...ENV,
    INTERAKT_BOOKING_CONFIRMED_GUEST_TEMPLATE: 'booking_confirmed_guest',
    INTERAKT_BOOKING_CONFIRMED_HOST_TEMPLATE: 'booking_confirmed_host',
    INTERAKT_BOOKING_CANCELLED_GUEST_TEMPLATE: 'booking_cancelled_guest',
  };

  it('maps caller variables to positional bodyValues, in order', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(accepted('itk-n1')));
    const provider = createInteraktProvider(NOTIFY_ENV, fetchImpl as unknown as typeof fetch);

    const result = await provider.sendNotification({
      phone: '+919888877777',
      template: 'booking_confirmed_guest',
      vars: { name: 'Asha', listing: 'Peak View Homestay', stay: '2026-09-01 to 2026-09-03', host: 'Host: T, +91.' },
      text: 'ignored when a template is approved',
    });

    expect(result).toEqual({ ref: 'itk-n1', channel: 'whatsapp' });
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).template.bodyValues).toEqual([
      'Asha',
      'Peak View Homestay',
      '2026-09-01 to 2026-09-03',
      'Host: T, +91.',
    ]);
  });

  it('refuses a notification whose template is not configured', async () => {
    const fetchImpl = vi.fn();
    const provider = createInteraktProvider(ENV, fetchImpl as unknown as typeof fetch);

    await expect(
      provider.sendNotification({ phone: '+919888877777', template: 'booking_confirmed_host', vars: {}, text: 'x' })
    ).rejects.toThrow(/INTERAKT_BOOKING_CONFIRMED_HOST_TEMPLATE/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('interakt adapter — configuration', () => {
  it('rejects incomplete configuration at init', () => {
    const provider = createInteraktProvider({ INTERAKT_API_KEY: 'k' });
    expect(() => provider.init()).toThrow(/INTERAKT_OTP_TEMPLATE/);
  });

  it('treats a whitespace-only credential as missing', () => {
    const provider = createInteraktProvider({ ...ENV, INTERAKT_API_KEY: '   ' });
    expect(() => provider.init()).toThrow(/INTERAKT_API_KEY/);
  });

  it('accepts a complete configuration', () => {
    expect(() => createInteraktProvider(ENV).init()).not.toThrow();
  });

  it('rejects a country code that is not a dialling code', () => {
    const provider = createInteraktProvider({ ...ENV, INTERAKT_COUNTRY_CODE: 'India' });
    expect(() => provider.init()).toThrow(/dialling code/);
  });

  it('demands every booking template when NOTIFY_BOOKINGS is on', () => {
    const provider = createInteraktProvider({ ...ENV, NOTIFY_BOOKINGS: 'true' });
    expect(() => provider.init()).toThrow(/INTERAKT_BOOKING_CONFIRMED_GUEST_TEMPLATE/);
  });

  it('does not demand booking templates when notifications are off', () => {
    expect(() => createInteraktProvider({ ...ENV, NOTIFY_BOOKINGS: 'false' }).init()).not.toThrow();
  });
});
