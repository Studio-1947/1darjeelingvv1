import { describe, it, expect } from 'vitest';
import { ctaFor } from '@/components/listing-detail/cta';

describe('listing page button', () => {
  it('says "Request to book" on a homestay whose host accepts first', () => {
    expect(ctaFor('homestay', true).key).toBe('request_to_book');
  });
  it('keeps "Reserve" on a team-run homestay that confirms at once', () => {
    expect(ctaFor('homestay', false).key).toBe('book_now');
    expect(ctaFor('homestay').key).toBe('book_now');
  });
  it('says what the driver and guide buttons do: send a request (persona test 2026-11-09)', () => {
    expect(ctaFor('driver', true).key).toBe('request_driver');
    expect(ctaFor('guide', true).key).toBe('request_guide');
  });
});
