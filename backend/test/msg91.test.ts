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
    const fetchImpl = vi.fn().mockImplementation(() =>
      Promise.resolve(jsonResponse({ type: 'error', message: 'invalid template' }))
    );
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
