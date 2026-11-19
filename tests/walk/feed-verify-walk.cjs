// The Feed's posting rule, clicked through in a browser: anyone plans a trip; only a verified person
// (the aangan pass for a traveller, the Verified tick for a business) posts it in the Feed.
// Usage: WEB=http://localhost:3000 API=http://localhost:8001/api PLAYWRIGHT=<path to playwright> node tests/walk/feed-verify-walk.cjs [outdir]
const { chromium } = require(process.env.PLAYWRIGHT);
const path = require('path');
const fs = require('fs');
const WEB = process.env.WEB || 'http://localhost:3000';
const API = process.env.API || 'http://localhost:8001/api';
const OUT = process.argv[2] || path.join(process.cwd(), 'feed-verify-walk');
fs.mkdirSync(OUT, { recursive: true });

let fails = 0;
const ok = (cond, what) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}`); if (!cond) fails++; };
const call = async (p, { method = 'GET', token, body } = {}) => {
  const r = await fetch(API + p, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await r.json(); } catch { /* empty */ }
  return { status: r.status, data };
};
const signUp = async (name, role = 'tourist') => {
  const phone = '+9198' + String(Date.now() + Math.floor(Math.random() * 1000)).slice(-8);
  const s = await call('/auth/otp/send', { method: 'POST', body: { phone } });
  const v = await call('/auth/otp/verify', { method: 'POST', body: { phone, otp: s.data.mock_otp, name, role } });
  return { token: v.data.token, id: v.data.user.id };
};
const buyPass = async (u) => {
  const o = await call('/payments/order', { method: 'POST', token: u.token, body: { flow: 'platform_support', reference_id: u.id } });
  const id = o.data?.order?.id;
  return (await call('/payments/mock/complete', { method: 'POST', token: u.token, body: { order_id: id, flow: 'platform_support', reference_id: u.id } })).status;
};

async function open(browser, u, mode = 'tourist') {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const p = await ctx.newPage();
  p.errs = []; p.on('pageerror', (e) => p.errs.push(e.message));
  await p.goto(WEB + '/');
  await p.evaluate(([tok, m]) => { localStorage.setItem('token', tok); localStorage.setItem('mode', m); localStorage.setItem('lang', 'en'); }, [u.token, mode]);
  return { ctx, p };
}
const tid = (p, id) => p.locator(`[data-testid="${id}"]`).first();
const seen = (l, ms = 8000) => l.waitFor({ timeout: ms }).then(() => true, () => false);

/** Fill the planner up to the check step (name, two places, people). */
async function planUpToCheck(p, title) {
  await p.goto(WEB + '/feed');
  await tid(p, 'feed-plan-trip').click();
  await p.waitForURL(/\/plan$/, { timeout: 8000 });
  await tid(p, 'plan-title').fill(title);
  await tid(p, 'plan-nights').fill('1');
  await tid(p, 'plan-next').click();
  for (const [j, place] of [[1, 'Darjeeling'], [2, 'Mirik']]) {
    await tid(p, `plan-day-place-${j}`).click();
    await tid(p, 'plan-place-q').fill(place);
    const o = p.locator('[data-testid="plan-place-list"] .ag-plan-opt', { hasText: place }).first();
    await o.waitFor({ timeout: 8000 });
    await o.click();
  }
  await tid(p, 'plan-next').click();
  await tid(p, 'plan-next').click();
  return seen(tid(p, 'plan-step-3'));
}

(async () => {
  const browser = await chromium.launch();
  const T = String(Date.now()).slice(-5);

  // 1. A traveller without the pass: plans, cannot post, keeps it, then is shown how to get verified.
  const plain = await signUp(`Plain ${T}`);
  {
    const { ctx, p } = await open(browser, plain);
    ok(await planUpToCheck(p, `Kept trip ${T}`), 'unverified traveller can plan a trip up to the last step');
    ok(await seen(tid(p, 'plan-verify-gate')), 'last step says only verified people post in the Feed');
    ok(!(await tid(p, 'plan-post').count()), 'no "Post the plan" button for them');
    ok(await seen(tid(p, 'plan-verify-pass')), 'offers the ₹1 pass');
    await p.screenshot({ path: path.join(OUT, '1-gate.png') });
    await tid(p, 'plan-keep-private').click();
    ok(await seen(tid(p, 'plan-done')), 'keep it to myself: plan saved');
    await p.screenshot({ path: path.join(OUT, '2-kept.png') });
    await tid(p, 'plan-done-open').click();
    await tid(p, 'plan-to-feed').click();
    ok(await seen(tid(p, 'plan-verify-gate')), 'Post it in the Feed on the kept plan shows how to get verified');
    const feed = await call('/plans?limit=50');
    ok(!(feed.data?.plans || []).some((x) => x.title === `Kept trip ${T}`), 'kept plan is not in the Feed');
    // They can still react to and comment on what is in the Feed.
    await tid(p, 'plan-verify-pass').click();
    ok(await p.waitForURL(/\/support\?next=/, { timeout: 8000 }).then(() => true, () => false), 'pass button opens the pass page and comes back after');
    ok(!p.errs.length, 'no page errors ' + p.errs.join(' | '));
    await ctx.close();
  }

  // 2. The same kind of traveller with the pass: posts straight to the Feed.
  const member = await signUp(`Member ${T}`);
  ok((await buyPass(member)) === 200, 'pass bought through the mock gateway');
  {
    const { ctx, p } = await open(browser, member);
    ok(await planUpToCheck(p, `Posted trip ${T}`), 'pass holder reaches the last step');
    ok(!(await tid(p, 'plan-verify-gate').count()), 'no verify box for a pass holder');
    await tid(p, 'plan-post').click();
    ok(await seen(tid(p, 'plan-done-feed')), 'plan posted');
    const feed = await call('/plans?limit=50');
    ok((feed.data?.plans || []).some((x) => x.title === `Posted trip ${T}`), 'posted plan is in the Feed');
    ok(!p.errs.length, 'no page errors ' + p.errs.join(' | '));
    await ctx.close();
  }

  // 3. A business without the Verified tick, on the business side: can plan, is pointed at the tick,
  //    and the Feed tells it posts open once documents are approved.
  const host = await signUp(`Host ${T}`, 'provider');
  const ob = await call('/providers/onboard', { method: 'POST', token: host.token, body: { business_name: `Walk Stay ${T}`, business_type: 'shop', description: 'A small shop by the road', location: 'Darjeeling', contact_phone: '9800000000' } });
  await call('/providers/me/start-free', { method: 'POST', token: host.token });
  ok(ob.status === 200, 'business set up (not verified yet)');
  {
    const { ctx, p } = await open(browser, host, 'provider');
    await p.goto(WEB + '/feed');
    ok(await seen(tid(p, 'feed-plan-trip')), 'business side shows Plan a trip');
    ok(await seen(tid(p, 'feed-create-post')), 'business side shows Create a post');
    await tid(p, 'feed-create-post').click();
    ok(await seen(tid(p, 'feed-post-gate')), 'tapping it explains the rule (no composer)');
    ok(/verified/i.test(await tid(p, 'feed-post-gate').innerText()), 'it says posts open once documents are verified');
    ok(!(await p.locator('[data-testid="post-composer"], .ag-composer').count()), 'no composer for an unverified business');
    await p.screenshot({ path: path.join(OUT, '3-host-feed.png') });
    ok(await planUpToCheck(p, `Host trip ${T}`), 'unverified business can plan a trip');
    ok(await seen(tid(p, 'plan-verify-tick')), 'last step points the business at the Verified tick');
    await p.screenshot({ path: path.join(OUT, '3-host-gate.png') });
    ok(!p.errs.length, 'no page errors ' + p.errs.join(' | '));
    await ctx.close();
  }

  // 4. The same business once the team gives it the Verified tick (set directly in the local database,
  //    standing in for the admin's approval): Create a post opens the composer.
  if (process.env.PG_CONTAINER) {
    require('child_process').execFileSync('docker', ['exec', process.env.PG_CONTAINER, 'psql', '-U', 'postgres', '-d', process.env.PG_DB || 'one_darjeeling',
      '-c', `update providers set kyc_status='verified' where business_name='Walk Stay ${T}'`]);
    const { ctx, p } = await open(browser, host, 'provider');
    await p.goto(WEB + '/feed');
    await tid(p, 'feed-create-post').click();
    ok(await seen(tid(p, 'post-composer')), 'verified business: Create a post opens the composer');
    ok(!(await tid(p, 'feed-post-gate').count()), 'verified business: no gate');
    await p.screenshot({ path: path.join(OUT, '4-verified-composer.png') });
    ok(!p.errs.length, 'no page errors ' + p.errs.join(' | '));
    await ctx.close();
  }

  await browser.close();
  console.log(fails ? `${fails} FAILED` : 'FEED POSTING RULE WORKS');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
