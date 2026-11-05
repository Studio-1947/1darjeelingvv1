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
  it('leaves drivers and guides as they were (they already read as requests)', () => {
    expect(ctaFor('driver', true).key).toBe('talk_to_driver');
    expect(ctaFor('guide', true).key).toBe('request_guide');
  });
});
