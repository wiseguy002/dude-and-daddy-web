// Turning stored check results into what the pages show, and deciding when to email Rob.
// Pure, unit tested (status/tests/status.test.mjs).
import { ASSETS, GROUPS, alerts } from './assets.js';

export const RANK = { up: 0, degraded: 1, down: 2, unknown: 1 };
const worst = (states) => states.reduce((w, s) => (RANK[s] > RANK[w] ? s : w), 'up');

// Two bad checks in a row (ten minutes) before something counts as a problem: one blip is not news.
export const FAILS_BEFORE_ALERT = 2;

// latest: { [id]: { state, note, ms, ts, value?, fails } }. Returns the whole board.
// `everything` (the console) also includes the assets kept off the public page.
export function board(latest, { everything = false, days = {}, incidents = [] } = {}) {
  const show = ASSETS.filter((a) => everything || a.public);
  const groups = GROUPS.map((g) => {
    const items = show.filter((a) => a.group === g.id).map((a) => {
      const r = latest[a.id];
      // A single bad check shows as "checking again" (degraded), not "down".
      let state = r ? r.state : 'unknown';
      if (r && r.state === 'down' && (r.fails || 0) < FAILS_BEFORE_ALERT) state = 'degraded';
      const item = { id: a.id, name: a.name, state, uptime: days[a.id] || [] };
      if (everything) Object.assign(item, { note: r ? r.note : 'Not checked yet', ms: r ? r.ms : null, checked: r ? r.ts : null, value: r && r.value, target: a.url || `${a.host} (${a.type})`, manage: a.manage || a.page || null, public: !!a.public, ...(a.fix ? { fix: a.fix } : {}) });
      return item;
    });
    return { id: g.id, name: g.name, blurb: g.blurb, state: items.length ? worst(items.map((i) => i.state)) : 'up', items, ...(g.ignore ? { ignore: true } : {}) };
  }).filter((g) => g.items.length);
  const open = incidents.filter((i) => !i.resolved_at);
  // (setup items never count; a provider counts only when it is really down)
  let overall = worst(groups.map((g) => {
    const def = GROUPS.find((x) => x.id === g.id);
    if (def.ignore) return 'up';
    return def.advisory && g.state !== 'down' ? 'up' : g.state;
  }));
  for (const i of open) if (i.level === 'down' || i.level === 'degraded') overall = worst([overall, i.level]);
  const checked = Math.max(0, ...Object.values(latest).map((r) => r.ts || 0)) || null;
  return { overall, headline: HEADLINE[overall], checked, groups, incidents };
}

export const HEADLINE = {
  up: 'Everything is working',
  degraded: 'Some things are slow or being checked',
  down: 'Something is not working',
  unknown: 'Checking',
};

// rows: [{ id, day: 'YYYY-MM-DD', ok, total }]. Returns { [id]: [{ day, pct }] } for the last
// `n` days, oldest first, with null for days with no checks (shown grey, not green).
export function uptime(rows, today, n = 90) {
  const end = Date.parse(today + 'T00:00:00Z');
  const list = [];
  for (let i = n - 1; i >= 0; i--) list.push(new Date(end - i * 86400000).toISOString().slice(0, 10));
  const map = {};
  for (const r of rows) (map[r.id] ||= {})[r.day] = r;
  const out = {};
  for (const a of ASSETS) {
    out[a.id] = list.map((day) => {
      const r = (map[a.id] || {})[day];
      return { day, pct: r && r.total ? Math.round((r.ok / r.total) * 1000) / 10 : null };
    });
  }
  return out;
}

// One overall percentage over the days that had checks, or null.
export function average(days) {
  const seen = days.filter((d) => d.pct !== null);
  return seen.length ? Math.round((seen.reduce((s, d) => s + d.pct, 0) / seen.length) * 100) / 100 : null;
}

// What to tell Rob after a round of checks. prev / next are the `latest` maps before and after.
// An alert goes once when something has failed FAILS_BEFORE_ALERT times running, and once more
// when it is back. Providers and setup items are not emailed about: providers are someone else's to fix, and setup
// items are known and waiting.
export function alertsFor(prev, next) {
  const out = [];
  for (const a of ASSETS) {
    if (!alerts(a)) continue;
    const before = prev[a.id];
    const now = next[a.id];
    if (!now) continue;
    if (now.state === 'down' && now.fails === FAILS_BEFORE_ALERT) out.push({ id: a.id, name: a.name, kind: 'down', note: now.note });
    if (now.state === 'up' && before && before.state === 'down' && (before.fails || 0) >= FAILS_BEFORE_ALERT) out.push({ id: a.id, name: a.name, kind: 'back', note: now.note });
  }
  return out;
}

export function alertMail(alerts, origin = 'https://status.dudeanddaddy.com') {
  const down = alerts.filter((a) => a.kind === 'down');
  const back = alerts.filter((a) => a.kind === 'back');
  const subject = down.length
    ? `DUDE & DADDY: ${down.map((a) => a.name).join(', ')} not working`
    : `DUDE & DADDY: ${back.map((a) => a.name).join(', ')} working again`;
  const lines = [
    ...down.map((a) => `NOT WORKING: ${a.name}. ${a.note}.`),
    ...back.map((a) => `Working again: ${a.name}.`),
    '',
    `Console: ${origin}/console`,
    `Public status page: ${origin}/`,
  ];
  return { subject, text: lines.join('\n') };
}

// A notice Rob writes on the console ("Co-op is slow tonight, we're on it"). Returns { ok } or { error }.
export const LEVELS = ['info', 'degraded', 'down', 'maintenance'];
export function checkIncident(body) {
  const title = clean(body && body.title, 120);
  const message = clean(body && body.message, 2000);
  const level = body && LEVELS.includes(body.level) ? body.level : null;
  if (!title) return { error: 'Give the notice a short title.' };
  if (!level) return { error: 'Pick how serious it is.' };
  return { ok: { title, message, level } };
}
function clean(v, max) {
  return typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max) : '';
}
