import { describe, expect, it } from 'vitest';
import { noteTarget, webLinkTarget } from './notificationLink';

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

describe('noteTarget', () => {
  it('opens a host booking notice at that booking', () => {
    expect(noteTarget({ kind: 'booking_request', ref_id: 'b1' }, true)).toEqual({ kind: 'route', to: '/provider/dashboard?s=bookings&b=b1' });
    expect(noteTarget({ kind: 'booking_request', ref_id: 'b1' }, false)).toEqual({ kind: 'route', to: '/my-trips' });
  });
  it('prefers the screen the team chose, then the kind', () => {
    expect(noteTarget({ kind: 'booking_request', link: 'feed' }, true)).toEqual({ kind: 'route', to: '/feed' });
    expect(noteTarget({ kind: 'plan_joined', ref_id: 'p9' }, false)).toEqual({ kind: 'route', to: '/plan/p9' });
    expect(noteTarget({ kind: 'plan_cancelled', ref_id: 'p9' }, false)).toEqual({ kind: 'route', to: '/feed' });
    expect(noteTarget({ kind: 'announcement' }, false)).toBeNull();
  });
});
