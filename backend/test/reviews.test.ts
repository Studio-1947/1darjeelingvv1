import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { registerUser, createListing } from './helpers';

describe('reviews', () => {
  it('requires auth to post a review', async () => {
    const listing = await createListing();
    const res = await request(app).post('/api/reviews').send({ listing_id: listing.id, rating: 5 });
    expect(res.status).toBe(401);
  });

  it('rejects an out-of-range rating', async () => {
    const { token } = await registerUser({ name: 'Bad Rater' });
    const listing = await createListing();
    for (const rating of [0, 6, 3.5]) {
      const res = await request(app).post('/api/reviews')
        .set('Authorization', `Bearer ${token}`)
        .send({ listing_id: listing.id, rating });
      expect(res.status).toBe(400);
    }
  });

  it('404s a review for a listing that does not exist', async () => {
    const { token } = await registerUser({ name: 'Ghost Rater' });
    const res = await request(app).post('/api/reviews')
      .set('Authorization', `Bearer ${token}`)
      .send({ listing_id: 'nope', rating: 4 });
    expect(res.status).toBe(404);
  });

  it('creates a review and surfaces it in the listing summary and average', async () => {
    const { token } = await registerUser({ name: 'Happy Guest' });
    const listing = await createListing({ title: 'Reviewed Homestay' });

    const post = await request(app).post('/api/reviews')
      .set('Authorization', `Bearer ${token}`)
      .send({ listing_id: listing.id, rating: 5, comment: 'Wonderful stay!' });
    expect(post.status).toBe(200);
    expect(post.body.review.rating).toBe(5);
    expect(post.body.review.author_name).toBe('Happy Guest');

    const list = await request(app).get(`/api/reviews/listing/${listing.id}`);
    expect(list.status).toBe(200);
    expect(list.body.summary.count).toBe(1);
    expect(list.body.summary.average).toBe(5);
    expect(list.body.reviews[0].comment).toBe('Wonderful stay!');
  });

  it('averages multiple reviewers and exposes it on the listing endpoints', async () => {
    const listing = await createListing({ title: 'Average Test Listing' });
    const { token: a } = await registerUser({ name: 'Rater A' });
    const { token: b } = await registerUser({ name: 'Rater B' });
    await request(app).post('/api/reviews').set('Authorization', `Bearer ${a}`).send({ listing_id: listing.id, rating: 5 });
    await request(app).post('/api/reviews').set('Authorization', `Bearer ${b}`).send({ listing_id: listing.id, rating: 2 });

    const summary = await request(app).get(`/api/reviews/listing/${listing.id}`);
    expect(summary.body.summary.count).toBe(2);
    expect(summary.body.summary.average).toBe(3.5);

    const detail = await request(app).get(`/api/listings/${listing.id}`);
    expect(detail.body.item.rating).toBe(3.5);
    expect(detail.body.item.review_count).toBe(2);
  });

  it('a second submit by the same user edits their review rather than adding one', async () => {
    const { token } = await registerUser({ name: 'Second Thoughts' });
    const listing = await createListing();

    await request(app).post('/api/reviews').set('Authorization', `Bearer ${token}`).send({ listing_id: listing.id, rating: 2, comment: 'meh' });
    await request(app).post('/api/reviews').set('Authorization', `Bearer ${token}`).send({ listing_id: listing.id, rating: 4, comment: 'better on a second visit' });

    const list = await request(app).get(`/api/reviews/listing/${listing.id}`);
    expect(list.body.summary.count).toBe(1);
    expect(list.body.reviews[0].rating).toBe(4);
    expect(list.body.reviews[0].comment).toBe('better on a second visit');
  });

  it('lets a user delete their own review but not someone else\'s', async () => {
    const { token: owner } = await registerUser({ name: 'Review Owner' });
    const { token: other } = await registerUser({ name: 'Review Stranger' });
    const listing = await createListing();

    const post = await request(app).post('/api/reviews').set('Authorization', `Bearer ${owner}`).send({ listing_id: listing.id, rating: 5 });
    const reviewId = post.body.review.id;

    const strangerDelete = await request(app).delete(`/api/reviews/${reviewId}`).set('Authorization', `Bearer ${other}`);
    expect(strangerDelete.status).toBe(404); // not owned by them -> nothing deleted

    const ownerDelete = await request(app).delete(`/api/reviews/${reviewId}`).set('Authorization', `Bearer ${owner}`);
    expect(ownerDelete.status).toBe(200);

    const list = await request(app).get(`/api/reviews/listing/${listing.id}`);
    expect(list.body.summary.count).toBe(0);
  });
});
