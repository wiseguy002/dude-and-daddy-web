// dudeanddaddy.com's one bit of server: the studio news list (everything else is the static files in site/).
//   POST /api/subscribe    { email, adult: true, website: '' } → a "please confirm" email (nothing is saved yet)
//   POST /api/confirm      { token }  → the address joins the list, a welcome email goes out
//   POST /api/unsubscribe  { token } or ?t=<token> (the one-click button mail apps show) → the address is removed
// A confirm link is good for 48 hours; an unsubscribe link never runs out. Both are signed with SIGNUP_SECRET, so
// nothing has to be stored about someone who never confirms. Subscribers live in the SIGNUP KV namespace as
// `sub:<email>`. Mail goes through Resend from beepboopmail.com (secrets RESEND_API_KEY, EMAIL_FROM).
// When NEWS_SEGMENT_ID is set, a confirmed address is also added to that Resend segment (and removed again on
// unsubscribe), so news can be written and sent from Resend's Broadcasts screen. That needs RESEND_API_KEY to be a
// full-access key; with a sending-only key the list still works and only this copy is skipped.
const SITE = 'https://dudeanddaddy.com';
export const LIMITS = { CONFIRM_MS: 48 * 3600 * 1000, PER_ADDRESS_DAY: 3, ALL_PER_DAY: 300, BODY: 2048 };
const EMAIL_RE = /^[a-z0-9.!#$%&*+/=?^_{|}~-]{1,64}@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
const enc = new TextEncoder();

// One plain address (no lists, quotes or line breaks: nothing that could add a recipient or a header), or null.
export function normalizeEmail(text) {
  if (typeof text !== 'string' || text.length > 254) return null;
  const e = text.trim().toLowerCase();
  return EMAIL_RE.test(e) && !e.includes('..') ? e : null;
}
const b64 = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
async function sign(secret, text) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(text))));
}
const same = (a, b) => {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
};
// token = <kind>.<email, base64url>.<expires ms or 0>.<signature>
export async function makeToken(secret, kind, email, expires = 0) {
  const body = `${kind}.${b64(enc.encode(email))}.${expires}`;
  return `${body}.${await sign(secret, body)}`;
}
export async function readToken(secret, kind, token, now = Date.now()) {
  try {
    if (typeof token !== 'string' || token.length > 700 || !secret) return null;
    const [k, e, x, s, extra] = token.split('.');
    if (k !== kind || !e || !x || !s || extra !== undefined || !/^\d{1,15}$/.test(x)) return null;
    if (!same(s, await sign(secret, `${k}.${e}.${x}`))) return null;
    if (Number(x) !== 0 && !(Number(x) > now)) return null;
    return normalizeEmail(new TextDecoder().decode(unb64(e)));
  } catch (err) {
    return null;
  }
}
const sha = async (text) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(text)))].map((b) => b.toString(16).padStart(2, '0')).join('');
const dayOf = (now) => new Date(now).toISOString().slice(0, 10);

// A count for today in KV (a rough cap is all that's needed: it stops one address or the whole list being flooded).
async function under(kv, key, max) {
  const n = Number(await kv.get(key)) || 0;
  if (n >= max) return false;
  await kv.put(key, String(n + 1), { expirationTtl: 2 * 86400 });
  return true;
}

const plain = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ').slice(0, n);
export async function sendMail(env, { to, subject, text, headers }, fetchImpl = (...a) => fetch(...a)) {
  const email = normalizeEmail(to);
  if (!email || !env.RESEND_API_KEY || !env.EMAIL_FROM) return false;
  try {
    const res = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + env.RESEND_API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ from: env.EMAIL_FROM, to: [email], reply_to: 'hello@dudeanddaddy.com', subject: plain(subject, 150), text: plain(text, 4000), ...(headers ? { headers } : {}) }),
    });
    return !!res && res.ok;
  } catch (e) {
    return false;
  }
}
// The owner's copy of the list in Resend (best effort: the KV list is the one that counts, so a failure here never
// fails the visitor's click). → true when Resend has it right.
const SEGMENT_RE = /^[0-9a-f-]{36}$/;
async function resend(env, method, path, body, fetchImpl) {
  try {
    const res = await fetchImpl('https://api.resend.com' + path, {
      method,
      headers: { authorization: 'Bearer ' + env.RESEND_API_KEY, 'content-type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return !!res && res.ok;
  } catch (e) {
    return false;
  }
}
export async function syncContact(env, email, on, fetchImpl = (...a) => fetch(...a)) {
  const seg = env.NEWS_SEGMENT_ID;
  if (typeof seg !== 'string' || !SEGMENT_RE.test(seg) || !env.RESEND_API_KEY || !normalizeEmail(email)) return false;
  const who = encodeURIComponent(email);
  if (!on) return resend(env, 'DELETE', `/contacts/${who}`, null, fetchImpl);
  if (await resend(env, 'POST', '/contacts', { email, unsubscribed: false, segments: [{ id: seg }] }, fetchImpl)) return true;
  // (already a contact, perhaps one who left before: back on, and in the segment)
  const back = await resend(env, 'PATCH', `/contacts/${who}`, { unsubscribed: false }, fetchImpl);
  const inSeg = await resend(env, 'POST', `/contacts/${who}/segments/${seg}`, null, fetchImpl);
  return back && inSeg;
}

const FOOT = ['', 'DUDE & DADDY LLC · a father-and-son game studio · Baton Rouge, Louisiana', `${SITE}/privacy/`];
export const confirmEmail = (link) => ({
  subject: 'One click to join the DUDE & DADDY news list',
  text: ['Attention, shoppers: someone asked to put this address on the DUDE & DADDY news list.', '', 'If that was you, confirm here (good for 48 hours):', link, '', "If it wasn't you, do nothing. Without that click you are not on the list and we keep nothing.", ...FOOT].join('\n'),
});
export const welcomeEmail = (unsub) => ({
  subject: "You're on the list. Mop included.",
  text: ["You're on the DUDE & DADDY news list.", '', 'We write only when there is real news: a new game, a big update. No ads, and we never share the list.', '', 'Changed your mind? Leave any time:', unsub, ...FOOT].join('\n'),
});

const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
async function bodyOf(request) {
  try {
    const text = await request.text();
    if (text.length > LIMITS.BODY) return null;
    const o = JSON.parse(text || '{}');
    return o && typeof o === 'object' && !Array.isArray(o) ? o : null;
  } catch (e) {
    return null;
  }
}
const ready = (env) => !!(env && env.SIGNUP && env.SIGNUP_SECRET && env.RESEND_API_KEY && env.EMAIL_FROM);
const fromHere = (request, url) => {
  const o = request.headers.get('Origin');
  if (!o) return false; // (a browser page always says where it is on a POST)
  try {
    return new URL(o).host === url.host;
  } catch (e) {
    return false;
  }
};

export async function api(request, env, { now = Date.now(), fetchImpl = (...a) => fetch(...a) } = {}) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/$/, '');
  if (request.method !== 'POST' || !['/api/subscribe', '/api/confirm', '/api/unsubscribe'].includes(path)) return json({ ok: false, error: 'not found' }, 404);
  if (!ready(env)) return json({ ok: false, error: 'closed' }, 503);
  const site = `${url.protocol}//${url.host}`;

  if (path === '/api/unsubscribe') {
    // (the link in the email, or a mail app's own "unsubscribe" button: that one posts with no page and no body)
    const o = url.searchParams.get('t') ? {} : await bodyOf(request);
    const email = await readToken(env.SIGNUP_SECRET, 'u', url.searchParams.get('t') || (o && o.token), now);
    if (!email) return json({ ok: false, error: 'bad link' }, 400);
    await env.SIGNUP.delete('sub:' + email);
    await syncContact(env, email, false, fetchImpl);
    return json({ ok: true });
  }
  if (!fromHere(request, url)) return json({ ok: false, error: 'not from here' }, 403);
  const o = await bodyOf(request);
  if (!o) return json({ ok: false, error: 'bad request' }, 400);

  if (path === '/api/confirm') {
    const email = await readToken(env.SIGNUP_SECRET, 'c', o.token, now);
    if (!email) return json({ ok: false, error: 'bad link' }, 400);
    const had = await env.SIGNUP.get('sub:' + email);
    if (!had) {
      await env.SIGNUP.put('sub:' + email, JSON.stringify({ at: new Date(now).toISOString() }));
      await syncContact(env, email, true, fetchImpl);
      const unsub = await makeToken(env.SIGNUP_SECRET, 'u', email);
      await sendMail(env, { to: email, ...welcomeEmail(`${site}/news/unsubscribe/#${unsub}`), headers: { 'List-Unsubscribe': `<${site}/api/unsubscribe?t=${unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } }, fetchImpl);
    }
    return json({ ok: true });
  }

  // /api/subscribe
  if (env.SIGNUPS && typeof env.SIGNUPS.limit === 'function') {
    const { success } = await env.SIGNUPS.limit({ key: request.headers.get('CF-Connecting-IP') || 'none' });
    if (!success) return json({ ok: false, error: 'slow down' }, 429);
  }
  if (typeof o.website === 'string' && o.website) return json({ ok: true }); // (a field people can't see: only a bot fills it in)
  if (o.adult !== true) return json({ ok: false, error: 'grown-ups only' }, 400);
  const email = normalizeEmail(o.email);
  if (!email) return json({ ok: false, error: 'bad email' }, 400);
  const day = dayOf(now);
  // (the same answer whether or not the address is on the list already, or has been asked too often today)
  if (!(await under(env.SIGNUP, `sent:${day}:${(await sha('signup|' + email)).slice(0, 32)}`, LIMITS.PER_ADDRESS_DAY))) return json({ ok: true });
  if (!(await under(env.SIGNUP, `all:${day}`, LIMITS.ALL_PER_DAY))) return json({ ok: false, error: 'closed' }, 503);
  const token = await makeToken(env.SIGNUP_SECRET, 'c', email, now + LIMITS.CONFIRM_MS);
  const sent = await sendMail(env, { to: email, ...confirmEmail(`${site}/news/confirm/#${token}`) }, fetchImpl);
  return sent ? json({ ok: true }) : json({ ok: false, error: 'closed' }, 503);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return api(request, env);
    return env.ASSETS.fetch(request);
  },
};
