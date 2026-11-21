import { describe, expect, it } from 'vitest';
import { webLinkTarget } from './notificationLink';

describe('webLinkTarget', () => {
  it('maps screen keys to website pages', () => {
    expect(webLinkTarget('feed', false)).toEqual({ kind: 'route', to: '/feed' });
    expect(webLinkTarget('trips', false)).toEqual({ kind: 'route', to: '/my-trips' });
    expect(webLinkTarget('host_plan', true)).toEqual({ kind: 'route', to: '/provider/dashboard' });
    expect(webLinkTarget('home', true)).toEqual({ kind: 'route', to: '/provider/dashboard' });
    expect(webLinkTarget('home', false)).toEqual({ kind: 'route', to: '/' });
  });

  it('keeps our own addresses in the tab and opens others outside', () => {
    expect(webLinkTarget('https://aanganerp.in/events?x=1', false, 'https://aanganerp.in')).toEqual({ kind: 'route', to: '/events?x=1' });
    expect(webLinkTarget('https://example.org/a', false, 'https://aanganerp.in')).toEqual({ kind: 'external', href: 'https://example.org/a' });
  });

  it('ignores nothing, unknown keys and unsafe addresses', () => {
    expect(webLinkTarget(null, false)).toBeNull();
    expect(webLinkTarget('mystery', false)).toBeNull();
    expect(webLinkTarget('javascript:alert(1)', false)).toBeNull();
    expect(webLinkTarget('http://example.org', false)).toBeNull();
  });
});
