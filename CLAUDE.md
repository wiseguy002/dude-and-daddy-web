# dudeanddaddy.com (studio website)

Read `DEPLOY.md` for how the site is hosted (Cloudflare Worker `studio`, deploys on every push to `main`).

## Where things are
- `site/` the pages (plain HTML, one folder per page), `site/assets/` CSS, the shared header/footer script and logos,
  `site/_headers` security + caching headers, `site/_redirects` (`/game` goes to cleanuponaislescream.com).
- `worker/index.mjs` the news list API (`/api/*`); tests: `node --test tests/*.mjs`.
- The game is a separate repo and domain. Don't touch it from here.

## Rules
- Never merge or deploy until Rob types "merge" for that PR in this session's chat. Merging to `main` deploys live.
- No inline `<style>`, `<script>` or `style=""` in pages (the CSP blocks them). Bump `?v=` when an asset changes.
- No ads, no trackers. The news list is for 18+ only.
- Rob is not a developer: short, plain answers, outcome first.

## State (2026-11-14 audit)
- Done: strict CSP (no unsafe-inline), HSTS preload, COOP/CORP, no-transform, security headers on /api answers,
  `/.well-known/security.txt` (**expires 2027-11-14: renew before then**), logos as cached SVGs (home 135 KB -> 12 KB),
  landmarks/headings (axe 0 issues light+dark, 1280+375), HTML validates, press page points at the news list.
- Tested on the branch preview (`<branch>-studio.robewise.workers.dev`). Not tested: real phones, screen readers.

## Waiting on Rob
- **News sign-up is closed on the live site** (`/api/*` answers "closed"): one of the three secrets
  (RESEND_API_KEY, EMAIL_FROM, SIGNUP_SECRET) is missing on the `studio` Worker. Add them in the dashboard
  (Workers & Pages, studio, Settings, Variables and Secrets). See DEPLOY.md.
- **www.dudeanddaddy.com serves a copy of the site** instead of redirecting. Fix: zone Redirect Rule from the
  "Redirect from WWW to root" template (`https://www.dudeanddaddy.com/*` to `https://dudeanddaddy.com/${1}`, 301, keep query).
- Lawyer glance at the privacy page; confirm the LLC filing (see DEPLOY.md).

## Leftovers
- Trailing-slash redirects are 307 (Workers assets default); harmless, internal links already use the slash form.
- Press kit zip (3 MB) and gameplay GIF (1 MB) are large but only load on the press page.
