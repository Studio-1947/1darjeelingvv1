import { afterEach, describe, expect, it } from 'vitest';
import { scrubQuery, trackingRefused } from './searchLog';

describe('search log', () => {
  afterEach(() => {
    Object.defineProperty(navigator, 'doNotTrack', { value: null, configurable: true });
    Object.defineProperty(navigator, 'globalPrivacyControl', { value: undefined, configurable: true });
  });

  it('removes phone numbers, long numbers and email addresses, as the server does', () => {
    expect(scrubQuery('taxi 98000 12345')).toBe('taxi');
    expect(scrubQuery('+91-98000-12345')).toBe('');
    expect(scrubQuery('me@x.in homestay under 2000')).toBe('homestay under 2000');
  });

  it('sends nothing when the browser asks not to be tracked', () => {
    expect(trackingRefused()).toBe(false);
    Object.defineProperty(navigator, 'doNotTrack', { value: '1', configurable: true });
    expect(trackingRefused()).toBe(true);
    Object.defineProperty(navigator, 'doNotTrack', { value: null, configurable: true });
    Object.defineProperty(navigator, 'globalPrivacyControl', { value: true, configurable: true });
    expect(trackingRefused()).toBe(true);
  });
});
