import { describe, it, expect } from 'vitest';

import { db, pool, schema } from '../src/db';
import { findReferencedKeys } from '../src/lib/storageRefs';
import { registerUser } from './helpers';

const PUB = 'https://aanganerp.in/one-darjeeling/';

describe('which stored files are still in use', () => {
  it('counts a file used wherever the database mentions it, not only the main photo columns', async () => {
    const { user } = await registerUser({ name: 'Host' });
    await db.insert(schema.listings).values({
      id: 'l-1', title: 'Stay', type: 'homestay', description: 'x', location: 'Darjeeling', price: 0,
      image: PUB + 'main-photo-1111.jpg', tags: [], providerId: 'p-1',
      // The gallery is what the first clean-up missed and deleted on 2026-11-09.
      extras: { images: [PUB + 'gallery-photo-2222.png'], rooms: [{ name: 'Deluxe', photo: PUB + 'room-photo-3333.webp' }] },
      createdAt: new Date().toISOString(),
    });
    await pool.query(`UPDATE users SET avatar = $1 WHERE id = $2`, [PUB + 'avatar-photo-4444.jpg', user.id]);

    const keys = [
      'main-photo-1111.jpg', 'gallery-photo-2222.png', 'room-photo-3333.webp', 'avatar-photo-4444.jpg',
      'kyc/folder/gallery-photo-2222.png', // same file name under a folder: kept too
      'nobody-uses-this-5555.jpg',
      'x.jpg', // too short to search for safely: always kept
    ];
    const used = await findReferencedKeys(pool, keys);
    expect([...used].sort()).toEqual(keys.filter((k) => k !== 'nobody-uses-this-5555.jpg').sort());
  });

  it('finds nothing in use once the rows are gone', async () => {
    expect([...(await findReferencedKeys(pool, ['main-photo-1111.jpg']))]).toEqual([]);
  });
});
