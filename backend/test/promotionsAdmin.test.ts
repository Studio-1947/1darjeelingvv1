import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { loginAdmin, registerUser } from './helpers';

const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
const card = { tag: 'NEW', title: 'Tea garden tours', subtitle: 'Live tasting', image: 'https://img.example/t.jpg', link: '/category/spot' };

describe('promotions admin list', () => {
  it('shows an admin every card, switched off ones too, while the public list shows only active ones', async () => {
    const admin = await loginAdmin();
    const on = (await request(app).post('/api/promotions').set(auth(admin)).send({ ...card, active: true })).body.item;
    const off = (await request(app).post('/api/promotions').set(auth(admin)).send({ ...card, title: 'Old offer', active: false })).body.item;

    const all = await request(app).get('/api/promotions/all').set(auth(admin));
    expect(all.status).toBe(200);
    const ids = all.body.items.map((p: { id: string }) => p.id);
    expect(ids).toEqual(expect.arrayContaining([on.id, off.id]));

    const pub = await request(app).get('/api/promotions');
    const pubIds = pub.body.items.map((p: { id: string }) => p.id);
    expect(pubIds).toContain(on.id);
    expect(pubIds).not.toContain(off.id);
  });

  it('keeps the full list from non-admins', async () => {
    const { token } = await registerUser({ name: 'Curious Guest' });
    expect((await request(app).get('/api/promotions/all').set(auth(token))).status).toBe(403);
    expect((await request(app).get('/api/promotions/all')).status).toBe(401);
  });
});
