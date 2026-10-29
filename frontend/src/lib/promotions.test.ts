import { describe, it, expect } from 'vitest';
import { webPathFor } from './promotions';

describe('webPathFor', () => {
  it('turns the app category paths admins type into the site pages', () => {
    expect(webPathFor('/category/homestay')).toBe('/homestays');
    expect(webPathFor('/category/driver')).toBe('/drivers');
    expect(webPathFor('/category/spot')).toBe('/spots');
  });

  it('keeps other in-app paths, and never follows anything that is not a path', () => {
    expect(webPathFor('/feed')).toBe('/feed');
    expect(webPathFor('https://evil.example')).toBe('/');
  });
});
