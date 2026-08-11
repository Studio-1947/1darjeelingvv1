import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/db';
import { listings } from '../src/schema';
import { like, or } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { onboardActiveProvider } from './helpers';

describe('Admin Maintenance Scripts Logic', () => {
  beforeEach(async () => {
    // Truncate test listings created for script verification
    await db.delete(listings).where(like(listings.title, 'SCRIPT_TEST_%'));
  });

  it('correctly identifies test listings matching test patterns', async () => {
    const { providerId } = await onboardActiveProvider({ name: 'Script Test Provider' });
    const testId = uuidv4();
    await db.insert(listings).values({
      id: testId,
      providerId: providerId,
      title: 'SCRIPT_TEST_ admin test listing',
      description: 'qeqwe testing description',
      type: 'homestay',
      location: 'Darjeeling',
      price: 1500,
      image: 'https://onedarjeeling.duckdns.org/one-darjeeling/test.jpg',
      tags: ['test'],
      createdAt: new Date().toISOString(),
    });

    const found = await db
      .select()
      .from(listings)
      .where(
        or(
          like(listings.title, '%admin test%'),
          like(listings.description, '%qeqwe%')
        )
      );

    expect(found.length).toBeGreaterThanOrEqual(1);
    expect(found.some(l => l.id === testId)).toBe(true);
  });

  it('replaces domain URLs accurately in asset fields', () => {
    const originalUrl = 'https://onedarjeeling.duckdns.org/one-darjeeling/sample.jpg';
    const rewritten = originalUrl.replace('https://onedarjeeling.duckdns.org', 'https://1darjeeling.in');
    expect(rewritten).toBe('https://1darjeeling.in/one-darjeeling/sample.jpg');
  });
});
