---
name: ship-it
description: Rob's release recipe for dudeanddaddy.com and status.dudeanddaddy.com. Use when Rob says "ship it", "release", "deploy" or "merge".
---

# Ship it (dude-and-daddy-web)

Two things can ship from this repo. Work out which one the change touches.
- **Studio site** (`site/`, `worker/`, `wrangler.jsonc`): merging to `main` deploys it (Cloudflare Workers Builds runs `npx wrangler deploy`, about a minute). Other branches only get preview links.
- **Status worker** (`status/`): deployed by hand, never by Workers Builds.

## Guardrails
- Deploy or merge only on Rob's word: he types "merge" for that PR in chat. Approval for one PR does not carry to the next.
- Never change secrets, DNS, Cloudflare settings or deploy config (`wrangler.jsonc`, `status/wrangler.jsonc`) without asking Rob first. He sets secrets himself.
- Do not touch the game repo (`clean-up-on-aisle-scream`).
- If a deploy fails: stop, report the exact error, do not retry blindly.
- Any step not covered here: check with Rob.

## Steps
1. **Tests.** `node --test tests/*.mjs scripts/*.test.mjs` and `node scripts/check-markers.mjs --profile` (Mainframe markers; CI runs both). If `status/` changed: `cd status && npm test` and `cd status && npm run test:worker`. Run them; report real results.
2. **Audit.**
   - Syntax check the changed JS (e.g. `node --check <file>`).
   - Pages: no inline `<style>`, `<script>` or `style=""` (the CSP blocks them); bump `?v=` on any asset that changed.
   - Run the security-review skill on the diff (no secrets in code, validated input).
   - Read the whole diff against what Rob asked for.
3. **Notes.** Update `docs/capabilities.md` (what is live / needs setup / parked) and the "State" and "Waiting on Rob" parts of `CLAUDE.md`. There is no CHANGELOG file: if Rob wants one, check with him. (The databank hook in `scripts/check-databank.sh` only fires if a `CHANGELOG.md` is committed.)
4. **Commit** only the files you changed, on a branch/PR. Wait for Rob's "merge".
5. **Deploy.**
   - Studio site: after Rob says "merge", merge the PR to `main`; Cloudflare publishes it by itself.
   - Status worker: `cd status && npx wrangler deploy`, run outside the sandbox, worker name must be `dude-and-daddy-status`. Ask Rob before running it.
6. **Live checks.** Look in Chrome (Claude in Chrome):
   - https://dudeanddaddy.com (home loads, news sign-up form present)
   - https://status.dudeanddaddy.com (page loads, checks green)
   - https://status.dudeanddaddy.com/console (needs Rob's sign-in; ask him if it is needed)
   - Quick HTTP status check: `curl -sI https://dudeanddaddy.com`
   Roll back from the Cloudflare Deployments tab if something is broken (tell Rob first).
7. **Trail log.** After a real ship, post one or two lines (never in a Codename folder; no clients, kid's name, links or dates):
   `~/.config/radventures/trail-post.sh <ship|trail|bug|wipeout|crew> dude-and-daddy "<text>"`
   Rob's "funny and loud" voice, first person, 1-2 sentences. Say in one line what was posted.
8. **Report.** Table: task | status | branch/commit | live URL | tests | audit findings, plus decisions made on Rob's behalf and anything not done.
