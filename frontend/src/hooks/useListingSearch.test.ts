import { describe, expect, it } from 'vitest';
import { searchable } from './useListingSearch';

describe('searchable', () => {
  it('asks the server from two Latin letters, or one in Devanagari or Bengali', () => {
    expect(searchable('')).toBe(false);
    expect(searchable('a')).toBe(false);
    expect(searchable('gh')).toBe(true);
    expect(searchable('घ')).toBe(true);
    expect(searchable('ঘ')).toBe(true);
    // A lone symbol reads as nothing on the server.
    expect(searchable('₹')).toBe(false);
    expect(searchable('’')).toBe(false);
  });
});
