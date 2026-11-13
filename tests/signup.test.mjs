// The studio news list (worker/index.mjs): run with `node --test tests/`.
import test from 'node:test';
import assert from 'node:assert';
import { api, makeToken, readToken, normalizeEmail, LIMITS } from '../worker/index.mjs';

const NOW = Date.parse('2026-11-13T12:00:00Z');
function world() {
  const m = new Map();
  const sent = [];
  const env = {
    SIGNUP: { get: async (k) => (m.has(k) ? m.get(k) : null), put: async (k, v) => void m.set(k, v), delete: async (k) => void m.delete(k) },
    SIGNUP_SECRET: 's3cret-for-tests',
    RESEND_API_KEY: 're_test',
    EMAIL_FROM: 'Dude & Daddy <dudeanddaddy@beepboopmail.com>',
  };
  const fetchImpl = async (url, init) => (sent.push({ url, auth: init.headers.authorization, ...JSON.parse(init.body) }), { ok: true });
  const post = (path, body, { origin = 'https://dudeanddaddy.com', now = NOW, ip = '1.2.3.4' } = {}) =>
    api(new Request('https://dudeanddaddy.com' + path, { method: 'POST', headers: { ...(origin ? { Origin: origin } : {}), 'CF-Connecting-IP': ip, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }), env, { now, fetchImpl });
  const tokenIn = (mail) => /#(\S+)/.exec(mail.text)[1];
  return { m, sent, env, post, tokenIn };
}

test('an email address: one plain address only', () => {
  assert.strictEqual(normalizeEmail(' Dad@Example.COM '), 'dad@example.com');
  for (const bad of ['', 'dad', 'a b@x.co', 'a@x.co,b@y.co', 'a@x.co\nBcc: b@y.co', '<a@x.co>', 'a..b@x.co', 5, null]) assert.strictEqual(normalizeEmail(bad), null);
});

test('links are signed: the right kind, not changed, not run out', async () => {
  const t = await makeToken('k', 'c', 'dad@example.com', NOW + 1000);
  assert.strictEqual(await readToken('k', 'c', t, NOW), 'dad@example.com');
  assert.strictEqual(await readToken('k', 'u', t, NOW), null, 'a confirm link is not an unsubscribe link');
  assert.strictEqual(await readToken('other', 'c', t, NOW), null);
  assert.strictEqual(await readToken('k', 'c', t, NOW + 1000), null, 'run out');
  assert.strictEqual(await readToken('k', 'c', t.replace(/\.[^.]+$/, '.AAAA'), NOW), null);
  const parts = t.split('.');
  parts[1] = Buffer.from('mum@example.com').toString('base64url');
  assert.strictEqual(await readToken('k', 'c', parts.join('.'), NOW), null, 'someone else’s address with this signature');
  const forever = await makeToken('k', 'u', 'dad@example.com');
  assert.strictEqual(await readToken('k', 'u', forever, NOW + 10 * 365 * 86400000), 'dad@example.com');
  for (const junk of [null, '', 'a.b.c', 'x'.repeat(800)]) assert.strictEqual(await readToken('k', 'c', junk, NOW), null);
});

test('sign up → confirm → welcome → unsubscribe; nothing is saved until the click', async () => {
  const w = world();
  const r = await w.post('/api/subscribe', { email: ' Dad@Example.com ', adult: true, website: '' });
  assert.deepStrictEqual([r.status, await r.json()], [200, { ok: true }]);
  assert.strictEqual(w.sent.length, 1);
  assert.strictEqual(w.sent[0].url, 'https://api.resend.com/emails');
  assert.strictEqual(w.sent[0].auth, 'Bearer re_test');
  assert.deepStrictEqual(w.sent[0].to, ['dad@example.com']);
  assert.strictEqual(w.sent[0].from, 'Dude & Daddy <dudeanddaddy@beepboopmail.com>');
  assert.match(w.sent[0].text, /https:\/\/dudeanddaddy\.com\/news\/confirm\/#c\./);
  assert.ok(![...w.m.keys()].some((k) => k.startsWith('sub:')), 'not on the list yet');
  assert.ok(![...w.m.entries()].some(([k, v]) => (k + v).includes('example.com')), 'and the address is nowhere');
  const c = await w.post('/api/confirm', { token: w.tokenIn(w.sent[0]) });
  assert.deepStrictEqual(await c.json(), { ok: true });
  assert.ok(w.m.has('sub:dad@example.com'));
  assert.strictEqual(w.sent.length, 2, 'a welcome');
  assert.match(w.sent[1].headers['List-Unsubscribe'], /^<https:\/\/dudeanddaddy\.com\/api\/unsubscribe\?t=u\./);
  assert.strictEqual(w.sent[1].headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
  await w.post('/api/confirm', { token: w.tokenIn(w.sent[0]) });
  assert.strictEqual(w.sent.length, 2, 'a second click sends nothing new');
  const u = await w.post('/api/unsubscribe', { token: w.tokenIn(w.sent[1]) });
  assert.deepStrictEqual(await u.json(), { ok: true });
  assert.ok(!w.m.has('sub:dad@example.com'));
});

test('the mail app’s one-click unsubscribe: a POST with no page and no body', async () => {
  const w = world();
  w.m.set('sub:dad@example.com', '{}');
  const t = await makeToken(w.env.SIGNUP_SECRET, 'u', 'dad@example.com');
  const r = await w.post('/api/unsubscribe?t=' + t, undefined, { origin: null });
  assert.strictEqual(r.status, 200);
  assert.ok(!w.m.has('sub:dad@example.com'));
  assert.strictEqual((await w.post('/api/unsubscribe?t=nope', undefined, { origin: null })).status, 400);
  const c = await makeToken(w.env.SIGNUP_SECRET, 'c', 'dad@example.com', NOW + 1000);
  assert.strictEqual((await w.post('/api/unsubscribe', { token: c })).status, 400, 'a confirm link can’t unsubscribe');
});

test('what is turned away: other sites, no grown-up tick, bad addresses, bots, run-out links, other methods', async () => {
  const w = world();
  assert.strictEqual((await w.post('/api/subscribe', { email: 'dad@example.com', adult: true }, { origin: 'https://evil.example' })).status, 403);
  assert.strictEqual((await w.post('/api/subscribe', { email: 'dad@example.com', adult: true }, { origin: null })).status, 403);
  assert.strictEqual((await w.post('/api/subscribe', { email: 'dad@example.com' })).status, 400);
  assert.strictEqual((await w.post('/api/subscribe', { email: 'nope', adult: true })).status, 400);
  assert.strictEqual((await w.post('/api/subscribe', { email: 'a@x.co, b@y.co', adult: true })).status, 400);
  assert.strictEqual((await w.post('/api/subscribe', { email: 'dad@example.com', adult: true, website: 'http://spam' })).status, 200, 'a bot hears yes');
  assert.strictEqual(w.sent.length, 0, '…and nothing is sent');
  assert.strictEqual((await w.post('/api/subscribe', { email: 'x'.repeat(3000) + '@a.co', adult: true })).status, 400);
  await w.post('/api/subscribe', { email: 'dad@example.com', adult: true });
  const late = await w.post('/api/confirm', { token: w.tokenIn(w.sent[0]) }, { now: NOW + LIMITS.CONFIRM_MS });
  assert.strictEqual(late.status, 400);
  assert.strictEqual((await api(new Request('https://dudeanddaddy.com/api/subscribe'), w.env)).status, 404);
  assert.strictEqual((await api(new Request('https://dudeanddaddy.com/api/other', { method: 'POST' }), w.env)).status, 404);
  assert.strictEqual((await api(new Request('https://dudeanddaddy.com/api/subscribe', { method: 'POST', headers: { Origin: 'https://dudeanddaddy.com' }, body: '{}' }), { ...w.env, RESEND_API_KEY: '' })).status, 503, 'not set up: closed');
});

test('limits: 3 confirmation emails to one address a day (the same quiet yes), a cap for everyone, a rate limit per visitor', async () => {
  const w = world();
  for (let i = 0; i < 5; i++) assert.strictEqual((await w.post('/api/subscribe', { email: 'victim@example.com', adult: true })).status, 200);
  assert.strictEqual(w.sent.length, LIMITS.PER_ADDRESS_DAY, "nobody's inbox gets filled from here");
  await w.post('/api/subscribe', { email: 'victim@example.com', adult: true }, { now: NOW + 86400000 });
  assert.strictEqual(w.sent.length, LIMITS.PER_ADDRESS_DAY + 1, 'tomorrow');
  w.m.set('all:2026-11-13', String(LIMITS.ALL_PER_DAY));
  assert.strictEqual((await w.post('/api/subscribe', { email: 'new@example.com', adult: true })).status, 503);
  let n = 0;
  w.env.SIGNUPS = { limit: async ({ key }) => ({ success: key === '1.2.3.4' && ++n <= 2 }) };
  await w.post('/api/subscribe', { email: 'a@example.com', adult: true }, { now: NOW + 2 * 86400000 });
  await w.post('/api/subscribe', { email: 'b@example.com', adult: true }, { now: NOW + 2 * 86400000 });
  assert.strictEqual((await w.post('/api/subscribe', { email: 'c@example.com', adult: true }, { now: NOW + 2 * 86400000 })).status, 429);
});

test('the mail service says no: the visitor hears "closed", not a false yes', async () => {
  const w = world();
  const r = await api(new Request('https://dudeanddaddy.com/api/subscribe', { method: 'POST', headers: { Origin: 'https://dudeanddaddy.com' }, body: JSON.stringify({ email: 'dad@example.com', adult: true }) }), w.env, { now: NOW, fetchImpl: async () => ({ ok: false }) });
  assert.strictEqual(r.status, 503);
});
