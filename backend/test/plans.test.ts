import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { and, eq } from 'drizzle-orm';
import { app } from '../src/app';
import { db, schema } from '../src/db';
import { createListing, inDays, loginAdmin, registerUser } from './helpers';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

function planBody(over: Record<string, unknown> = {}) {
  return {
    title: 'Lava, Rishyap and Kolakham in 3 nights',
    stops: ['Kalimpong', 'Lava', { place: 'Rishyap', note: 'Sunrise point' }, 'Kolakham'],
    days: [{ day: 1, text: 'Drive up from Siliguri' }, { day: 3, text: 'Waterfall walk' }],
    start_date: inDays(20),
    nights: 3,
    seats: 3,
    cost_per_person: 6400,
    notes: 'Shared jeep, simple food.',
    ...over,
  };
}

async function createPlan(token: string, over: Record<string, unknown> = {}) {
  return request(app).post('/api/plans').set(auth(token)).send(planBody(over));
}

async function notesFor(userId: string) {
  return db.select().from(schema.notifications).where(eq(schema.notifications.userId, userId));
}

describe('trip plans: posting', () => {
  it('posts a plan with a stay and a driver and shows it in the feed without any phone number', async () => {
    const { token, user, phone } = await registerUser({ name: 'Pemba Sherpa' });
    const stay = await createListing({ title: 'Lava Forest Homestay', type: 'homestay' });
    const driver = await createListing({ title: 'Kalimpong Taxi Service', type: 'driver' });

    const res = await createPlan(token, { stay_listing_id: stay.id, driver_listing_id: driver.id });
    expect(res.status).toBe(201);
    const plan = res.body.plan;
    expect(plan.title).toBe('Lava, Rishyap and Kolakham in 3 nights');
    expect(plan.stops).toEqual([{ place: 'Kalimpong' }, { place: 'Lava' }, { place: 'Rishyap', note: 'Sunrise point' }, { place: 'Kolakham' }]);
    expect(plan.days).toEqual([{ day: 1, text: 'Drive up from Siliguri' }, { day: 3, text: 'Waterfall walk' }]);
    expect(plan.organiser).toEqual({ id: user.id, name: 'Pemba Sherpa', avatar: null });
    expect(plan.stay).toMatchObject({ id: stay.id, title: 'Lava Forest Homestay', type: 'homestay' });
    expect(plan.driver).toMatchObject({ id: driver.id, type: 'driver' });
    expect(plan.joined_count).toBe(1);
    expect(plan.seats_left).toBe(2);
    expect(plan.viewer).toEqual({ is_organiser: true, saved: false, join_status: null });
    expect(plan.requests).toEqual([]);

    const feed = await request(app).get('/api/plans');
    expect(feed.status).toBe(200);
    expect(feed.body.plans).toHaveLength(1);
    expect(feed.body.plans[0].viewer).toBeNull();
    expect(feed.body.plans[0]).not.toHaveProperty('requests');
    expect(feed.body.plans[0]).not.toHaveProperty('hidden');
    const digits = phone.replace(/\D/g, '').slice(-10);
    expect(JSON.stringify(feed.body)).not.toContain(digits);
    expect(JSON.stringify(feed.body)).not.toMatch(/phone/i);
  });

  it('needs a signed-in traveller, not business mode', async () => {
    expect((await request(app).post('/api/plans').send(planBody())).status).toBe(401);
    const { token } = await registerUser({ name: 'Mode Tester' });
    const biz = await request(app).post('/api/plans').set(auth(token)).set('X-Aangan-Mode', 'business').send(planBody());
    expect(biz.status).toBe(403);
    expect(biz.body.code).toBe('business_mode');
  });

  it('validates every field', async () => {
    const { token } = await registerUser({ name: 'Careful Planner' });
    const bad = async (over: Record<string, unknown>) => (await createPlan(token, over)).status;
    expect(await bad({ title: '' })).toBe(400);
    expect(await bad({ title: 'asdfasdf qwerqwer' })).toBe(400);
    expect(await bad({ title: 'x'.repeat(121) })).toBe(400);
    expect(await bad({ stops: [] })).toBe(400);
    expect(await bad({ stops: Array.from({ length: 13 }, (_, i) => `Village Number ${i}`) })).toBe(400);
    expect(await bad({ stops: ['Lava', 7] })).toBe(400);
    expect(await bad({ stops: ['Lava', { note: 'no place' }] })).toBe(400);
    expect(await bad({ nights: 0 })).toBe(400);
    expect(await bad({ nights: 31 })).toBe(400);
    expect(await bad({ nights: 1.5 })).toBe(400);
    expect(await bad({ seats: 0 })).toBe(400);
    expect(await bad({ seats: 21 })).toBe(400);
    expect(await bad({ cost_per_person: -1 })).toBe(400);
    expect(await bad({ cost_per_person: 'lots' })).toBe(400);
    expect(await bad({ start_date: '2026-02-30' })).toBe(400);
    expect(await bad({ start_date: inDays(-1) })).toBe(400);
    expect(await bad({ days: [{ day: 9, text: 'too far' }] })).toBe(400);
    expect(await bad({ days: [{ day: 1, text: 'a' }, { day: 1, text: 'b' }] })).toBe(400);
    expect(await bad({ visibility: 'friends' })).toBe(400);
    expect(await bad({ cover: 'javascript:alert(1)' })).toBe(400);
    expect(await bad({ notes: 'Call me on 98320 11223 to book' })).toBe(400);
    expect(await bad({ title: 'Trip with Pemba 9832011223' })).toBe(400);

    const spot = await createListing({ title: 'Tiger Hill View', type: 'spot' });
    const driver = await createListing({ title: 'Mirik Car Rental', type: 'driver' });
    expect(await bad({ stay_listing_id: 'nope' })).toBe(400);
    expect(await bad({ stay_listing_id: spot.id })).toBe(400);
    expect(await bad({ stay_listing_id: driver.id })).toBe(400);
    expect(await bad({ driver_listing_id: spot.id })).toBe(400);

    // Undated and costless plans are fine.
    expect(await bad({ start_date: null, cost_per_person: null, days: undefined })).toBe(201);
  });

  it('pages the feed newest first and leaves out private, hidden and past plans', async () => {
    const { token } = await registerUser({ name: 'Busy Planner' });
    for (const n of ['First', 'Second', 'Third']) {
      expect((await createPlan(token, { title: `${n} Darjeeling trip` })).status).toBe(201);
      await new Promise((r) => setTimeout(r, 5));
    }
    const first = await request(app).get('/api/plans?limit=2');
    expect(first.body.plans.map((p: { title: string }) => p.title)).toEqual(['Third Darjeeling trip', 'Second Darjeeling trip']);
    expect(first.body.next_before).toBeTruthy();
    const second = await request(app).get(`/api/plans?limit=2&before=${encodeURIComponent(first.body.next_before)}`);
    expect(second.body.plans.map((p: { title: string }) => p.title)).toEqual(['First Darjeeling trip']);
    expect(second.body.next_before).toBeNull();

    const { token: other } = await registerUser({ name: 'Quiet Planner' });
    const priv = await createPlan(other, { title: 'Private family trip', visibility: 'private' });
    expect(priv.status).toBe(201);
    const past = await createPlan(other, { title: 'Last month trip' });
    await db.update(schema.tripPlans).set({ startDate: inDays(-3) }).where(eq(schema.tripPlans.id, past.body.plan.id));
    const all = await request(app).get('/api/plans?limit=50');
    const titles = all.body.plans.map((p: { title: string }) => p.title);
    expect(titles).not.toContain('Private family trip');
    expect(titles).not.toContain('Last month trip');
    // A private plan is not reachable by id either, except by its organiser.
    expect((await request(app).get(`/api/plans/${priv.body.plan.id}`)).status).toBe(404);
    expect((await request(app).get(`/api/plans/${priv.body.plan.id}`).set(auth(other))).status).toBe(200);
  });

  it('hides plans by people the reader blocked', async () => {
    const { token: a, user: ua } = await registerUser({ name: 'Blocked Organiser' });
    const { token: b } = await registerUser({ name: 'Blocking Reader' });
    const plan = (await createPlan(a)).body.plan;
    await request(app).post('/api/users/me/blocks').set(auth(b)).send({ user_id: ua.id });
    expect((await request(app).get('/api/plans').set(auth(b))).body.plans).toHaveLength(0);
    expect((await request(app).get(`/api/plans/${plan.id}`).set(auth(b))).status).toBe(404);
    expect((await request(app).post(`/api/plans/${plan.id}/join`).set(auth(b))).status).toBe(404);
  });
});

describe('trip plans: editing', () => {
  it('lets only the organiser change or delete a plan', async () => {
    const { token: owner } = await registerUser({ name: 'Owner Planner' });
    const { token: other } = await registerUser({ name: 'Other Person' });
    const plan = (await createPlan(owner)).body.plan;

    expect((await request(app).patch(`/api/plans/${plan.id}`).set(auth(other)).send({ title: 'Mine now trip' })).status).toBe(404);
    expect((await request(app).delete(`/api/plans/${plan.id}`).set(auth(other))).status).toBe(404);

    const res = await request(app).patch(`/api/plans/${plan.id}`).set(auth(owner)).send({ title: 'Lava and Lolegaon trip', seats: 5, nights: 1 });
    expect(res.status).toBe(200);
    expect(res.body.plan.title).toBe('Lava and Lolegaon trip');
    expect(res.body.plan.seats).toBe(5);
    // Two days now: the day-3 note went with the shorter trip.
    expect(res.body.plan.days).toEqual([{ day: 1, text: 'Drive up from Siliguri' }]);
    expect(res.body.plan.updated_at).toBeTruthy();
    expect((await request(app).patch(`/api/plans/${plan.id}`).set(auth(owner)).send({ stops: [] })).status).toBe(400);

    expect((await request(app).delete(`/api/plans/${plan.id}`).set(auth(owner))).status).toBe(200);
    expect((await request(app).get(`/api/plans/${plan.id}`)).status).toBe(404);
  });

  it('will not cut seats below the people already in', async () => {
    const { token: owner } = await registerUser({ name: 'Seat Owner' });
    const { token: guest, user: g } = await registerUser({ name: 'Seat Guest' });
    const plan = (await createPlan(owner, { seats: 4 })).body.plan;
    await request(app).post(`/api/plans/${plan.id}/join`).set(auth(guest));
    await request(app).post(`/api/plans/${plan.id}/members/${g.id}/accept`).set(auth(owner));
    expect((await request(app).patch(`/api/plans/${plan.id}`).set(auth(owner)).send({ seats: 1 })).status).toBe(400);
    expect((await request(app).patch(`/api/plans/${plan.id}`).set(auth(owner)).send({ seats: 2 })).status).toBe(200);
  });

  it('tells members when the organiser deletes the plan', async () => {
    const { token: owner } = await registerUser({ name: 'Cancelling Owner' });
    const { token: guest, user: g } = await registerUser({ name: 'Waiting Guest' });
    const plan = (await createPlan(owner)).body.plan;
    await request(app).post(`/api/plans/${plan.id}/join`).set(auth(guest));
    await request(app).delete(`/api/plans/${plan.id}`).set(auth(owner));
    const notes = await notesFor(g.id);
    expect(notes.map((n) => n.kind)).toContain('plan_cancelled');
  });
});

describe('trip plans: joining', () => {
  it('runs ask → organiser notified → accept → person notified, and counts the seat', async () => {
    const { token: owner, user: o } = await registerUser({ name: 'Sunita Gurung' });
    const { token: guest, user: g } = await registerUser({ name: 'Asha Rai' });
    const plan = (await createPlan(owner, { seats: 3 })).body.plan;

    const ask = await request(app).post(`/api/plans/${plan.id}/join`).set(auth(guest));
    expect(ask.status).toBe(201);
    expect(ask.body.plan.viewer.join_status).toBe('pending');
    expect(ask.body.plan.joined_count).toBe(1);
    // Asking twice is not an error and sends nothing new.
    expect((await request(app).post(`/api/plans/${plan.id}/join`).set(auth(guest))).status).toBe(200);

    const ownerNotes = await notesFor(o.id);
    expect(ownerNotes.filter((n) => n.kind === 'plan_join_request')).toHaveLength(1);
    expect(ownerNotes[0].msg).toEqual({ key: 'plan_join_request', params: { guest: 'Asha Rai', plan: plan.title } });
    expect(ownerNotes[0].refId).toBe(plan.id);

    const detail = await request(app).get(`/api/plans/${plan.id}`).set(auth(owner));
    expect(detail.body.plan.pending_count).toBe(1);
    expect(detail.body.plan.requests).toEqual([
      expect.objectContaining({ user: { id: g.id, name: 'Asha Rai', avatar: null }, status: 'pending' }),
    ]);
    expect(JSON.stringify(detail.body)).not.toMatch(/phone/i);
    // Someone else does not see the request list.
    const outsider = await request(app).get(`/api/plans/${plan.id}`).set(auth(guest));
    expect(outsider.body.plan).not.toHaveProperty('requests');

    const acc = await request(app).post(`/api/plans/${plan.id}/members/${g.id}/accept`).set(auth(owner));
    expect(acc.status).toBe(200);
    expect(acc.body.plan.joined_count).toBe(2);
    expect(acc.body.plan.members.map((m: { name: string }) => m.name)).toEqual(['Sunita Gurung', 'Asha Rai']);
    const guestNotes = await notesFor(g.id);
    expect(guestNotes.map((n) => n.kind)).toContain('plan_join_accepted');

    const feed = await request(app).get('/api/plans').set(auth(guest));
    expect(feed.body.plans[0].viewer.join_status).toBe('accepted');
    expect(feed.body.plans[0].seats_left).toBe(1);
  });

  it('refuses your own plan, a full plan, a started plan and asking again after a decline', async () => {
    const { token: owner } = await registerUser({ name: 'Strict Owner' });
    const { token: a, user: ua } = await registerUser({ name: 'First Guest' });
    const { token: b, user: ub } = await registerUser({ name: 'Second Guest' });
    const plan = (await createPlan(owner, { seats: 2 })).body.plan;

    const own = await request(app).post(`/api/plans/${plan.id}/join`).set(auth(owner));
    expect(own.status).toBe(400);
    expect(own.body.code).toBe('own_plan');

    expect((await request(app).post(`/api/plans/${plan.id}/join`).set(auth(a))).status).toBe(201);
    expect((await request(app).post(`/api/plans/${plan.id}/join`).set(auth(b))).status).toBe(201);
    expect((await request(app).post(`/api/plans/${plan.id}/members/${ua.id}/accept`).set(auth(owner))).status).toBe(200);
    // Two seats, organiser + one: the second cannot be confirmed.
    const over = await request(app).post(`/api/plans/${plan.id}/members/${ub.id}/accept`).set(auth(owner));
    expect(over.status).toBe(409);
    expect(over.body.code).toBe('full');

    const dec = await request(app).post(`/api/plans/${plan.id}/members/${ub.id}/decline`).set(auth(owner));
    expect(dec.status).toBe(200);
    expect((await notesFor(ub.id)).map((n) => n.kind)).toContain('plan_join_declined');
    // A declined person cannot ask again, and withdrawing does not wipe the decline.
    await request(app).delete(`/api/plans/${plan.id}/join`).set(auth(b));
    const again = await request(app).post(`/api/plans/${plan.id}/join`).set(auth(b));
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('declined');

    const { token: c } = await registerUser({ name: 'Late Guest' });
    const full = await request(app).post(`/api/plans/${plan.id}/join`).set(auth(c));
    expect(full.status).toBe(409);
    expect(full.body.code).toBe('full');

    const started = (await createPlan(owner, { title: 'Started already trip' })).body.plan;
    await db.update(schema.tripPlans).set({ startDate: inDays(-1) }).where(eq(schema.tripPlans.id, started.id));
    const late = await request(app).post(`/api/plans/${started.id}/join`).set(auth(c));
    expect(late.status).toBe(409);
    expect(late.body.code).toBe('started');

    const biz = await request(app).post(`/api/plans/${started.id}/join`).set(auth(c)).set('X-Aangan-Mode', 'business');
    expect(biz.status).toBe(403);
  });

  it('lets only the organiser accept or decline', async () => {
    const { token: owner } = await registerUser({ name: 'Real Organiser' });
    const { token: guest, user: g } = await registerUser({ name: 'Hopeful Guest' });
    const plan = (await createPlan(owner)).body.plan;
    await request(app).post(`/api/plans/${plan.id}/join`).set(auth(guest));
    expect((await request(app).post(`/api/plans/${plan.id}/members/${g.id}/accept`).set(auth(guest))).status).toBe(404);
    expect((await request(app).post(`/api/plans/${plan.id}/members/${g.id}/promote`).set(auth(owner))).status).toBe(404);
    expect((await request(app).post(`/api/plans/${plan.id}/members/nobody/accept`).set(auth(owner))).status).toBe(404);
  });

  it('lets a member leave, freeing the seat and telling the organiser', async () => {
    const { token: owner, user: o } = await registerUser({ name: 'Left Behind' });
    const { token: guest, user: g } = await registerUser({ name: 'Leaving Guest' });
    const plan = (await createPlan(owner)).body.plan;
    await request(app).post(`/api/plans/${plan.id}/join`).set(auth(guest));
    await request(app).post(`/api/plans/${plan.id}/members/${g.id}/accept`).set(auth(owner));
    const leave = await request(app).delete(`/api/plans/${plan.id}/join`).set(auth(guest));
    expect(leave.status).toBe(200);
    expect(leave.body.plan.joined_count).toBe(1);
    expect(leave.body.plan.viewer.join_status).toBeNull();
    expect((await notesFor(o.id)).map((n) => n.kind)).toContain('plan_member_left');
    const rows = await db.select().from(schema.tripPlanMembers).where(and(eq(schema.tripPlanMembers.planId, plan.id), eq(schema.tripPlanMembers.userId, g.id)));
    expect(rows).toHaveLength(0);
  });
});

describe('trip plans: saving and my plans', () => {
  it('saves and unsaves, and lists mine, joined and saved under /me', async () => {
    const { token: owner } = await registerUser({ name: 'Saved Owner' });
    const { token: me } = await registerUser({ name: 'Saving Traveller' });
    const a = (await createPlan(owner, { title: 'Sittong oranges trip' })).body.plan;
    const b = (await createPlan(owner, { title: 'Latpanchar birds trip' })).body.plan;
    const mine = (await createPlan(me, { title: 'My own Mirik trip' })).body.plan;

    expect((await request(app).post(`/api/plans/${a.id}/save`).set(auth(me))).status).toBe(200);
    expect((await request(app).post(`/api/plans/${a.id}/save`).set(auth(me))).status).toBe(200);
    expect((await request(app).post(`/api/plans/${b.id}/join`).set(auth(me))).status).toBe(201);
    expect((await request(app).post('/api/plans/nope/save').set(auth(me))).status).toBe(404);
    expect((await request(app).post(`/api/plans/${a.id}/save`)).status).toBe(401);

    const feed = await request(app).get('/api/plans').set(auth(me));
    const fa = feed.body.plans.find((p: { id: string }) => p.id === a.id);
    expect(fa.viewer.saved).toBe(true);

    const res = await request(app).get('/api/plans/me').set(auth(me));
    expect(res.status).toBe(200);
    expect(res.body.mine.map((p: { id: string }) => p.id)).toEqual([mine.id]);
    expect(res.body.mine[0].requests).toEqual([]);
    expect(res.body.joined.map((p: { id: string }) => p.id)).toEqual([b.id]);
    expect(res.body.joined[0].viewer.join_status).toBe('pending');
    expect(res.body.saved.map((p: { id: string }) => p.id)).toEqual([a.id]);

    expect((await request(app).delete(`/api/plans/${a.id}/save`).set(auth(me))).status).toBe(200);
    expect((await request(app).get('/api/plans/me').set(auth(me))).body.saved).toHaveLength(0);
    expect((await request(app).get('/api/plans/me')).status).toBe(401);
  });
});

describe('trip plans: reports and moderation', () => {
  it('can be reported, and the team can hide and unhide a plan', async () => {
    const { token: owner } = await registerUser({ name: 'Reported Owner' });
    const { token: reader } = await registerUser({ name: 'Reporting Reader' });
    const plan = (await createPlan(owner)).body.plan;

    const report = await request(app).post('/api/reports').set(auth(reader)).send({ target_type: 'plan', target_id: plan.id, reason: 'spam' });
    expect(report.status).toBe(201);
    expect((await request(app).post('/api/reports').set(auth(reader)).send({ target_type: 'plan', target_id: 'gone', reason: 'spam' })).status).toBe(404);

    const admin = await loginAdmin();
    const list = await request(app).get('/api/admin/reports').set(auth(admin));
    const r = list.body.reports.find((x: { target_type: string }) => x.target_type === 'plan');
    expect(r.target).toMatchObject({ title: plan.title, hidden: false, author_name: 'Reported Owner' });
    expect(r.target.text).toContain('Kalimpong → Lava');

    expect((await request(app).post(`/api/plans/${plan.id}/hide`).set(auth(reader))).status).toBe(403);
    expect((await request(app).post(`/api/plans/${plan.id}/hide`).set(auth(admin))).status).toBe(200);
    expect((await request(app).get('/api/plans')).body.plans).toHaveLength(0);
    expect((await request(app).get(`/api/plans/${plan.id}`)).status).toBe(404);
    expect((await request(app).post(`/api/plans/${plan.id}/join`).set(auth(reader))).status).toBe(404);
    // The organiser still sees it, marked hidden.
    const own = await request(app).get(`/api/plans/${plan.id}`).set(auth(owner));
    expect(own.status).toBe(200);
    expect(own.body.plan.hidden).toBe(true);
    const after = await request(app).get('/api/admin/reports').set(auth(admin));
    expect(after.body.reports.find((x: { target_type: string }) => x.target_type === 'plan').target.hidden).toBe(true);

    expect((await request(app).post(`/api/plans/${plan.id}/unhide`).set(auth(admin))).status).toBe(200);
    expect((await request(app).get('/api/plans')).body.plans).toHaveLength(1);
    expect((await request(app).post('/api/plans/nope/hide').set(auth(admin))).status).toBe(404);
  });
});
