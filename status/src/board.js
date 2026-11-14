// StatusBoard: the one small database behind status.dudeanddaddy.com. Runs the checks (every five
// minutes from the cron, or when Rob presses "Check now"), keeps the latest answer for each asset,
// a daily tally for the 90-day bars, a log of every change, and the notices Rob posts.
// Only the worker (src/worker.js) can reach it.
import { ASSETS, judge, requestFor } from './assets.js';
import { board, uptime, alertsFor, alertMail, checkIncident } from './summary.js';

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
const DAY = 86400000;
const MIN_GAP = 60000; // "Check now" at most once a minute
const TIMEOUT = 10000;

export class StatusBoard {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sql = state.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS latest (id TEXT PRIMARY KEY, state TEXT NOT NULL, note TEXT, ms INTEGER, ts INTEGER NOT NULL, value TEXT, fails INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS daily (day TEXT NOT NULL, id TEXT NOT NULL, ok INTEGER NOT NULL, total INTEGER NOT NULL, PRIMARY KEY (day, id));
      CREATE TABLE IF NOT EXISTS changes (ts INTEGER NOT NULL, id TEXT NOT NULL, state TEXT NOT NULL, note TEXT);
      CREATE TABLE IF NOT EXISTS incidents (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, title TEXT NOT NULL, message TEXT, level TEXT NOT NULL, resolved_at INTEGER);
      CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);
    `);
  }
  all(q, ...a) { return [...this.sql.exec(q, ...a)]; }
  one(q, ...a) { return this.all(q, ...a)[0] || null; }

  latest() {
    const out = {};
    for (const r of this.all('SELECT * FROM latest')) out[r.id] = { state: r.state, note: r.note, ms: r.ms, ts: r.ts, fails: r.fails, ...(r.value ? { value: r.value } : {}) };
    return out;
  }

  // Fetches one asset; never throws.
  async probe(asset) {
    const { url, method, headers, body: sent } = requestFor(asset);
    const t0 = Date.now();
    try {
      const res = await fetch(url, { method, headers, ...(sent !== undefined ? { body: sent } : {}), redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT) });
      const body = (await res.text()).slice(0, 300000);
      const loc = res.headers.get('location');
      // A redirect may name just a path; judge the full address a browser would go to.
      return { res: { status: res.status, location: loc ? new URL(loc, url).href : '', body }, ms: Date.now() - t0 };
    } catch (e) {
      return { res: { error: e && e.name === 'TimeoutError' ? 'took longer than 10 seconds' : String((e && e.message) || e).slice(0, 120) }, ms: Date.now() - t0 };
    }
  }

  async run(now = Date.now(), { force = false } = {}) {
    const last = Number((this.one("SELECT v FROM meta WHERE k='ran'") || {}).v || 0);
    if (!force && now - last < MIN_GAP) return { skipped: true, ran: last };
    this.sql.exec("INSERT INTO meta (k, v) VALUES ('ran', ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v", String(now));
    const prev = this.latest();
    const results = await Promise.all(ASSETS.map(async (a) => ({ a, ...(await this.probe(a)) })));
    const day = new Date(now).toISOString().slice(0, 10);
    const next = {};
    for (const { a, res, ms } of results) {
      const v = judge(a, res);
      const before = prev[a.id];
      const fails = v.state === 'down' ? ((before && before.state === 'down' ? before.fails : 0) + 1) : 0;
      next[a.id] = { ...v, ms, ts: now, fails };
      this.sql.exec(
        'INSERT INTO latest (id, state, note, ms, ts, value, fails) VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state, note=excluded.note, ms=excluded.ms, ts=excluded.ts, value=excluded.value, fails=excluded.fails',
        a.id, v.state, v.note, ms, now, v.value || null, fails,
      );
      // "Up" for uptime means it worked; a provider saying "minor" still counts against their bar, not ours.
      this.sql.exec('INSERT INTO daily (day, id, ok, total) VALUES (?,?,?,1) ON CONFLICT(day, id) DO UPDATE SET ok=ok+excluded.ok, total=total+1', day, a.id, v.state === 'up' ? 1 : 0);
      if (!before || before.state !== v.state) this.sql.exec('INSERT INTO changes (ts, id, state, note) VALUES (?,?,?,?)', now, a.id, v.state, v.note);
    }
    this.sql.exec('DELETE FROM changes WHERE ts < ?', now - 90 * DAY);
    this.sql.exec('DELETE FROM daily WHERE day < ?', new Date(now - 120 * DAY).toISOString().slice(0, 10));
    const alerts = alertsFor(prev, next);
    const mailed = alerts.length ? await this.mail(alerts) : null;
    return { ran: now, alerts: alerts.length, mailed };
  }

  // Emails Rob through Resend, from status@beepboopmail.com (the studio's sending domain). Without the key and address set, it only logs.
  async mail(alerts) {
    const { RESEND_API_KEY: key, ALERT_TO: to } = this.env;
    const mail = alertMail(alerts);
    if (!key || !to) { console.log('status alert (email not set up):', mail.subject); return 'not set up'; }
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: 'Bearer ' + key, 'content-type': 'application/json' },
        body: JSON.stringify({ from: 'DUDE & DADDY Status <status@beepboopmail.com>', to: to.split(',').map((s) => s.trim()).filter(Boolean), subject: mail.subject, text: mail.text }),
      });
      return res.ok ? 'sent' : 'refused ' + res.status;
    } catch { return 'failed'; }
  }

  view(everything, now = Date.now()) {
    const today = new Date(now).toISOString().slice(0, 10);
    const days = uptime(this.all('SELECT id, day, ok, total FROM daily'), today, 90);
    // The public page shows open notices and those closed in the last week.
    const incidents = this.all('SELECT * FROM incidents WHERE resolved_at IS NULL OR resolved_at > ? ORDER BY created_at DESC LIMIT 50', everything ? now - 60 * DAY : now - 7 * DAY);
    const out = board(this.latest(), { everything, days, incidents });
    if (everything) out.changes = this.all('SELECT ts, id, state, note FROM changes ORDER BY ts DESC LIMIT 100');
    return out;
  }

  async fetch(req) {
    const url = new URL(req.url);
    const parts = url.pathname.split('/').filter(Boolean);
    const body = req.method === 'POST' || req.method === 'PATCH' ? await req.json().catch(() => ({})) : {};
    const now = Date.now();
    if (parts[0] === 'run' && req.method === 'POST') return json(await this.run(now, { force: !!body.force }));
    if (parts[0] === 'public' && req.method === 'GET') return json(this.view(false, now));
    if (parts[0] === 'console' && req.method === 'GET') return json(this.view(true, now));
    if (parts[0] === 'incidents' && !parts[1] && req.method === 'POST') {
      const c = checkIncident(body);
      if (c.error) return json({ error: c.error }, 400);
      this.sql.exec('INSERT INTO incidents (created_at, updated_at, title, message, level) VALUES (?,?,?,?,?)', now, now, c.ok.title, c.ok.message, c.ok.level);
      return json({ incident: this.one('SELECT * FROM incidents ORDER BY id DESC LIMIT 1') });
    }
    if (parts[0] === 'incidents' && /^\d+$/.test(parts[1] || '') && req.method === 'PATCH') {
      const had = this.one('SELECT * FROM incidents WHERE id=?', Number(parts[1]));
      if (!had) return json({ error: 'No such notice.' }, 404);
      if (body.resolved === true) this.sql.exec('UPDATE incidents SET resolved_at=?, updated_at=? WHERE id=?', now, now, had.id);
      else if (body.resolved === false) this.sql.exec('UPDATE incidents SET resolved_at=NULL, updated_at=? WHERE id=?', now, had.id);
      if (body.title !== undefined || body.message !== undefined || body.level !== undefined) {
        const c = checkIncident({ title: had.title, message: had.message, level: had.level, ...body });
        if (c.error) return json({ error: c.error }, 400);
        this.sql.exec('UPDATE incidents SET title=?, message=?, level=?, updated_at=? WHERE id=?', c.ok.title, c.ok.message, c.ok.level, now, had.id);
      }
      return json({ incident: this.one('SELECT * FROM incidents WHERE id=?', had.id) });
    }
    return json({ error: 'Not found.' }, 404);
  }
}
