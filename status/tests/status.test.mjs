// The status worker (status/): what it watches, how answers are judged, what the public sees, when Rob is emailed,
// and who may open the console. Run from status/: `npm test`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { ASSETS, GROUPS, judge, requestFor, alerts } from '../src/assets.js';
import { board, uptime, average, alertsFor, alertMail, checkIncident, FAILS_BEFORE_ALERT } from '../src/summary.js';
import { checkTicket, ticketFrom, emailList } from '../src/access.js';
import { securityHeaders } from '../src/headers.js';
import { newsStats } from '../src/worker.js';

const root = new URL('../', import.meta.url);
const read = (f) => readFileSync(new URL(f, root), 'utf8');
const strip = (s) => s.replace(/^\s*\/\/.*$/gm, '').replace(/,\s*([}\]])/g, '$1');
const byId = (id) => ASSETS.find((a) => a.id === id);
const setupIds = ASSETS.filter((a) => a.group === 'setup').map((a) => a.id);

test('the status worker is its own worker, on its own address, with workers.dev off', () => {
  const cfg = JSON.parse(strip(read('wrangler.jsonc')));
  assert.equal(cfg.name, 'dude-and-daddy-status');
  assert.deepEqual(cfg.routes.map((r) => r.pattern), ['status.dudeanddaddy.com']);
  assert.equal(cfg.workers_dev, false, 'workers.dev would skip the Access sign-in');
  assert.equal(cfg.preview_urls, false);
  assert.deepEqual(cfg.triggers.crons, ['*/5 * * * *']);
  assert.equal(cfg.services.find((s) => s.binding === 'GAME').service, 'clean-up-on-aisle-scream');
  const studio = JSON.parse(strip(read('../wrangler.jsonc').replace(/"\$schema"[^\n]*\n/, '')));
  assert.equal(cfg.kv_namespaces.find((k) => k.binding === 'SIGNUP').id, studio.kv_namespaces.find((k) => k.binding === 'SIGNUP').id, 'the real news list, not a preview copy');
  for (const s of ['ADMIN_EMAILS', 'RESEND_API_KEY', 'ALERT_TO', 'SIGNUP_SECRET']) assert.ok(!(s in cfg.vars), s + ' is a secret');
  assert.match(cfg.vars.ACCESS_TEAM, /^[a-z0-9-]+$/);
});

test('every asset is well formed and belongs to a group', () => {
  const ids = new Set();
  for (const a of ASSETS) {
    assert.ok(!ids.has(a.id), 'duplicate id ' + a.id);
    ids.add(a.id);
    assert.ok(GROUPS.some((g) => g.id === a.group), a.id + ' group');
    assert.ok(['http', 'dns', 'vendor'].includes(a.kind), a.id + ' kind');
    if (a.kind === 'dns') assert.ok(a.host && a.type && a.expect && (a.expect.contains || a.group === 'setup'), a.id);
    else if (a.group === 'setup') assert.match(a.url, /^https?:\/\//, a.id);
    else assert.match(a.url, /^https:\/\//, a.id + ' (plain http only for setup items)');
    assert.equal(typeof a.public, 'boolean', a.id + ' says public or not');
    if (a.group === 'setup') { assert.equal(a.public, false, a.id); assert.ok(a.fix, a.id + ' says how to fix it'); }
  }
  for (const id of ['game-home', 'game-server', 'studio-home', 'news-signup', 'mail-in']) assert.ok(byId(id).public, id);
  assert.match(requestFor(ASSETS.find((a) => a.kind === 'dns')).url, /^https:\/\/cloudflare-dns\.com\/dns-query\?name=/);
});

test('requests carry their method and body', () => {
  assert.deepEqual(requestFor(byId('news-signup')).method, 'POST');
  assert.equal(requestFor(byId('news-signup')).body, '{}');
  assert.equal(requestFor(byId('news-signup')).headers['content-type'], 'application/json');
  assert.equal(requestFor(byId('game-home')).method, 'HEAD');
  assert.ok(!('body' in requestFor(byId('game-home'))));
  assert.equal(requestFor(byId('game-server')).method, 'GET');
});

test('judging http answers', () => {
  const sign = byId('news-signup');
  assert.equal(judge(sign, { status: 403, body: '{"ok":false,"error":"not from here"}' }).state, 'up');
  const closed = judge(sign, { status: 503, body: '{"ok":false,"error":"closed"}' });
  assert.equal(closed.state, 'down');
  assert.match(closed.note, /mail room is closed/);
  assert.equal(judge(sign, { status: 400, body: '' }).note, 'Answered 400, expected 403');
  const srv = byId('game-server');
  assert.equal(judge(srv, { status: 200, body: '{"ok":true,"board":true,"rooms":true}' }).state, 'up');
  assert.equal(judge(srv, { status: 200, body: '{"ok":false}' }).state, 'down');
  assert.equal(judge(srv, { status: 200, body: '<html>' }).state, 'down');
  assert.equal(judge(srv, { error: 'took longer than 10 seconds' }).state, 'down');
  assert.deepEqual(judge(byId('game-updates'), { status: 200, body: '<p>v30.1 is the latest &middot; 41 versions</p>' }), { state: 'up', note: 'Working', value: '30.1' });
  const fam = byId('game-family');
  assert.equal(judge(fam, { status: 302, location: 'https://bitter-mode-ad80.cloudflareaccess.com/cdn-cgi/access/login/x' }).state, 'up');
  assert.equal(judge(fam, { status: 200, body: 'open to all' }).state, 'down', 'the family site must never be open');
  assert.equal(judge(fam, { status: 302, location: 'https://evil.example/' }).state, 'down');
  const https = byId('setup-studio-https');
  assert.equal(judge(https, { status: 301, location: 'https://dudeanddaddy.com/' }).state, 'up');
  assert.equal(judge(https, { status: 200, body: '' }).state, 'down');
  assert.equal(judge(byId('studio-home'), { status: 200, body: '<title>DUDE &amp; DADDY | Father + Son Game Studio' }).state, 'up');
  assert.equal(judge(byId('studio-game-link'), { status: 301, location: 'https://cleanuponaislescream.com/' }).state, 'up');
});

test('judging DNS and provider answers', () => {
  const dns = (answers) => ({ status: 200, body: JSON.stringify({ Status: 0, Answer: answers.map((data) => ({ data })) }) });
  const mx = byId('mail-in');
  assert.equal(judge(mx, dns(['42 route3.mx.cloudflare.net.'])).state, 'up');
  assert.equal(judge(mx, dns([])).state, 'down');
  assert.match(judge(mx, dns(['10 mail.other.example.'])).note, /no longer mentions/);
  assert.equal(judge(mx, { status: 200, body: '{"Status":2}' }).state, 'down');
  const www = byId('setup-game-www');
  assert.equal(judge(www, dns(['104.21.0.1'])).state, 'up');
  assert.equal(judge(www, dns([])).state, 'down');
  const cf = byId('vendor-cloudflare');
  const v = (indicator, description) => ({ status: 200, body: JSON.stringify({ status: { indicator, description } }) });
  assert.equal(judge(cf, v('none', 'All Systems Operational')).state, 'up');
  assert.deepEqual(judge(cf, v('minor', 'Partially Degraded Service')), { state: 'degraded', note: 'Partially Degraded Service' });
  assert.equal(judge(cf, v('major', 'Major outage')).state, 'down');
  assert.equal(judge(cf, { status: 500, body: '' }).state, 'degraded', 'their page failing is not an outage of ours');
});

test('the public board hides private and setup items; setup never changes the overall state', () => {
  const now = 1_800_000_000_000;
  const latest = Object.fromEntries(ASSETS.map((a) => [a.id, { state: 'up', note: 'Working', ms: 100, ts: now, fails: 0 }]));
  const pub = board(latest);
  const items = pub.groups.flatMap((g) => g.items);
  assert.ok(items.length < ASSETS.length);
  assert.ok(items.every((i) => byId(i.id).public));
  assert.ok(!pub.groups.some((g) => g.id === 'setup'));
  assert.ok(items.every((i) => !('note' in i) && !('target' in i) && !('ms' in i) && !('fix' in i)), 'no internals on the public page');
  assert.equal(pub.overall, 'up');
  assert.equal(board({ ...latest, 'game-server': { state: 'down', note: 'x', ts: now, fails: 1 } }).overall, 'degraded');
  assert.equal(board({ ...latest, 'game-server': { state: 'down', note: 'x', ts: now, fails: 2 } }).overall, 'down');
  assert.equal(board({ ...latest, 'game-board': { state: 'down', note: 'x', ts: now, fails: 5 } }).overall, 'up', 'a private asset never turns the public page red');
  const setupDown = Object.fromEntries(setupIds.map((id) => [id, { state: 'down', note: 'x', ts: now, fails: 9 }]));
  assert.equal(board({ ...latest, ...setupDown }).overall, 'up');
  const con = board({ ...latest, ...setupDown }, { everything: true });
  assert.equal(con.overall, 'up', 'setup items never turn the console red either');
  const sg = con.groups.find((g) => g.id === 'setup');
  assert.equal(sg.ignore, true);
  assert.ok(sg.items.every((i) => i.fix && i.state === 'down'));
  assert.equal(con.groups.flatMap((g) => g.items).length, ASSETS.length);
  const minor = board({ ...latest, 'vendor-cloudflare': { state: 'degraded', note: 'Partially Degraded Service', ts: now } });
  assert.equal(minor.overall, 'up', "a provider's small trouble does not turn our page yellow");
  assert.equal(minor.groups.find((g) => g.id === 'vendors').state, 'degraded', 'but it is shown');
  assert.equal(board({ ...latest, 'vendor-cloudflare': { state: 'down', note: 'Major outage', ts: now, fails: 2 } }).overall, 'down');
  assert.equal(board(latest, { incidents: [{ id: 1, level: 'down', title: 'Co-op down', resolved_at: null }] }).overall, 'down');
  assert.equal(board(latest, { incidents: [{ id: 1, level: 'down', resolved_at: now }] }).overall, 'up');
});

test('90 days of uptime, grey where there were no checks', () => {
  const days = uptime([{ id: 'game-home', day: '2026-11-14', ok: 287, total: 288 }, { id: 'game-home', day: '2026-11-13', ok: 10, total: 10 }], '2026-11-14');
  assert.equal(days['game-home'].length, 90);
  assert.deepEqual(days['game-home'].at(-1), { day: '2026-11-14', pct: 99.7 });
  assert.equal(days['game-home'][0].pct, null);
  assert.equal(average(days['game-home']), 99.85);
  assert.equal(average(days['studio-home']), null);
});

test('Rob is emailed once when something breaks and once when it is back; never for providers or setup', () => {
  const up = { state: 'up', fails: 0 };
  const down = (fails) => ({ state: 'down', fails, note: 'Answered 500, expected 200' });
  assert.deepEqual(alertsFor({ 'game-server': up }, { 'game-server': down(1) }), []);
  const a = alertsFor({ 'game-server': down(1) }, { 'game-server': down(FAILS_BEFORE_ALERT) });
  assert.equal(a.length, 1);
  assert.equal(a[0].kind, 'down');
  assert.deepEqual(alertsFor({ 'game-server': down(2) }, { 'game-server': down(3) }), []);
  assert.equal(alertsFor({ 'game-server': down(3) }, { 'game-server': up })[0].kind, 'back');
  assert.deepEqual(alertsFor({ 'game-server': down(1) }, { 'game-server': up }), []);
  for (const id of ['vendor-cloudflare', 'vendor-claude', ...setupIds]) {
    assert.deepEqual(alertsFor({ [id]: down(1) }, { [id]: down(2) }), [], id);
    assert.equal(alerts(byId(id)), false, id);
  }
  const mail = alertMail(a);
  assert.match(mail.subject, /^DUDE & DADDY: Scores and co-op server not working/);
  assert.match(mail.text, /https:\/\/status\.dudeanddaddy\.com\/console/);
  assert.match(alertMail(alertsFor({ 'game-server': down(3) }, { 'game-server': up })).subject, /working again/);
});

test('notices are checked before they reach the public page', () => {
  assert.deepEqual(checkIncident({ title: '  Slow co-op ', message: 'On it', level: 'degraded' }), { ok: { title: 'Slow co-op', message: 'On it', level: 'degraded' } });
  assert.ok(checkIncident({ title: '', level: 'down' }).error);
  assert.ok(checkIncident({ title: 'x', level: 'panic' }).error);
  assert.equal(checkIncident({ title: 'a\u0000b'.padEnd(300, 'c'), level: 'info' }).ok.title.length, 120);
});

test('the news count reads every page of the list and today\'s count, and says when it is not connected', async () => {
  const keys = Array.from({ length: 2500 }, (_, i) => ({ name: `sub:p${i}@example.com` }));
  const kv = {
    async list({ prefix, cursor }) {
      assert.equal(prefix, 'sub:');
      const start = cursor ? Number(cursor) : 0;
      const page = keys.slice(start, start + 1000);
      const done = start + 1000 >= keys.length;
      return { keys: page, list_complete: done, ...(done ? {} : { cursor: String(start + 1000) }) };
    },
    async get(k) { return k === 'all:2026-11-14' ? '7' : null; },
  };
  assert.deepEqual(await newsStats(kv, Date.parse('2026-11-14T12:00:00Z')), { subscribers: 2500, more: false, confirmsToday: 7 });
  const endless = { async list() { return { keys: [{ name: 'sub:a' }], list_complete: false, cursor: 'x' }; }, async get() { return null; } };
  assert.deepEqual(await newsStats(endless), { subscribers: 20, more: true, confirmsToday: 0 });
  assert.match((await newsStats(undefined)).error, /SIGNUP/);
});

test('status pages load nothing from other hosts and run no inline script', () => {
  const csp = securityHeaders(new URL('https://status.dudeanddaddy.com/'))['content-security-policy'];
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /connect-src 'self'/);
  assert.match(csp, /frame-ancestors 'none'/);
  const pages = readdirSync(new URL('public/', root)).filter((x) => x.endsWith('.html'));
  assert.deepEqual(pages.sort(), ['console.html', 'index.html', 'locked.html']);
  for (const f of pages) {
    const html = read('public/' + f);
    assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/, f + ' inline script');
    assert.doesNotMatch(html, /\sstyle=/, f + ' inline style');
    assert.doesNotMatch(html, /(src|href)="\/\/|<(script|link)[^>]+(src|href)="https?:/, f + ' outside files');
  }
});

test('nothing left over from the Defib copy', () => {
  const walk = (dir) => readdirSync(new URL(dir, root)).flatMap((f) => {
    const p = dir + f;
    if (['node_modules', '.wrangler', 'fonts', 'package-lock.json'].includes(f)) return [];
    return statSync(new URL(p, root)).isDirectory() ? walk(p + '/') : [p];
  });
  const self = 'tests/status.test.mjs';
  for (const f of walk('')) {
    if (f === self || f.endsWith('.svg')) continue;
    assert.doesNotMatch(read(f), /defib|getdefib|\bpulse\b/i, f);
  }
});

// ---- the console's sign-in ticket ----
const b64url = (bytes) => Buffer.from(bytes).toString('base64url');
async function makeKeys() {
  const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const jwk = { ...(await crypto.subtle.exportKey('jwk', pair.publicKey)), kid: 'k1' };
  const sign = async (claims, head = { alg: 'RS256', kid: 'k1' }) => {
    const data = b64url(JSON.stringify(head)) + '.' + b64url(JSON.stringify(claims));
    const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(data));
    return data + '.' + b64url(new Uint8Array(sig));
  };
  return { jwk, sign };
}

test('only a real Access ticket for a listed address opens the console', async () => {
  const { jwk, sign } = await makeKeys();
  const other = await makeKeys();
  const env = { ACCESS_TEAM: 'bitter-mode-ad80', ACCESS_AUD: 'aud-tag-0123456789abcdef', ADMIN_EMAILS: 'Rob@Example.com, second@example.com' };
  const iss = 'https://bitter-mode-ad80.cloudflareaccess.com';
  const now = 1_800_000_000_000;
  const getKeys = async (origin) => { assert.equal(origin, iss); return [jwk]; };
  const good = { aud: [env.ACCESS_AUD], iss, email: 'rob@example.com', exp: now / 1000 + 600, nbf: now / 1000 - 5 };
  const check = (t, e = env) => checkTicket(t, e, { now, getKeys });
  assert.deepEqual(await check(await sign(good)), { email: 'rob@example.com' });
  assert.equal((await check(await sign({ ...good, email: 'stranger@example.com' }))).error, 'not on the list');
  assert.equal((await check(await sign({ ...good, aud: ['another-app-0000000000'] }))).error, 'wrong application');
  assert.equal((await check(await sign({ ...good, iss: 'https://evil.cloudflareaccess.com' }))).error, 'wrong issuer');
  assert.equal((await check(await sign({ ...good, exp: now / 1000 - 1 }))).error, 'expired');
  assert.equal((await check(await other.sign(good))).error, 'bad signature');
  assert.equal((await check(await sign(good, { alg: 'none', kid: 'k1' }))).error, 'wrong algorithm');
  assert.equal((await check(await sign(good, { alg: 'RS256', kid: 'nope' }))).error, 'unknown key');
  const t = await sign(good);
  const [h, , s] = t.split('.');
  assert.equal((await check(`${h}.${b64url(JSON.stringify({ ...good, email: 'second@example.com' }))}.${s}`)).error, 'bad signature');
  assert.equal((await check('')).error, 'bad ticket');
  for (const missing of ['ACCESS_TEAM', 'ACCESS_AUD', 'ADMIN_EMAILS']) assert.equal((await check(t, { ...env, [missing]: '' })).error, 'console not set up');
  assert.deepEqual(emailList(' A@x.com,,b@y.com '), ['a@x.com', 'b@y.com']);
  assert.equal(ticketFrom(new Request('https://x/', { headers: { 'cf-access-jwt-assertion': 'abc' } })), 'abc');
  assert.equal(ticketFrom(new Request('https://x/', { headers: { cookie: 'a=1; CF_Authorization=tok' } })), 'tok');
});
