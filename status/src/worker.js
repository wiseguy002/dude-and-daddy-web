// dude-and-daddy-status: status.dudeanddaddy.com. The public status page (/), Rob's console (/console), and the
// checker that runs every five minutes (the cron in wrangler.jsonc). It watches both the studio (dudeanddaddy.com) and
// the game (cleanuponaislescream.com): the list is src/assets.js.
//
//   GET  /api/status                      public: the board, minus console-only assets
//   GET  /api/console                     console: everything, with notes, timings, change log
//   POST /api/console/check               console: run every check now
//   POST /api/console/incidents           console: post a notice on the public page
//   PATCH /api/console/incidents/:id      console: edit or resolve a notice
//   GET  /api/console/app                 console: news-list numbers and the game server's own health answer
export { StatusBoard } from './board.js';
import { checkTicket, ticketFrom } from './access.js';
import { securityHeaders, isLocalHost } from './headers.js';

const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...extra } });
const boardStub = (env) => env.BOARD.get(env.BOARD.idFromName('dude-and-daddy'));
const toBoard = (env, path, init) => boardStub(env).fetch('https://board' + path, init);
const GAME = 'https://cleanuponaislescream.com';

// Who is at the console, or null. On a developer's own machine only, DEV_OPEN_CONSOLE opens it
// without Access so the pages can be tried; it is never set on the real worker.
export async function consoleUser(req, env, url, opts) {
  if (isLocalHost(url.hostname) && env.DEV_OPEN_CONSOLE === 'local-only') return { email: 'developer@localhost' };
  const res = await checkTicket(ticketFrom(req), env, opts);
  if (res.error) { console.log('console refused:', res.error); return null; }
  return res;
}

// The console's own numbers: the news list (read straight from the studio's SIGNUP storage, never written) and the
// game server's health answer. Each part says "not connected" on its own if its binding is missing.
const NEWS_MAX_PAGES = 20; // 20 000 subscribers before the count says "20 000+"
export async function newsStats(kv, now = Date.now()) {
  if (!kv || typeof kv.list !== 'function') return { error: 'The console cannot see the news list yet (the SIGNUP binding is missing).' };
  let subscribers = 0;
  let cursor;
  let more = false;
  for (let i = 0; i < NEWS_MAX_PAGES; i++) {
    const page = await kv.list({ prefix: 'sub:', ...(cursor ? { cursor } : {}) });
    subscribers += page.keys.length;
    if (page.list_complete) { more = false; break; }
    cursor = page.cursor;
    more = true;
  }
  const day = new Date(now).toISOString().slice(0, 10);
  const confirmsToday = Number(await kv.get('all:' + day)) || 0;
  return { subscribers, more, confirmsToday };
}

async function gameHealth(env) {
  const req = new Request(GAME + '/api/health');
  try {
    const res = await (env.GAME ? env.GAME.fetch(req) : fetch(req));
    const data = await res.json().catch(() => null);
    return data && typeof data === 'object' ? { status: res.status, ...data } : { error: `The game answered ${res.status}.` };
  } catch {
    return { error: 'The game server did not answer.' };
  }
}

async function consoleApi(req, env, url) {
  const user = await consoleUser(req, env, url);
  if (!user) return json({ error: 'Sign in to open the console.' }, 401);
  // Every change must come from the console page itself, not from another website.
  if (req.method !== 'GET' && req.headers.get('origin') !== url.origin) return json({ error: 'Not allowed.' }, 403);
  const parts = url.pathname.split('/').filter(Boolean).slice(2); // after /api/console
  const body = req.method === 'POST' || req.method === 'PATCH' ? await req.text() : undefined;
  if (body && body.length > 10000) return json({ error: 'That is too large.' }, 413);
  const pass = (path) => toBoard(env, path, { method: req.method, body, headers: { 'content-type': 'application/json' } });
  if (!parts[0] && req.method === 'GET') {
    const res = await (await pass('/console')).json();
    return json({ ...res, you: user.email });
  }
  if (parts[0] === 'check' && !parts[1] && req.method === 'POST') {
    const ran = await (await toBoard(env, '/run', { method: 'POST', body: '{}' })).json();
    return json(ran.skipped ? { ...ran, note: 'Checked less than a minute ago. Showing those results.' } : ran);
  }
  if (parts[0] === 'incidents' && ((!parts[1] && req.method === 'POST') || (parts[1] && !parts[2] && req.method === 'PATCH'))) {
    const res = await pass('/incidents' + (parts[1] ? '/' + encodeURIComponent(parts[1]) : ''));
    return new Response(res.body, { status: res.status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
  }
  if (parts[0] === 'app' && !parts[1] && req.method === 'GET') {
    const [news, game] = await Promise.all([newsStats(env.SIGNUP).catch(() => ({ error: 'Could not read the news list.' })), gameHealth(env)]);
    return json({ news, game });
  }
  return json({ error: 'Not found.' }, 404);
}

async function handle(req, env, url) {
  if (url.pathname === '/api/status') {
    if (req.method !== 'GET') return json({ error: 'Not allowed.' }, 405);
    const res = await toBoard(env, '/public');
    return new Response(res.body, { status: res.status, headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=30' } });
  }
  if (url.pathname === '/api/console' || url.pathname.startsWith('/api/console/')) return consoleApi(req, env, url);
  if (url.pathname.startsWith('/api/')) return json({ error: 'Not found.' }, 404);
  if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('Not allowed.\n', { status: 405 });
  // The console page itself is shown only to someone allowed in; everyone else sees the locked page.
  // (Asked for without .html: the assets answer /x.html with a redirect to /x.)
  if (url.pathname === '/console' || url.pathname === '/console/' || url.pathname === '/console.html') {
    const user = await consoleUser(req, env, url);
    const page = await env.ASSETS.fetch(new Request(new URL(user ? '/console' : '/locked', url), req));
    return new Response(page.body, { status: user ? 200 : 401, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
  }
  if (url.pathname === '/locked.html' || url.pathname === '/locked') return new Response(null, { status: 302, headers: { location: '/console' } });
  return env.ASSETS.fetch(req);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.protocol === 'http:' && !isLocalHost(url.hostname)) {
      url.protocol = 'https:';
      return new Response(null, { status: 301, headers: { location: url.toString() } });
    }
    const res = await handle(req, env, url);
    const out = new Response(res.body, res);
    for (const [k, v] of Object.entries(securityHeaders(url))) out.headers.set(k, v);
    return out;
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(toBoard(env, '/run', { method: 'POST', body: JSON.stringify({ force: true }) }));
  },
};
