// The status worker (src/worker.js) run for real in Miniflare: the checker, the public page's data, the console's
// lock and its numbers. Nothing reaches the internet: every outside call is answered here the way the live sites
// answered on 2026-11-14. Run from status/: `npm run test:worker`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';
import { fileURLToPath } from 'node:url';
import { ASSETS } from '../src/assets.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const ORIGIN = 'https://status.dudeanddaddy.com';
const TEAM = 'bitter-mode-ad80';
const ISS = `https://${TEAM}.cloudflareaccess.com`;
const AUD = 'aud-tag-integration-000000000000';

const b64url = (v) => Buffer.from(typeof v === 'string' ? v : new Uint8Array(v)).toString('base64url');
const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const jwk = { ...(await crypto.subtle.exportKey('jwk', pair.publicKey)), kid: 'k1' };
async function ticket(email, extra = {}) {
  const data = b64url(JSON.stringify({ alg: 'RS256', kid: 'k1' })) + '.' + b64url(JSON.stringify({ aud: [AUD], iss: ISS, email, exp: Math.floor(Date.now() / 1000) + 600, ...extra }));
  return data + '.' + b64url(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(data)));
}

// What the outside world answers. `broken` lists URLs that fail.
const broken = new Set();
const calls = [];
const mails = [];
async function world(req) {
  const url = req.url;
  const body = req.method === 'POST' ? await req.text() : '';
  calls.push({ url, method: req.method, body });
  const page = (status, text, headers = {}) => new Response(req.method === 'HEAD' ? null : text, { status, headers });
  if (broken.has(url)) return page(503, 'down');
  if (url === ISS + '/cdn-cgi/access/certs') return Response.json({ keys: [jwk] });
  if (url.startsWith('https://cloudflare-dns.com/')) {
    const name = new URL(url).searchParams.get('name');
    const type = new URL(url).searchParams.get('type');
    const data = {
      'dudeanddaddy.com:MX': '42 route3.mx.cloudflare.net.',
      'dudeanddaddy.com:TXT': '"v=spf1 include:_spf.mx.cloudflare.net ~all"',
      'resend._domainkey.beepboopmail.com:TXT': '"p=MIGfMA0GCSq"',
      'send.beepboopmail.com:TXT': '"v=spf1 include:amazonses.com ~all"',
      '_dmarc.beepboopmail.com:TXT': '"v=DMARC1; p=quarantine;"',
      // (www.cleanuponaislescream.com and _dmarc.dudeanddaddy.com: nothing, as live)
    }[name + ':' + type];
    return Response.json({ Status: 0, Answer: data ? [{ data }] : [] });
  }
  if (url.endsWith('/api/v2/status.json')) return Response.json({ status: { indicator: 'none', description: 'All Systems Operational' } });
  if (url === 'https://api.resend.com/emails') { mails.push(JSON.parse(body)); return Response.json({ id: 'x' }); }
  const G = 'https://cleanuponaislescream.com';
  const S = 'https://dudeanddaddy.com';
  if (url === G + '/') return page(200, '<!doctype html><title>Clean Up on Aisle Scream</title>');
  if (url === G + '/api/health') return Response.json({ ok: true, board: true, rooms: true });
  if (url === G + '/api/board') return page(426, 'this is for the game');
  if (url === G + '/how-to-play/') return page(200, '<title>How to Play | Clean Up On Aisle Scream!</title>');
  if (url === G + '/updates/') return page(200, '<p>v30.1 is the latest &middot; 41 versions so far</p>');
  if (url === G + '/zz-status-probe') return page(404, '<title>Wet floor</title>');
  if (url === 'https://family.cleanuponaislescream.com/') return page(302, '', { location: ISS + '/cdn-cgi/access/login/family.cleanuponaislescream.com?kid=x' });
  if (url === 'https://dudeanddaddy.itch.io/clean-up-on-aisle-scream') return page(200, '<title>Clean Up On Aisle SCREAM! by DUDE &amp; DADDY</title>');
  if (url === S + '/' || url === 'https://www.dudeanddaddy.com/' || url === S + '/diary/') return page(200, '<title>DUDE &amp; DADDY | Father + Son Game Studio</title>');
  if (url === S + '/game/') return page(301, '', { location: G + '/' });
  if (url === S + '/press/') return page(200, '<h1>Press kit</h1><p>press contact</p>');
  if (url === S + '/press/dude-and-daddy-press-kit.zip') return page(200, 'zip');
  if (url === S + '/zz-status-probe') return page(404, '<title>Aisle closed | DUDE &amp; DADDY</title>');
  if (url === S + '/api/subscribe') {
    if (req.method !== 'POST') return Response.json({ ok: false, error: 'not found' }, { status: 404 });
    if (!req.headers.get('origin')) return Response.json({ ok: false, error: 'not from here' }, { status: 403 });
    return Response.json({ ok: true });
  }
  // plain http: today both sites still answer 200 instead of switching to https
  if (url.startsWith('http://')) return page(200, '<!doctype html>');
  return page(599, 'unexpected call: ' + url);
}

const gameCalls = [];
function gameService(req) {
  gameCalls.push(new URL(req.url).pathname);
  return Response.json({ ok: true, board: true, rooms: true });
}

// The static files, served from public/ as the assets binding would (with html_handling: /console → console.html).
function assets(req) {
  const path = new URL(req.url).pathname;
  const file = ROOT + 'public' + (path.endsWith('/') ? path + 'index.html' : existsSync(ROOT + 'public' + path) ? path : path + '.html');
  if (!existsSync(file)) return new Response('not found', { status: 404 });
  return new Response(readFileSync(file), { headers: { 'content-type': file.endsWith('.html') ? 'text/html' : 'application/octet-stream' } });
}

const bundle = (await build({ entryPoints: [ROOT + 'src/worker.js'], bundle: true, format: 'esm', write: false, platform: 'browser', logLevel: 'silent' })).outputFiles[0].text;
async function start(bindings) {
  const mf = new Miniflare({
    modules: [{ type: 'ESModule', path: 'worker.mjs', contents: bundle }],
    compatibilityDate: '2025-09-01',
    durableObjects: { BOARD: { className: 'StatusBoard', useSQLite: true } },
    kvNamespaces: ['SIGNUP'],
    bindings: { ACCESS_TEAM: TEAM, ACCESS_AUD: AUD, ADMIN_EMAILS: 'rob@example.com', ...bindings },
    serviceBindings: { ASSETS: assets, GAME: gameService },
    outboundService: world,
  });
  await mf.ready;
  return mf;
}

test('status worker', async (t) => {
  const mf = await start({ RESEND_API_KEY: 're_test', ALERT_TO: 'rob@example.com' });
  t.after(() => mf.dispose());
  const kv = await mf.getKVNamespace('SIGNUP');
  for (const e of ['a@example.com', 'b@example.com', 'c@example.com']) await kv.put('sub:' + e, '1');
  await kv.put('sent:2026:x', '1');
  await kv.put('all:' + new Date().toISOString().slice(0, 10), '4');
  const rob = { 'cf-access-jwt-assertion': await ticket('rob@example.com') };
  const get = (path, headers = {}) => mf.dispatchFetch(ORIGIN + path, { headers });
  const send = (path, method, body, headers = {}) => mf.dispatchFetch(ORIGIN + path, { method, headers: { 'content-type': 'application/json', origin: ORIGIN, ...headers }, body: JSON.stringify(body) });
  const ns = await mf.getDurableObjectNamespace('BOARD');
  const run = () => ns.get(ns.idFromName('dude-and-daddy')).fetch('https://board/run', { method: 'POST', body: '{"force":true}' }).then((r) => r.json());

  await t.test('before any check the public page says so, with security headers', async () => {
    const res = await get('/api/status');
    assert.equal(res.status, 200);
    assert.equal((await res.json()).checked, null);
    assert.match(res.headers.get('content-security-policy'), /default-src 'none'/);
    const html = await (await get('/')).text();
    assert.match(html, /DUDE &amp; DADDY/);
  });

  await t.test('plain http is sent to https on the real address', async () => {
    const res = await mf.dispatchFetch('http://status.dudeanddaddy.com/console', { redirect: 'manual' });
    assert.equal(res.status, 301);
    assert.equal(res.headers.get('location'), 'https://status.dudeanddaddy.com/console');
  });

  await t.test('the console is locked without a good ticket, page and API alike', async () => {
    assert.equal((await get('/api/console')).status, 401);
    assert.equal((await get('/api/console', { 'cf-access-jwt-assertion': await ticket('stranger@example.com') })).status, 401);
    assert.equal((await get('/api/console', { 'cf-access-jwt-assertion': await ticket('rob@example.com', { aud: ['other-app'] }) })).status, 401);
    assert.equal((await get('/api/console', { 'cf-access-jwt-assertion': await ticket('rob@example.com', { exp: Math.floor(Date.now() / 1000) - 5 }) })).status, 401);
    assert.equal((await get('/api/console/app')).status, 401);
    for (const p of ['/console', '/console.html', '/console/']) {
      const page = await get(p);
      assert.equal(page.status, 401, p);
      const text = await page.text();
      assert.match(text, /Employees only/, p);
      assert.doesNotMatch(text, /console\.js/, p + ' never sends the console page');
    }
    assert.equal((await send('/api/console/check', 'POST', {})).status, 401);
    const open = await get('/console', rob);
    assert.equal(open.status, 200);
    assert.match(await open.text(), /Back office/);
  });

  await t.test('a run makes every check; the public page shows only public ones and stays green despite setup items', async () => {
    const before = calls.length;
    const ran = await (await send('/api/console/check', 'POST', {}, rob)).json();
    assert.ok(ran.ran);
    const made = calls.slice(before);
    assert.ok(!made.some((c) => c.url.includes('unexpected')));
    for (const a of ASSETS) {
      const want = a.kind === 'dns' ? `name=${encodeURIComponent(a.host)}&type=${a.type}` : a.url;
      assert.ok(made.some((c) => (a.kind === 'dns' ? c.url.includes(want) : c.url === want)), 'checked ' + a.id);
    }
    const signup = made.find((c) => c.url === 'https://dudeanddaddy.com/api/subscribe');
    assert.equal(signup.method, 'POST');
    assert.equal(signup.body, '{}');
    assert.equal(made.find((c) => c.url === 'https://cleanuponaislescream.com/').method, 'HEAD');
    const pub = await (await get('/api/status')).json();
    assert.equal(pub.overall, 'up', JSON.stringify(pub.groups));
    const ids = pub.groups.flatMap((g) => g.items.map((i) => i.id));
    const priv = ASSETS.filter((a) => !a.public).map((a) => a.id);
    assert.ok(ids.includes('game-server') && ids.includes('news-signup'));
    assert.ok(!ids.some((id) => priv.includes(id)), 'no private or setup items in public');
    assert.ok(!pub.groups.some((g) => g.id === 'setup'));
    const all = await (await get('/api/console', rob)).json();
    assert.equal(all.you, 'rob@example.com');
    assert.equal(all.overall, 'up');
    const items = all.groups.flatMap((g) => g.items);
    assert.equal(items.length, ASSETS.length);
    assert.equal(items.find((i) => i.id === 'game-updates').value, '30.1');
    const setup = all.groups.find((g) => g.id === 'setup').items;
    // (after one check a failure shows as "re-checking"; it is down from the second)
    assert.ok(setup.length === 4 && setup.every((i) => i.state !== 'up' && i.fix), 'the four known setup items show as to fix');
    for (const i of items.filter((x) => x.id.startsWith('setup-') === false)) assert.equal(i.state, 'up', i.id + ': ' + i.note);
    assert.ok(all.changes.length > 0);
    assert.equal((await (await send('/api/console/check', 'POST', {}, rob)).json()).skipped, true, 'Check now at most once a minute');
  });

  await t.test('the console numbers: news subscribers from KV and the game over its binding', async () => {
    const app = await (await get('/api/console/app', rob)).json();
    assert.deepEqual(app.news, { subscribers: 3, more: false, confirmsToday: 4 });
    assert.equal(app.game.ok, true);
    assert.equal(app.game.board, true);
    assert.ok(gameCalls.includes('/api/health'));
  });

  await t.test('two failures in a row turn the page red and email Rob once; setup and providers never do', async () => {
    mails.length = 0;
    broken.add('https://cleanuponaislescream.com/api/health');
    broken.add('https://www.cloudflarestatus.com/api/v2/status.json');
    const first = await run();
    assert.equal(first.alerts, 0);
    assert.equal((await (await get('/api/status')).json()).overall, 'degraded');
    const second = await run();
    assert.equal(second.alerts, 1, 'just the game server: not the provider, not setup items');
    assert.equal(second.mailed, 'sent');
    assert.equal((await (await get('/api/status')).json()).overall, 'down');
    assert.equal(mails.length, 1);
    assert.equal(mails[0].from, 'DUDE & DADDY Status <status@beepboopmail.com>');
    assert.deepEqual(mails[0].to, ['rob@example.com']);
    assert.match(mails[0].subject, /^DUDE & DADDY: Scores and co-op server not working/);
    assert.match(mails[0].text, /status\.dudeanddaddy\.com\/console/);
    assert.equal((await run()).alerts, 0, 'not again on the third');
    broken.delete('https://cleanuponaislescream.com/api/health');
    broken.delete('https://www.cloudflarestatus.com/api/v2/status.json');
    assert.equal((await run()).alerts, 1, 'back');
    assert.equal(mails.length, 2);
    assert.match(mails[1].subject, /working again/);
    for (let i = 0; i < 3; i++) assert.equal((await run()).alerts, 0, 'setup items stay down without emails');
  });

  await t.test('notices: posted from the console page only, shown publicly, resolved', async () => {
    assert.equal((await send('/api/console/incidents', 'POST', { title: 'Slow co-op', level: 'degraded' }, { ...rob, origin: 'https://evil.example' })).status, 403);
    assert.equal((await mf.dispatchFetch(ORIGIN + '/api/console/incidents', { method: 'POST', headers: { ...rob, 'content-type': 'application/json' }, body: '{"title":"x","level":"info"}' })).status, 403, 'no Origin = refused');
    assert.equal((await send('/api/console/incidents', 'POST', { title: '', level: 'degraded' }, rob)).status, 400);
    const made = await (await send('/api/console/incidents', 'POST', { title: 'Slow co-op', message: 'On it.', level: 'degraded' }, rob)).json();
    let pub = await (await get('/api/status')).json();
    assert.equal(pub.incidents[0].title, 'Slow co-op');
    assert.equal(pub.overall, 'degraded');
    assert.equal((await send('/api/console/incidents/' + made.incident.id, 'PATCH', { resolved: true }, rob)).status, 200);
    pub = await (await get('/api/status')).json();
    assert.ok(pub.incidents[0].resolved_at);
    assert.equal(pub.overall, 'up');
    assert.equal((await send('/api/console/incidents/999', 'PATCH', { resolved: true }, rob)).status, 404);
  });

  await t.test('without alert settings, alerts are only logged', async () => {
    const bare = await start({});
    const bns = await bare.getDurableObjectNamespace('BOARD');
    const r = () => bns.get(bns.idFromName('dude-and-daddy')).fetch('https://board/run', { method: 'POST', body: '{"force":true}' }).then((x) => x.json());
    broken.add('https://dudeanddaddy.com/');
    await r();
    const second = await r();
    broken.delete('https://dudeanddaddy.com/');
    assert.equal(second.mailed, 'not set up');
    const app = await (await bare.dispatchFetch(ORIGIN + '/api/console/app', { headers: rob })).json();
    assert.equal(app.news.subscribers, 0);
    await bare.dispose();
  });

  await t.test('the local-only open console never works on the real address', async () => {
    const dev = await start({ DEV_OPEN_CONSOLE: 'local-only', ADMIN_EMAILS: '' });
    assert.equal((await dev.dispatchFetch(ORIGIN + '/api/console')).status, 401);
    assert.equal((await dev.dispatchFetch('http://localhost:8793/api/console')).status, 200);
    assert.equal((await dev.dispatchFetch('http://127.0.0.1:8793/console')).status, 200);
    await dev.dispose();
    const locked = await start({ ADMIN_EMAILS: '' });
    assert.equal((await locked.dispatchFetch(ORIGIN + '/api/console', { headers: rob })).status, 401, 'no list = nobody in');
    await locked.dispose();
  });
});
