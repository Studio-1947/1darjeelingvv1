import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { registerUser, onboardActiveProvider } from './helpers';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function hostPost() {
  const host = await onboardActiveProvider({ name: 'Dawa' });
  const res = await request(app).post('/api/posts').set(auth(host.token)).send({ body: 'First flush is in.' });
  expect(res.status).toBe(201);
  return { host, postId: res.body.post.id as string };
}

describe('likes on host posts', () => {
  it('counts one like per person and shows the reader their own like', async () => {
    const { postId } = await hostPost();
    const { token } = await registerUser({ name: 'Liking Lhamu' });

    const first = await request(app).post(`/api/posts/${postId}/like`).set(auth(token));
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ like_count: 1, liked_by_me: true });
    // Liking twice is still one like.
    expect((await request(app).post(`/api/posts/${postId}/like`).set(auth(token))).body.like_count).toBe(1);

    const mine = await request(app).get('/api/posts').set(auth(token));
    expect(mine.body.posts[0]).toMatchObject({ like_count: 1, liked_by_me: true, comment_count: 0 });
    const anon = await request(app).get('/api/posts');
    expect(anon.body.posts[0]).toMatchObject({ like_count: 1, liked_by_me: false });

    const undo = await request(app).delete(`/api/posts/${postId}/like`).set(auth(token));
    expect(undo.body).toMatchObject({ like_count: 0, liked_by_me: false });
  });

  it('needs a sign-in', async () => {
    const { postId } = await hostPost();
    expect((await request(app).post(`/api/posts/${postId}/like`)).status).toBe(401);
  });
});

describe('comments on host posts', () => {
  it('adds, lists and deletes a comment; only the writer, the host or an admin may delete it', async () => {
    const { host, postId } = await hostPost();
    const writer = await registerUser({ name: 'Commenting Karma' });
    const stranger = await registerUser({ name: 'Someone Else' });

    expect((await request(app).post(`/api/posts/${postId}/comments`).set(auth(writer.token)).send({ body: '   ' })).status).toBe(400);
    expect((await request(app).post(`/api/posts/${postId}/comments`).set(auth(writer.token)).send({ body: 'x'.repeat(501) })).status).toBe(400);

    const added = await request(app).post(`/api/posts/${postId}/comments`).set(auth(writer.token)).send({ body: 'Lovely, coming in March!' });
    expect(added.status).toBe(201);
    const commentId = added.body.comment.id;

    const list = await request(app).get(`/api/posts/${postId}/comments`);
    expect(list.body.comments).toHaveLength(1);
    expect(list.body.comments[0]).toMatchObject({ body: 'Lovely, coming in March!', can_delete: false });
    expect(list.body.comments[0].user.name).toBe('Commenting Karma');
    expect((await request(app).get(`/api/posts/${postId}`)).body.post.comment_count).toBe(1);

    expect((await request(app).delete(`/api/posts/${postId}/comments/${commentId}`).set(auth(stranger.token))).status).toBe(404);
    expect((await request(app).delete(`/api/posts/${postId}/comments/${commentId}`).set(auth(host.token))).status).toBe(200);
    expect((await request(app).get(`/api/posts/${postId}/comments`)).body.comments).toHaveLength(0);
  });
});

describe('reactions on host posts', () => {
  it('lets a reader pick a reaction, change it, and still counts one per person', async () => {
    const { postId } = await hostPost();
    const { token: a } = await registerUser({ name: 'Wow Wangmo' });
    const { token: b } = await registerUser({ name: 'Heart Hari' });

    const wow = await request(app).post(`/api/posts/${postId}/like`).set(auth(a)).send({ kind: 'wow' });
    expect(wow.body).toMatchObject({ my_reaction: 'wow', like_count: 1, liked_by_me: true });
    // No kind is a heart, as older apps send it.
    await request(app).post(`/api/posts/${postId}/like`).set(auth(b));

    const both = (await request(app).get('/api/posts').set(auth(b))).body.posts[0];
    expect(both.reactions).toEqual({ heart: 1, wow: 1, clap: 0, yum: 0 });
    expect(both.like_count).toBe(2);
    expect(both.my_reaction).toBe('heart');

    // Changing is not a second reaction.
    const changed = await request(app).post(`/api/posts/${postId}/like`).set(auth(a)).send({ kind: 'yum' });
    expect(changed.body.reactions).toEqual({ heart: 1, wow: 0, clap: 0, yum: 1 });
    expect(changed.body.like_count).toBe(2);
  });

  it('refuses a reaction that is not on the list', async () => {
    const { postId } = await hostPost();
    const { token } = await registerUser({ name: 'Odd Ongmu' });
    const res = await request(app).post(`/api/posts/${postId}/like`).set(auth(token)).send({ kind: 'angry' });
    expect(res.status).toBe(400);
  });
});
