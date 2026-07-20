import { describe, it, expect } from 'vitest';
import { selectProvider, PROVIDER_FACTORIES } from '../src/messaging/registry';
import { MessageDeliveryError } from '../src/messaging/types';
import { MESSAGING_PROVIDER, MOCK_OTP, OTP_TTL_SECONDS, OTP_MAX_ATTEMPTS } from '../src/config';
import { sendOtp, getProvider, setProviderForTests } from '../src/messaging';

describe('messaging registry', () => {
  it('selects the mock provider by name', () => {
    const provider = selectProvider('mock', {});
    expect(provider.name).toBe('mock');
  });

  it('throws for an unregistered provider name, listing what is available', () => {
    expect(() => selectProvider('carrier-pigeon', {})).toThrow(/not a registered provider/);
    expect(() => selectProvider('carrier-pigeon', {})).toThrow(/mock/);
  });

  it('registers both mock and msg91', () => {
    expect(Object.keys(PROVIDER_FACTORIES).sort()).toEqual(['mock', 'msg91']);
  });

  it('runs init() during selection so bad config fails at selection time', () => {
    // msg91 with no credentials must throw here, not at first send.
    expect(() => selectProvider('msg91', {})).toThrow(/MSG91_AUTH_KEY/);
  });

  it('does not validate providers that are not selected', () => {
    // Selecting mock must not care that MSG91 credentials are absent.
    expect(() => selectProvider('mock', {})).not.toThrow();
  });
});

describe('mock provider', () => {
  it('resolves without contacting anything', async () => {
    const provider = selectProvider('mock', {});
    await expect(provider.sendOtp({ phone: '+919999999999', otp: '123456', channel: 'whatsapp' }))
      .resolves.toEqual({});
  });
});

describe('MessageDeliveryError', () => {
  it('carries the provider name', () => {
    const err = new MessageDeliveryError('msg91', 'boom');
    expect(err.provider).toBe('msg91');
    expect(err.name).toBe('MessageDeliveryError');
    expect(err.message).toBe('boom');
  });
});

describe('messaging config', () => {
  it('defaults to the mock provider, which keeps the 123456 test login working', () => {
    expect(MESSAGING_PROVIDER).toBe('mock');
    expect(MOCK_OTP).toBe(true);
  });

  it('applies the documented OTP defaults', () => {
    expect(OTP_TTL_SECONDS).toBe(300);
    expect(OTP_MAX_ATTEMPTS).toBe(5);
  });
});

describe('messaging module singleton', () => {
  it('exposes the configured provider', () => {
    expect(getProvider().name).toBe('mock');
  });

  it('routes sendOtp through the active provider', async () => {
    const calls: string[] = [];
    const previous = setProviderForTests({
      name: 'spy',
      init() {},
      async sendOtp({ otp }) { calls.push(otp); return { ref: 'spy-ref' }; },
    });

    try {
      await expect(sendOtp({ phone: '+919999999999', otp: '111111', channel: 'whatsapp' }))
        .resolves.toEqual({ ref: 'spy-ref' });
      expect(calls).toEqual(['111111']);
    } finally {
      setProviderForTests(previous);
    }
  });
});
