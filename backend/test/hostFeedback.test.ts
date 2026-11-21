import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { onboardActiveProvider } from './helpers';

describe('host feedback', () => {
  it('stores feedback privately for the authenticated provider', async () => {
    const { token } = await onboardActiveProvider({ name: 'Feedback Host', businessType: 'guide' });
    const created = await request(app).post('/api/host-feedback').set('Authorization', `Bearer ${token}`)
      .send({ message: 'Please add a clearer way to manage guide availability.' });
    expect(created.status).toBe(201);
    expect(created.body.feedback.status).toBe('open');

    const listed = await request(app).get('/api/host-feedback').set('Authorization', `Bearer ${token}`);
    expect(listed.status).toBe(200);
    expect(listed.body.items).toHaveLength(1);
    expect(listed.body.items[0].message).toContain('guide availability');
  });

  it('rejects feedback that is too short', async () => {
    const { token } = await onboardActiveProvider({ name: 'Short Feedback Host' });
    const res = await request(app).post('/api/host-feedback').set('Authorization', `Bearer ${token}`).send({ message: 'Too short' });
    expect(res.status).toBe(400);
  });
});
