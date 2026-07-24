import { v4 as uuidv4 } from 'uuid';
import { db } from '../src/db';
import * as schema from '../src/schema';
import { eq, and } from 'drizzle-orm';
import { SEED_LISTINGS } from '../src/seed_data';

async function seed() {
  console.log('[seed] Seeding database with initial listings...');
  let inserted = 0;
  for (const item of SEED_LISTINGS) {
    const exists = await db.select()
      .from(schema.listings)
      .where(and(eq(schema.listings.title, item.title), eq(schema.listings.type, item.type)))
      .limit(1);

    if (exists.length > 0) {
      continue;
    }

    const doc = {
      id: uuidv4(),
      title: item.title,
      type: item.type,
      description: item.description,
      location: item.location,
      price: item.price,
      image: item.image,
      tags: item.tags,
      providerId: 'admin-seed-provider',
      extras: item.extras || {},
      createdAt: new Date().toISOString()
    };
    await db.insert(schema.listings).values(doc);
    inserted++;
  }
  console.log(`[seed] Done! Seeded ${inserted} listings (Total: ${SEED_LISTINGS.length}).`);
  process.exit(0);
}

seed().catch((err) => {
  console.error('[seed] Failed to seed database:', err);
  process.exit(1);
});
