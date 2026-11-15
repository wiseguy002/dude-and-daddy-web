// Everything of DUDE & DADDY's the status worker watches (the studio site, the game, the news list, mail) and how
// each answer is judged. Pure, unit tested (status/tests/status.test.mjs). Add an asset here and it is checked,
// stored and shown everywhere.
//
// kind:   'http' fetches `url` without following redirects (method GET unless `method` says HEAD/POST, with `body`);
//         'dns' asks Cloudflare's public resolver for `host` / `type`; 'vendor' reads a provider's own status file.
// public: true shows it on status.dudeanddaddy.com; false keeps it to the console (Rob only).
// expect: status (number), location (redirect target starts with), contains (text in the body),
//         json (a key the JSON answer must have), jsonTrue (a key that must be true).
// valueRe: a pattern whose first group is shown as the asset's value (a version number, say).
// Group `setup` holds "should be fixed" items: shown on the console, never public, never emailed, never turning
// anything yellow.

export const GROUPS = [
  { id: 'game', name: 'Clean Up On Aisle Scream!', blurb: 'cleanuponaislescream.com: the game, its scores and co-op' },
  { id: 'studio', name: 'DUDE & DADDY studio site', blurb: 'dudeanddaddy.com: the studio, the press kit and the dev diary' },
  { id: 'news', name: 'Store News list', blurb: 'Signing up for news by email' },
  { id: 'mail', name: 'Email', blurb: 'Mail to hello@dudeanddaddy.com, and the mail we send' },
  { id: 'vendors', name: 'Services we rely on', blurb: 'Cloudflare, Resend, GitHub and Claude, as they report themselves', advisory: true },
  // advisory: a provider's small trouble somewhere (they nearly always have some) is shown but does not turn our page
  // yellow; only a major outage of theirs counts.
  { id: 'setup', name: 'Setup to fix', blurb: 'Not outages: settings that should be changed once', ignore: true },
];

const CF = 'https://dash.cloudflare.com/?to=/:account';
const GAME = 'https://cleanuponaislescream.com';
const STUDIO = 'https://dudeanddaddy.com';

export const ASSETS = [
  // ---- the game ----
  { id: 'game-home', group: 'game', public: true, name: 'The game (play in a browser)', kind: 'http', method: 'HEAD', url: GAME + '/', expect: { status: 200 }, manage: CF + '/workers/services/view/clean-up-on-aisle-scream' },
  { id: 'game-server', group: 'game', public: true, name: 'Scores and co-op server', kind: 'http', url: GAME + '/api/health', expect: { status: 200, jsonTrue: 'ok' } },
  // A plain visit to the scoreboard door must be told "this is for the game" (426): the board's route is alive.
  { id: 'game-board', group: 'game', public: false, name: 'Scoreboard door answers', kind: 'http', url: GAME + '/api/board', expect: { status: 426 } },
  { id: 'game-howto', group: 'game', public: true, name: 'How to play page', kind: 'http', url: GAME + '/how-to-play/', expect: { status: 200, contains: 'How to Play' } },
  { id: 'game-updates', group: 'game', public: false, name: "What's new page", kind: 'http', url: GAME + '/updates/', expect: { status: 200, contains: 'is the latest' }, valueRe: 'v([0-9]+(?:\\.[0-9]+)?) is the latest' },
  { id: 'game-404', group: 'game', public: false, name: 'Wet Floor page for bad addresses', kind: 'http', url: GAME + '/zz-status-probe', expect: { status: 404 } },
  // The family's own copy, behind the Cloudflare Access sign-in: a visitor must be sent to the sign-in page.
  { id: 'game-family', group: 'game', public: false, name: 'Family site (behind sign-in)', kind: 'http', url: 'https://family.cleanuponaislescream.com/', expect: { status: 302, location: 'https://bitter-mode-ad80.cloudflareaccess.com/' } },
  { id: 'game-itch', group: 'game', public: true, name: 'itch.io page', kind: 'http', url: 'https://dudeanddaddy.itch.io/clean-up-on-aisle-scream', expect: { status: 200, contains: 'Clean Up On Aisle' }, manage: 'https://itch.io/dashboard' },
  // ---- the studio site ----
  { id: 'studio-home', group: 'studio', public: true, name: 'dudeanddaddy.com', kind: 'http', url: STUDIO + '/', expect: { status: 200, contains: 'DUDE &amp; DADDY' }, manage: CF + '/workers/services/view/studio' },
  { id: 'studio-www', group: 'studio', public: false, name: 'www.dudeanddaddy.com sends to the main address', kind: 'http', method: 'HEAD', url: 'https://www.dudeanddaddy.com/', expect: { status: 301, location: STUDIO + '/' } },
  { id: 'studio-game-link', group: 'studio', public: false, name: 'dudeanddaddy.com/game/ sends to the game', kind: 'http', url: STUDIO + '/game/', expect: { status: 301, location: GAME + '/' } },
  { id: 'studio-story', group: 'studio', public: false, name: 'Our story and dev diary', kind: 'http', url: STUDIO + '/diary/', expect: { status: 200, contains: 'DUDE &amp; DADDY' } },
  { id: 'studio-press', group: 'studio', public: true, name: 'Press kit', kind: 'http', url: STUDIO + '/press/', expect: { status: 200, contains: 'press' } },
  { id: 'studio-presskit', group: 'studio', public: false, name: 'Press kit download (.zip)', kind: 'http', method: 'HEAD', url: STUDIO + '/press/dude-and-daddy-press-kit.zip', expect: { status: 200 } },
  { id: 'studio-404', group: 'studio', public: false, name: '"Aisle closed" page for bad addresses', kind: 'http', url: STUDIO + '/zz-status-probe', expect: { status: 404, contains: 'Aisle closed' } },
  // ---- the news list ----
  // An empty sign-up from no page must be refused as "not from here" (403). That answer only comes once the list's
  // storage and mail settings are all in place; with one missing the worker says "closed" (503). Nothing is sent or saved.
  { id: 'news-signup', group: 'news', public: true, name: 'Store News sign-up', kind: 'http', method: 'POST', body: '{}', url: STUDIO + '/api/subscribe', expect: { status: 403, contains: 'not from here' }, explain: { 503: 'The sign-up says "the mail room is closed": a mail setting (RESEND_API_KEY, EMAIL_FROM or SIGNUP_SECRET) is missing on the studio worker' }, manage: CF + '/workers/services/view/studio/production/settings' },
  // ---- email ----
  { id: 'mail-in', group: 'mail', public: true, name: 'Mail to hello@dudeanddaddy.com arrives', kind: 'dns', host: 'dudeanddaddy.com', type: 'MX', expect: { contains: 'mx.cloudflare.net' }, manage: CF + '/dudeanddaddy.com/email/routing' },
  { id: 'mail-in-spf', group: 'mail', public: false, name: 'dudeanddaddy.com sending rule (SPF)', kind: 'dns', host: 'dudeanddaddy.com', type: 'TXT', expect: { contains: 'v=spf1' } },
  { id: 'mail-dkim', group: 'mail', public: true, name: 'Our emails are signed (beepboopmail.com)', kind: 'dns', host: 'resend._domainkey.beepboopmail.com', type: 'TXT', expect: { contains: 'p=' }, manage: 'https://resend.com/domains' },
  { id: 'mail-spf', group: 'mail', public: false, name: 'Sending permission record (SPF)', kind: 'dns', host: 'send.beepboopmail.com', type: 'TXT', expect: { contains: 'v=spf1' } },
  { id: 'mail-dmarc', group: 'mail', public: false, name: 'Anti-forgery rule (DMARC, beepboopmail.com)', kind: 'dns', host: '_dmarc.beepboopmail.com', type: 'TXT', expect: { contains: 'v=DMARC1' } },
  // ---- the services everything runs on ----
  { id: 'vendor-cloudflare', group: 'vendors', public: true, name: 'Cloudflare (hosts both sites)', kind: 'vendor', url: 'https://www.cloudflarestatus.com/api/v2/status.json', page: 'https://www.cloudflarestatus.com' },
  { id: 'vendor-resend', group: 'vendors', public: true, name: 'Resend (sends our email)', kind: 'vendor', url: 'https://resend-status.com/api/v2/status.json', page: 'https://resend-status.com' },
  { id: 'vendor-github', group: 'vendors', public: false, name: 'GitHub (our code, auto-deploys)', kind: 'vendor', url: 'https://www.githubstatus.com/api/v2/status.json', page: 'https://www.githubstatus.com' },
  { id: 'vendor-claude', group: 'vendors', public: false, name: 'Claude (the game page on claude.ai)', kind: 'vendor', url: 'https://status.claude.com/api/v2/status.json', page: 'https://status.claude.com' },
  // ---- setup to fix (found 2026-11-14) ----
  { id: 'setup-studio-https', group: 'setup', public: false, name: 'http://dudeanddaddy.com switches to https', kind: 'http', method: 'HEAD', url: 'http://dudeanddaddy.com/', expect: { status: 301, location: 'https://' }, fix: 'Cloudflare, dudeanddaddy.com, SSL/TLS, Edge Certificates: turn on Always Use HTTPS.', manage: CF + '/dudeanddaddy.com/ssl-tls/edge-certificates' },
  { id: 'setup-game-https', group: 'setup', public: false, name: 'http://cleanuponaislescream.com switches to https', kind: 'http', method: 'HEAD', url: 'http://cleanuponaislescream.com/', expect: { status: 301, location: 'https://' }, fix: 'Cloudflare, cleanuponaislescream.com, SSL/TLS, Edge Certificates: turn on Always Use HTTPS.', manage: CF + '/cleanuponaislescream.com/ssl-tls/edge-certificates' },
  { id: 'setup-game-www', group: 'setup', public: false, name: 'www.cleanuponaislescream.com exists', kind: 'dns', host: 'www.cleanuponaislescream.com', type: 'A', expect: {}, fix: 'Add www.cleanuponaislescream.com as a custom domain on the game worker (or a redirect rule to the main address). People who type www get nothing today.', manage: CF + '/workers/services/view/clean-up-on-aisle-scream' },
  { id: 'setup-studio-dmarc', group: 'setup', public: false, name: 'dudeanddaddy.com has a DMARC rule', kind: 'dns', host: '_dmarc.dudeanddaddy.com', type: 'TXT', expect: { contains: 'v=DMARC1' }, fix: 'Cloudflare, dudeanddaddy.com, Email, DMARC Management: turn it on (it adds the record).', manage: CF + '/dudeanddaddy.com/email/dmarc-management' },
];

export const byId = (id) => ASSETS.find((a) => a.id === id) || null;
export const groupOf = (asset) => GROUPS.find((g) => g.id === asset.group) || {};
// Emailed about when it breaks: our own things, not providers' and not setup items.
export const alerts = (asset) => asset.kind !== 'vendor' && !groupOf(asset).ignore;

// The request a check actually makes.
export function requestFor(asset) {
  if (asset.kind === 'dns') return { url: `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(asset.host)}&type=${asset.type}`, method: 'GET', headers: { accept: 'application/dns-json' } };
  const headers = { 'user-agent': 'dude-and-daddy-status/1 (+https://status.dudeanddaddy.com)' };
  if (asset.body !== undefined) headers['content-type'] = 'application/json';
  return { url: asset.url, method: asset.method || 'GET', headers, ...(asset.body !== undefined ? { body: asset.body } : {}) };
}

// Turns one answer into a verdict. `res` is { status, location, body } (body as text), or { error } when nothing came
// back. state: 'up' | 'degraded' | 'down'. note: plain words for Rob.
export function judge(asset, res) {
  if (!res || res.error) return { state: 'down', note: `No answer (${(res && res.error) || 'unknown error'})` };
  if (asset.kind === 'vendor') {
    const data = parse(res.body);
    const ind = data && data.status && data.status.indicator;
    const words = (data && data.status && data.status.description) || '';
    if (res.status !== 200 || !ind) return { state: 'degraded', note: 'Their status page did not answer clearly' };
    if (ind === 'none') return { state: 'up', note: words || 'All systems operational' };
    return { state: ind === 'critical' || ind === 'major' ? 'down' : 'degraded', note: words || ind };
  }
  if (asset.kind === 'dns') {
    const data = parse(res.body);
    if (res.status !== 200 || !data || data.Status !== 0) return { state: 'down', note: 'DNS lookup failed' };
    const records = (data.Answer || []).map((a) => String(a.data || '')).join(' ');
    if (!records) return { state: 'down', note: `No ${asset.type} record found` };
    if (asset.expect.contains && !records.includes(asset.expect.contains)) return { state: 'down', note: `${asset.type} record changed: it no longer mentions ${asset.expect.contains}` };
    return { state: 'up', note: `${asset.type} record in place` };
  }
  const e = asset.expect;
  if (e.status && res.status !== e.status) {
    const why = asset.explain && asset.explain[res.status];
    return { state: 'down', note: why || `Answered ${res.status}, expected ${e.status}` };
  }
  if (e.location) {
    const loc = String(res.location || '');
    if (!loc.startsWith(e.location)) return { state: 'down', note: `Sends people to ${loc || 'nowhere'}, expected ${e.location}` };
  }
  const body = String(res.body || '');
  if (e.contains && !body.toLowerCase().includes(e.contains.toLowerCase())) return { state: 'down', note: `Page is missing "${e.contains}"` };
  if (e.json || e.jsonTrue) {
    const data = parse(body);
    const key = e.json || e.jsonTrue;
    if (!data || typeof data !== 'object' || !(key in data)) return { state: 'down', note: 'Answer is not the expected data' };
    if (e.jsonTrue && data[key] !== true) return { state: 'down', note: `Says ${key} is ${JSON.stringify(data[key])}` };
  }
  let value;
  if (asset.valueRe) {
    const m = body.match(new RegExp(asset.valueRe));
    value = m ? m[1] : undefined;
  }
  return { state: 'up', note: 'Working', ...(value ? { value } : {}) };
}

function parse(text) {
  try { return JSON.parse(text); } catch { return null; }
}
