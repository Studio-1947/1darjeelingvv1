import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { registerUser, loginAdmin, onboardActiveProvider } from './helpers';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('admin: traveller profiles, feedback and comments', () => {
  it('lists the traveller profile and pass on users, and shows one traveller’s dashboard', async () => {
    const admin = await loginAdmin();
    const { token, user } = await registerUser({ name: 'Listed Lhakpa' });
    await request(app).patch('/api/users/me').set(auth(token)).send({ gender: 'male', traveller_type: 'backpacker', diet: 'non_veg' });

    const list = await request(app).get('/api/admin/users').set(auth(admin));
    const row = list.body.items.find((u: any) => u.id === user.id);
    expect(row).toMatchObject({ gender: 'male', travellerType: 'backpacker', diet: 'non_veg' });
    expect(row).toHaveProperty('supportExpiresAt');

    const dash = await request(app).get(`/api/admin/users/${user.id}/dashboard`).set(auth(admin));
    expect(dash.status).toBe(200);
    expect(dash.body).toHaveProperty('points');
    expect(dash.body.awards.length).toBeGreaterThan(0);

    expect((await request(app).get(`/api/admin/users/${user.id}/dashboard`).set(auth(token))).status).toBe(403);
  });

  it('lists traveller and host feedback and marks it resolved; the overview counts what is open', async () => {
    const admin = await loginAdmin();
    const { token } = await registerUser({ name: 'Feedback Fiona' });
    await request(app).post('/api/feedback/aangan').set(auth(token)).send({ message: 'Please add more homestays in Mirik', rating: 4 });
    const host = await onboardActiveProvider({ name: 'Feedback Host' });
    await request(app).post('/api/host-feedback').set(auth(host.token)).send({ message: 'The dashboard could show monthly totals' });

    const before = (await request(app).get('/api/admin/stats').set(auth(admin))).body.open_feedback;
    expect(before).toBeGreaterThanOrEqual(2);

    const travellers = await request(app).get('/api/feedback/aangan/all').set(auth(admin));
    const mine = travellers.body.items.find((f: any) => f.message.includes('Mirik'));
    expect(mine).toMatchObject({ rating: 4, status: 'open' });
    expect((await request(app).patch(`/api/feedback/aangan/${mine.id}`).set(auth(admin)).send({ status: 'resolved' })).body.status).toBe('resolved');
    expect((await request(app).patch(`/api/feedback/aangan/${mine.id}`).set(auth(token)).send({ status: 'resolved' })).status).toBe(403);

    const hosts = await request(app).get('/api/admin/host-feedback').set(auth(admin));
    const hostNote = hosts.body.items.find((f: any) => f.message.includes('monthly totals'));
    expect(hostNote.business.name).toBeTruthy();
    expect((await request(app).patch(`/api/admin/host-feedback/${hostNote.id}`).set(auth(admin)).send({ status: 'resolved' })).status).toBe(200);

    const after = (await request(app).get('/api/admin/stats').set(auth(admin))).body.open_feedback;
    expect(after).toBe(before - 2);
  });

  it('lists comments on host posts for moderation, and an admin can delete one', async () => {
    const admin = await loginAdmin();
    const host = await onboardActiveProvider({ name: 'Comment Host' });
    const post = await request(app).post('/api/posts').set(auth(host.token)).send({ body: 'Snow on Tiger Hill this morning.' });
    const { token } = await registerUser({ name: 'Commenter Chorten' });
    const c = await request(app).post(`/api/posts/${post.body.post.id}/comments`).set(auth(token)).send({ body: 'Spam spam spam' });

    const list = await request(app).get('/api/posts/admin/comments').set(auth(admin));
    const row = list.body.comments.find((x: any) => x.id === c.body.comment.id);
    expect(row).toMatchObject({ body: 'Spam spam spam', user: { name: 'Commenter Chorten' } });
    expect(row.post.excerpt).toContain('Tiger Hill');
    expect((await request(app).get('/api/posts/admin/comments').set(auth(token))).status).toBe(403);

    const del = await request(app).delete(`/api/posts/${row.post_id}/comments/${row.id}`).set(auth(admin));
    expect(del.status).toBe(200);
  });
});
