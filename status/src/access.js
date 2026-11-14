// Who may open the console. Unit tested (status/tests/status.test.mjs).
//
// Sign-in is done by Cloudflare Access (Zero Trust, free for up to 50 people) standing in front of
// status.dudeanddaddy.com/console: it asks for an emailed one-time code, then
// passes a signed ticket (a JWT) in the Cf-Access-Jwt-Assertion header. This file checks that
// ticket itself, so the console stays shut even if Access were switched off or misconfigured:
//   - signed by our Access team's own keys (RS256), for our application (ACCESS_AUD),
//   - not expired,
//   - for an address on the ADMIN_EMAILS list.
// With ACCESS_TEAM, ACCESS_AUD or ADMIN_EMAILS missing, nobody gets in.

const b64urlBytes = (s) => {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  return Uint8Array.from(atob(pad), (c) => c.charCodeAt(0));
};
const b64urlJson = (s) => JSON.parse(new TextDecoder().decode(b64urlBytes(s)));

export const teamOrigin = (team) => `https://${team}.cloudflareaccess.com`;
export const emailList = (s) => String(s || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);

let certMemo = null;
// getKeys(origin) returns the JWK list; injectable for tests.
async function fetchKeys(origin) {
  const now = Date.now();
  if (certMemo && certMemo.origin === origin && certMemo.until > now) return certMemo.keys;
  const res = await fetch(origin + '/cdn-cgi/access/certs');
  if (!res.ok) throw new Error('certs ' + res.status);
  const keys = (await res.json()).keys || [];
  certMemo = { origin, keys, until: now + 3600000 };
  return keys;
}

// Returns { email } for a good ticket, or { error } saying (to the logs, not the page) why not.
export async function checkTicket(token, env, { now = Date.now(), getKeys = fetchKeys } = {}) {
  const team = typeof env.ACCESS_TEAM === 'string' ? env.ACCESS_TEAM.trim() : '';
  const aud = typeof env.ACCESS_AUD === 'string' ? env.ACCESS_AUD.trim() : '';
  const allowed = emailList(env.ADMIN_EMAILS);
  if (!/^[a-z0-9-]{1,63}$/.test(team) || aud.length < 16 || !allowed.length) return { error: 'console not set up' };
  if (typeof token !== 'string' || token.length > 8000) return { error: 'no ticket' };
  const parts = token.split('.');
  if (parts.length !== 3) return { error: 'bad ticket' };
  let head, claims;
  try { head = b64urlJson(parts[0]); claims = b64urlJson(parts[1]); } catch { return { error: 'bad ticket' }; }
  if (head.alg !== 'RS256' || typeof head.kid !== 'string') return { error: 'wrong algorithm' };
  let keys;
  try { keys = await getKeys(teamOrigin(team)); } catch { return { error: 'could not fetch keys' }; }
  const jwk = keys.find((k) => k.kid === head.kid);
  if (!jwk) return { error: 'unknown key' };
  let good = false;
  try {
    const key = await crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    good = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlBytes(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1]));
  } catch { good = false; }
  if (!good) return { error: 'bad signature' };
  const auds = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!auds.includes(aud)) return { error: 'wrong application' };
  if (claims.iss !== teamOrigin(team)) return { error: 'wrong issuer' };
  const sec = Math.floor(now / 1000);
  if (typeof claims.exp !== 'number' || claims.exp < sec) return { error: 'expired' };
  if (typeof claims.nbf === 'number' && claims.nbf > sec + 60) return { error: 'not yet valid' };
  const email = String(claims.email || '').toLowerCase();
  if (!email || !allowed.includes(email)) return { error: 'not on the list' };
  return { email };
}

// The ticket travels in a header Access adds; the cookie is a fallback for the same ticket.
export function ticketFrom(req) {
  const h = req.headers.get('cf-access-jwt-assertion');
  if (h) return h;
  const m = (req.headers.get('cookie') || '').match(/(?:^|;\s*)CF_Authorization=([^;]+)/);
  return m ? m[1] : '';
}
