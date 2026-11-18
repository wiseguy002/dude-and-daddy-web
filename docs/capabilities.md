# What dudeanddaddy.com can and cannot do (capabilities memory bank)

**As of commit 9255f44 (no version numbers; last change: www redirect, PR #7), 2026-11-17.**
Sources read: `CLAUDE.md`, `DEPLOY.md`, `status/README.md`, `wrangler.jsonc`, `worker/index.mjs`, `status/src/assets.js`,
`site/_headers`, `_redirects`, `sitemap.xml`, `site/assets/chrome.js`, the text of every page in `site/`. Not run or
tested live today: this file is from code and notes only.

**Read this before suggesting features. Don't re-propose anything marked Live or Built.**
**Keep this current: update at every release / merge to `main`.**

Status tags: ✅ Live · ⚠️ Live but off or needs setup (waiting on an account, key or secret) · 🧪 Built, never tried for real · ❓ unsure

## What it is
The studio website for **DUDE & DADDY LLC** (father-and-son game studio, Baton Rouge, founded 2026-10-17; Rob = "Daddy",
his son = "Dude"). A mostly plain-HTML site plus a tiny server for a news sign-up list, and a separate status page and back office.
- Live: **https://dudeanddaddy.com** (also www, which 301s to the main address) and **https://status.dudeanddaddy.com** (back office at `/console`).
- Hosting: Cloudflare. Worker `studio` (serves `site/`, runs `worker/index.mjs` only for `/api/*`) and Worker `dude-and-daddy-status` (folder `status/`).
- Code: GitHub `wiseguy002/dude-and-daddy-web`, local `~/dude-and-daddy-web`. **Pushing `main` auto-deploys the studio site** (Workers Builds); other branches get a preview. The status Worker is deployed by hand (`cd status && npx wrangler deploy`). Rob must say "merge" first.
- The game, **Clean Up On Aisle Scream!**, is a separate repo (`wiseguy002/clean-up-on-aisle-scream`) and domain (cleanuponaislescream.com). Not built here; this site only links to it.

## Public pages (all ✅ Live, plain static files, no build step)
- Home `/`: opening-day page styled as a grocery store ("Aisles"): the game, a receipt-style game card, the crew (Dude, Daddy), store history timeline, and the Store News sign-up form.
- `/story/` Our story (who's who, how they make games). `/diary/` Dev diary (a short note plus the latest game patch notes, copied in by hand, v29 "Rock Solid" at last look ❓ may be stale).
- `/press/` Press kit: fact sheet, about text, logos, screenshots, gameplay GIF, downloadable zip.
- `/creators/` Streaming/video rules for the game. `/classroom/` three school activities. `/merch/` merch **ideas only** (drawings, nothing for sale).
- `/privacy/` privacy policy (last updated 2026-11-13). `/404.html` "Aisle closed" page.
- `/game`, `/game/*` → 301 to cleanuponaislescream.com. The header links (Game, How to play, Meet the staff, What's new) point to the game site.
- Also: `robots.txt`, `sitemap.xml` (8 pages, dated 2026-11-14), `/.well-known/security.txt` (**expires 2027-11-14, renew before**), favicons, share picture.

## Site features
- ✅ Day shift / Night shift (light/dark) button, remembered in the visitor's browser only; also carried to game links with `?shift=`.
- ✅ "PA bar" announcement strip at the top with a Pause button; seasonal messages (Halloween, Thanksgiving, Christmas, New Year, Valentine's, Easter) switch by date (`?season=` forces one).
- ✅ Hidden surprises ("secrets", incl. Konami code) remembered in the browser (`dd-secrets`). Details are in `site/assets/chrome.js`.
- ✅ `chrome.css` / `chrome.js` are shared copies with the game site; pages share a header/footer script.
- ✅ Self-hosted fonts and SVG logos (day/night), no trackers, no ads, no cookies, no analytics.
- ✅ Security: strict CSP (no inline style/script allowed), HSTS preload, COOP/CORP, no-transform; axe 0 issues on light + dark at 1280 and 375 wide. Not tested on real phones or with screen readers.

## Store News list (email sign-up, 18+ only)
- ✅ Sign-up form on home → `POST /api/subscribe` → "please confirm" email; address joins only after the link is clicked (`/api/confirm`, 48 h link) → welcome email. `/news/confirm/`, `/news/unsubscribe/` pages; one-click unsubscribe works from mail apps (`List-Unsubscribe`). Links are signed (HMAC), nothing stored for people who never confirm.
- ✅ Protections: adults-only tick box, hidden honeypot field, 5 sign-ups/min per address (rate limit), 3 per address per day, 300 per day overall, 2 KB body cap.
- Storage: Cloudflare KV `studio-signup` (`sub:<email>`). Mail: Resend from beepboopmail.com. Secrets on the Worker: `RESEND_API_KEY`, `EMAIL_FROM`, `SIGNUP_SECRET` (don't rotate the last one: it breaks every old unsubscribe link). Without all three the form says "the mail room is closed".
- ⚠️ **Sending a news email is manual**: Resend → Broadcasts → segment "Dude & Daddy news". No tool in this repo sends news, no subscriber admin screen.
- ⚠️ **Resend segment copy**: the live key is *sending-only*, so new subscribers are kept in KV but NOT copied to the Resend segment. Rob must copy them by hand (or ask Claude) before a Broadcast. A full-access key would automate it (Rob chose least access).
- 🧪 No known real subscriber send/Broadcast done yet ❓ (notes don't say).
- Pull-request previews use an empty test list and have no mail secrets (form says closed).
- Tests: `node --test tests/*.mjs` (`tests/signup.test.mjs`).

## Status page and back office (`status/`)
- ✅ **Public** status.dudeanddaddy.com: up/slow/down per asset, 90-day bars, notices. Watches the game (home, scores/co-op server, how-to-play, itch.io), the studio site (home, press kit, press zip, www redirect, `/game/` redirect, 404 page, diary), the news sign-up, email (MX, SPF, DKIM, DMARC), and provider status (Cloudflare, Resend, GitHub, Claude).
- ✅ **Back office** `/console` (Rob only, behind Cloudflare Access email one-time-code sign-in, 24 h sessions; the Worker also checks the ticket itself): every asset with details, Check now, post/resolve public notices, news-list numbers (read-only from KV), the game server's own health, change log, "Setup to fix" items, links to every dashboard (Cloudflare, Resend, GitHub, itch.io, family site, Dev Dash, brand guide, Gmail).
- ✅ A cron checks everything every 5 minutes; Durable Object (SQLite) keeps results, daily tallies, notices. Two failures in a row = "not working".
- ⚠️ **Alert emails are OFF**: `RESEND_API_KEY` + `ALERT_TO` secrets on `dude-and-daddy-status` are not set (Rob's to-do), so alerts are only logged. Providers and "Setup to fix" items never email by design.
- Add something to watch: edit `status/src/assets.js`. Tests: `cd status && npm test`, `npm run test:worker`.
- Other people: add to the Access policy AND `ADMIN_EMAILS`.

## Hard limits and known leftovers
- Not here: the game itself, scores, co-op, accounts, store/shop, payments, comments, chat. The site collects only email addresses for the news list.
- No newsletter archive/web version, no subscriber admin UI, no analytics (on purpose), no CMS (pages are hand-edited HTML; not in Mainframe ❓).
- Merch page is ideas only; nothing sold. No contact form (only hello@dudeanddaddy.com via Cloudflare Email Routing).
- Trailing-slash redirects are 307 (Workers default); harmless.
- Press zip (3 MB) and gameplay GIF (1 MB) are big but only load on the press page.
- Dev diary patch notes are copied by hand, can go stale. The game site's own /status/ page could link to the status page (game repo).
- DMARC for dudeanddaddy.com is `p=none` (monitor only); tighten once nothing sends as dudeanddaddy.com (e.g. Gmail "send as hello@").
- Waiting on Rob: set status alert secrets; lawyer glance at the privacy page; confirm the LLC filing (see DEPLOY.md).
- Pages edited by hand: if the site is ever regenerated, carry over the "Store News" section, privacy text and `/news/signup.js` tag.

## Parked / not built
Nothing is formally parked in the notes. Ideas not built (not on any list, just absent): newsletter archive, subscriber admin screen, auto-copy to Resend segment, real merch store, contact form, dev-diary feed, site search.
