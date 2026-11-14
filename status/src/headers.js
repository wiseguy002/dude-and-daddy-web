// Browser security headers for status.dudeanddaddy.com. Pure, unit tested (status/tests/status.test.mjs).
// No inline script or style, nothing loaded from other hosts, and the pages talk only to this worker.
export const isLocalHost = (host) => host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.localhost');

export function securityHeaders(url) {
  const csp = [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
  ].join('; ');
  const h = {
    'content-security-policy': csp,
    'x-frame-options': 'DENY',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    'cross-origin-opener-policy': 'same-origin',
  };
  if (!isLocalHost(url.hostname)) h['strict-transport-security'] = 'max-age=31536000; includeSubDomains';
  return h;
}
