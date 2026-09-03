import { describe, it, expect, vi } from 'vitest';
import { createWhatsAppProvider } from '../src/messaging/providers/whatsapp';
import { MessageDeliveryError } from '../src/messaging/types';

const ENV = {
  WHATSAPP_ACCESS_TOKEN: 'EAAsystemusertoken_that_is_long_enough_to_not_look_temporary_0123456789012345678901234567890123456789',
  WHATSAPP_PHONE_NUMBER_ID: '1234567890',
  WHATSAPP_OTP_TEMPLATE: 'one_darjeeling_login',
};

const OTP_MSG = { phone: '+91 99999 99999', otp: '654321', channel: 'whatsapp' };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const sent = (id = 'wamid.ABC') => ({ messaging_product: 'whatsapp', messages: [{ id }] });

describe('whatsapp adapter — sending a code', () => {
  it('returns the message id on success', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(sent('wamid.XYZ')));
    const provider = createWhatsAppProvider(ENV, fetchImpl as unknown as typeof fetch);

    await expect(provider.sendOtp(OTP_MSG)).resolves.toEqual({ ref: 'wamid.XYZ', channel: 'whatsapp' });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('puts the code in BOTH the body and the OTP button', async () => {
    // Meta rejects an authentication send that omits the button component, and the button is
    // what fills the clipboard on "Copy code". Getting this wrong surfaces as a template error
    // pointing at the wrong thing, so it is worth pinning.
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(sent()));
    const provider = createWhatsAppProvider(ENV, fetchImpl as unknown as typeof fetch);

    await provider.sendOtp(OTP_MSG);

    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.template.name).toBe('one_darjeeling_login');
    expect(body.template.components).toEqual([
      { type: 'body', parameters: [{ type: 'text', text: '654321' }] },
      { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: '654321' }] },
    ]);
  });

  it('normalises the phone to bare digits and hits the right phone number id', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(sent()));
    const provider = createWhatsAppProvider(ENV, fetchImpl as unknown as typeof fetch);

    await provider.sendOtp(OTP_MSG);

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://graph.facebook.com/v21.0/1234567890/messages');
    expect(init.method).toBe('POST');
    // "+91 99999 99999" must reach Meta as "919999999999".
    expect(JSON.parse(init.body).to).toBe('919999999999');
  });

  it('sends the token as a Bearer header, never in the URL', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(sent()));
    const provider = createWhatsAppProvider(ENV, fetchImpl as unknown as typeof fetch);

    await provider.sendOtp(OTP_MSG);

    const [url, init] = fetchImpl.mock.calls[0];
    expect(init.headers.Authorization).toBe(`Bearer ${ENV.WHATSAPP_ACCESS_TOKEN}`);
    expect(url).not.toContain(ENV.WHATSAPP_ACCESS_TOKEN);
  });

  it('honours a pinned API version', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(sent()));
    const provider = createWhatsAppProvider(
      { ...ENV, WHATSAPP_API_VERSION: 'v23.0' },
      fetchImpl as unknown as typeof fetch
    );

    await provider.sendOtp(OTP_MSG);

    expect(fetchImpl.mock.calls[0][0]).toContain('/v23.0/');
  });
});

describe('whatsapp adapter — refusing to claim a delivery it cannot vouch for', () => {
  it('throws on a Graph error body', async () => {
    // mockImplementation, not mockResolvedValue: a Response body can only be read once, so a
    // single shared Response would come back already-consumed on the second send and fail as a
    // parse error instead of the thing under test.
    const fetchImpl = vi.fn().mockImplementation(async () =>
      jsonResponse({ error: { message: 'Template name does not exist', code: 132001 } }, 400)
    );
    const provider = createWhatsAppProvider(ENV, fetchImpl as unknown as typeof fetch);

    await expect(provider.sendOtp(OTP_MSG)).rejects.toThrow(MessageDeliveryError);
    await expect(provider.sendOtp(OTP_MSG)).rejects.toThrow(/Template name does not exist/);
  });

  it('surfaces the Graph error code, which is the whole diagnostic', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ error: { message: 'Recipient not opted in', code: 131047, error_subcode: 12 } }, 400)
    );
    const provider = createWhatsAppProvider(ENV, fetchImpl as unknown as typeof fetch);

    await expect(provider.sendOtp(OTP_MSG)).rejects.toThrow(/code 131047\/12/);
  });

  it('throws when Graph answers 200 with an error object', async () => {
    // Graph does this, and treating a 2xx alone as delivery is exactly the defect this layer
    // exists to prevent.
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ error: { message: 'nope', code: 1 } }, 200));
    const provider = createWhatsAppProvider(ENV, fetchImpl as unknown as typeof fetch);

    await expect(provider.sendOtp(OTP_MSG)).rejects.toThrow(/nope/);
  });

  it('throws when Graph answers 200 with no message id', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ messaging_product: 'whatsapp', messages: [] }));
    const provider = createWhatsAppProvider(ENV, fetchImpl as unknown as typeof fetch);

    await expect(provider.sendOtp(OTP_MSG)).rejects.toThrow(/no message id/);
  });

  it('throws on a non-JSON body', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('<html>502 Bad Gateway</html>', { status: 502 }));
    const provider = createWhatsAppProvider(ENV, fetchImpl as unknown as typeof fetch);

    await expect(provider.sendOtp(OTP_MSG)).rejects.toThrow(/non-JSON body/);
  });

  it('throws on a network failure', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNRESET'));
    const provider = createWhatsAppProvider(ENV, fetchImpl as unknown as typeof fetch);

    await expect(provider.sendOtp(OTP_MSG)).rejects.toThrow(/network error/);
  });

  it('never leaks the access token in a thrown message', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('boom'));
    const provider = createWhatsAppProvider(ENV, fetchImpl as unknown as typeof fetch);

    await expect(provider.sendOtp(OTP_MSG)).rejects.not.toThrow(
      new RegExp(ENV.WHATSAPP_ACCESS_TOKEN.slice(0, 20))
    );
  });
});

describe('whatsapp adapter — booking notifications', () => {
  const NOTIFY_ENV = {
    ...ENV,
    WHATSAPP_BOOKING_CONFIRMED_GUEST_TEMPLATE: 'booking_confirmed_guest',
    WHATSAPP_BOOKING_CONFIRMED_HOST_TEMPLATE: 'booking_confirmed_host',
    WHATSAPP_BOOKING_CANCELLED_GUEST_TEMPLATE: 'booking_cancelled_guest',
  };

  it('maps the caller variables to positional placeholders, in order', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(sent('wamid.N1')));
    const provider = createWhatsAppProvider(NOTIFY_ENV, fetchImpl as unknown as typeof fetch);

    const result = await provider.sendNotification({
      phone: '+919888877777',
      template: 'booking_confirmed_guest',
      vars: { name: 'Asha', listing: 'Peak View Homestay', dates: '2026-09-01 to 2026-09-03' },
      text: 'ignored by a provider with an approved template',
    });

    expect(result).toEqual({ ref: 'wamid.N1', channel: 'whatsapp' });
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.template.name).toBe('booking_confirmed_guest');
    expect(body.template.components).toEqual([
      {
        type: 'body',
        parameters: [
          { type: 'text', text: 'Asha' },
          { type: 'text', text: 'Peak View Homestay' },
          { type: 'text', text: '2026-09-01 to 2026-09-03' },
        ],
      },
    ]);
  });

  it('sends no body component when the template takes no variables', async () => {
    // Graph rejects an empty parameters array rather than ignoring it.
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(sent()));
    const provider = createWhatsAppProvider(NOTIFY_ENV, fetchImpl as unknown as typeof fetch);

    await provider.sendNotification({
      phone: '+919888877777',
      template: 'booking_cancelled_guest',
      vars: {},
      text: 'x',
    });

    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).template.components).toEqual([]);
  });

  it('refuses to send a notification whose template is not configured', async () => {
    const fetchImpl = vi.fn();
    const provider = createWhatsAppProvider(ENV, fetchImpl as unknown as typeof fetch);

    await expect(
      provider.sendNotification({
        phone: '+919888877777',
        template: 'booking_confirmed_host',
        vars: {},
        text: 'x',
      })
    ).rejects.toThrow(/WHATSAPP_BOOKING_CONFIRMED_HOST_TEMPLATE/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('whatsapp adapter — configuration', () => {
  it('rejects incomplete configuration at init', () => {
    const provider = createWhatsAppProvider({ WHATSAPP_ACCESS_TOKEN: 'tok' });
    expect(() => provider.init()).toThrow(/WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_OTP_TEMPLATE/);
  });

  it('treats a whitespace-only credential as missing', () => {
    const provider = createWhatsAppProvider({ ...ENV, WHATSAPP_PHONE_NUMBER_ID: '   ' });
    expect(() => provider.init()).toThrow(/WHATSAPP_PHONE_NUMBER_ID/);
  });

  it('accepts a complete configuration', () => {
    const provider = createWhatsAppProvider(ENV);
    expect(() => provider.init()).not.toThrow();
  });

  it('demands every booking template when NOTIFY_BOOKINGS is on', () => {
    // Half-configured must fail at boot, not at the first confirmed booking.
    const provider = createWhatsAppProvider({ ...ENV, NOTIFY_BOOKINGS: 'true' });
    expect(() => provider.init()).toThrow(/WHATSAPP_BOOKING_CONFIRMED_GUEST_TEMPLATE/);
  });

  it('does not demand booking templates when notifications are off', () => {
    const provider = createWhatsAppProvider({ ...ENV, NOTIFY_BOOKINGS: 'false' });
    expect(() => provider.init()).not.toThrow();
  });

  it('warns, but still boots, on a token that looks short-lived', () => {
    // The dashboard's temporary token expires in ~24h and presents as "login stopped working
    // overnight". A warning is right; refusing to boot on a prefix heuristic is not.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const provider = createWhatsAppProvider({ ...ENV, WHATSAPP_ACCESS_TOKEN: 'EAAshortlivedtoken' });
      expect(() => provider.init()).not.toThrow();
      expect(warn).toHaveBeenCalledWith(expect.stringMatching(/short-lived/));
    } finally {
      warn.mockRestore();
    }
  });
});
