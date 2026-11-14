# DUDE & DADDY status and back office (`dude-and-daddy-status`)

A third Cloudflare worker, separate from the studio site (`studio`, one folder up) and the game
(`clean-up-on-aisle-scream`, its own repo).

- **https://status.dudeanddaddy.com**: public status page for Clean Up On Aisle Scream! (the game, scores and co-op,
  itch.io), dudeanddaddy.com, the Store News sign-up and email. 90-day bars and notices.
- **https://status.dudeanddaddy.com/console**: Rob's back office: every asset with details, Check now, post/resolve
  notices, news-list numbers, the game server's health, a change log, "Setup to fix" items, and links to every
  place things are managed (Cloudflare, Resend, GitHub, itch.io, the family site, Dev Dash, brand guide, Gmail).
- A cron runs every check every 5 minutes. Two failures in a row = "not working" and one email to `ALERT_TO`; one
  more email when it is back. Providers (Cloudflare, Resend, GitHub, Claude) and "Setup to fix" items are shown but
  never emailed about, and never turn the page yellow.

## Files

- `src/assets.js`: **the list of everything watched** and how each answer is judged. Add an asset here and it is
  checked, stored and shown everywhere. `public: false` keeps it to the console; group `setup` = known settings to
  change once (each has a `fix`).
- `src/summary.js`: up/slow/down, uptime bars, when to email, checking notices (pure, tested).
- `src/access.js`: checks the Cloudflare Access sign-in ticket itself (signature, app, expiry, address on
  `ADMIN_EMAILS`). With any of `ACCESS_TEAM`, `ACCESS_AUD`, `ADMIN_EMAILS` missing, nobody gets in.
- `src/board.js`: `StatusBoard` Durable Object (SQLite): latest result, daily tallies, change log, notices.
  `src/worker.js`: routes, console API (news count from the studio's SIGNUP KV, read only; game health over the
  `GAME` service binding), cron.
- `public/`: `index.html` + `js/status.js` (public), `console.html` + `js/console.js`, `locked.html`.
- Tests (from this folder): `npm test` (unit), `npm run test:worker` (the real worker in Miniflare, nothing
  reaches the internet).

## Secrets (Rob, one at a time, from this folder; check the name shown is `dude-and-daddy-status`)

`ADMIN_EMAILS`, `RESEND_API_KEY` (a sending key for beepboopmail.com) and `ALERT_TO`. `ACCESS_AUD` goes in `vars`
once the Access application exists.
