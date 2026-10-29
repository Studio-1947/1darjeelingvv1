import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { registerUser, onboardActiveProvider, createListing, loginAdmin } from './helpers';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('admin moderation', () => {
  it('shows what each report points at, who sent it, and how many open reports the item has', async () => {
    const { token: host } = await onboardActiveProvider({ name: 'Loud Host' });
    const post = (await request(app).post('/api/posts').set(auth(host)).send({ body: 'Cheapest rooms in town!!!' })).body.post;
    const listing = await createListing({ title: 'Mystery Lodge' });
    const { token: a } = await registerUser({ name: 'Reporter A' });
    const { token: b } = await registerUser({ name: 'Reporter B' });

    await request(app).post('/api/reports').set(auth(a)).send({ target_type: 'post', target_id: post.id, reason: 'spam' });
    await request(app).post('/api/reports').set(auth(b)).send({ target_type: 'post', target_id: post.id, reason: 'fake' });
    await request(app).post('/api/reports').set(auth(a)).send({ target_type: 'listing', target_id: listing.id, reason: 'fake' });

    const admin = await loginAdmin();
    const res = await request(app).get('/api/admin/reports').set(auth(admin));
    expect(res.status).toBe(200);
    const postReports = res.body.reports.filter((r: any) => r.target_type === 'post');
    expect(postReports).toHaveLength(2);
    expect(postReports[0].target).toMatchObject({ text: 'Cheapest rooms in town!!!', author_name: "Loud Host's Business", hidden: false });
    expect(postReports[0].open_reports_on_target).toBe(2);
    expect(postReports.map((r: any) => r.reporter_name).sort()).toEqual(['Reporter A', 'Reporter B']);
    const listingReport = res.body.reports.find((r: any) => r.target_type === 'listing');
    expect(listingReport.target).toMatchObject({ title: 'Mystery Lodge' });
  });

  it('resolves every open report on the same item with ?all=1', async () => {
    const { token: host } = await onboardActiveProvider({ name: 'Twice Reported' });
    const post = (await request(app).post('/api/posts').set(auth(host)).send({ body: 'Hello' })).body.post;
    for (const name of ['R1', 'R2']) {
      const { token } = await registerUser({ name });
      await request(app).post('/api/reports').set(auth(token)).send({ target_type: 'post', target_id: post.id, reason: 'spam' });
    }
    const admin = await loginAdmin();
    const [first] = (await request(app).get('/api/admin/reports').set(auth(admin))).body.reports;
    const resolved = await request(app).post(`/api/admin/reports/${first.id}/resolve?all=1`).set(auth(admin));
    expect(resolved.body.resolved).toBe(2);
    expect((await request(app).get('/api/admin/reports').set(auth(admin))).body.reports).toHaveLength(0);
    expect((await request(app).get('/api/admin/reports?status=resolved').set(auth(admin))).body.reports).toHaveLength(2);
  });

  it('shows a deleted item as gone', async () => {
    const { token: host } = await onboardActiveProvider({ name: 'Deleting Host' });
    const post = (await request(app).post('/api/posts').set(auth(host)).send({ body: 'Soon gone' })).body.post;
    const { token } = await registerUser({ name: 'Early Reporter' });
    await request(app).post('/api/reports').set(auth(token)).send({ target_type: 'post', target_id: post.id, reason: 'other' });
    await request(app).delete(`/api/posts/${post.id}`).set(auth(host));
    const admin = await loginAdmin();
    const [report] = (await request(app).get('/api/admin/reports').set(auth(admin))).body.reports;
    expect(report.target).toBeNull();
  });

  it('lets an admin delete any review, and nobody else delete someone else’s', async () => {
    const listing = await createListing({ title: 'Reviewed Place' });
    const { token: author } = await registerUser({ name: 'Rude Reviewer' });
    const review = (await request(app).post('/api/reviews').set(auth(author)).send({ listing_id: listing.id, rating: 1, comment: 'Awful' })).body.review;
    const { token: stranger } = await registerUser({ name: 'Stranger' });
    expect((await request(app).delete(`/api/reviews/${review.id}`).set(auth(stranger))).status).toBe(404);
    const admin = await loginAdmin();
    expect((await request(app).delete(`/api/reviews/${review.id}`).set(auth(admin))).status).toBe(200);
    expect((await request(app).get(`/api/reviews/listing/${listing.id}`)).body.summary.count).toBe(0);
  });

  it('lists every post for an admin, hidden ones too, and keeps it from everyone else', async () => {
    const { token: host } = await onboardActiveProvider({ name: 'Listed Host' });
    const p1 = (await request(app).post('/api/posts').set(auth(host)).send({ body: 'Visible' })).body.post;
    const p2 = (await request(app).post('/api/posts').set(auth(host)).send({ body: 'To hide' })).body.post;
    const admin = await loginAdmin();
    await request(app).post(`/api/posts/${p2.id}/hide`).set(auth(admin)).send({ reason: 'Misleading' });

    const all = await request(app).get('/api/posts/admin/list').set(auth(admin));
    expect(all.status).toBe(200);
    expect(all.body.posts.map((p: any) => p.id).sort()).toEqual([p1.id, p2.id].sort());
    const hidden = await request(app).get('/api/posts/admin/list?hidden=1').set(auth(admin));
    expect(hidden.body.posts).toHaveLength(1);
    expect(hidden.body.posts[0]).toMatchObject({ id: p2.id, hidden: true, hidden_reason: 'Misleading' });

    expect((await request(app).get('/api/posts/admin/list').set(auth(host))).status).toBe(403);
  });
});
