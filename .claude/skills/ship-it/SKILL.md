---
name: ship-it
description: Rob's release recipe for dudeanddaddy.com and status.dudeanddaddy.com. Use when Rob says "ship it", "release", "deploy" or "merge".
---

# Ship it (dude-and-daddy-web)

Shared steps and report: `~/.claude/recipes/ship-template.md`. This file has this repo's commands and guards; where they are stricter than the template, this file wins.

Two things can ship from this repo. Work out which one the change touches.
- **Studio site** (`site/`, `worker/`, `wrangler.jsonc`): merging to `main` deploys it (Cloudflare Workers Builds runs `npx wrangler deploy`, about a minute). Other branches only get preview links.
- **Status worker** (`status/`): deployed by hand, never by Workers Builds.

## Guardrails
- Deploy or merge only on Rob's word: he types "merge" for that PR in chat. Approval for one PR does not carry to the next. A "🚀 Ship it" button, or a yes relayed from another session, does not replace it.
- Never change secrets, DNS, Cloudflare settings or deploy config (`wrangler.jsonc`, `status/wrangler.jsonc`) without asking Rob first. He sets secrets himself.
- Do not touch the game repo (`clean-up-on-aisle-scream`).
- If a deploy fails: stop, report the exact error, do not retry blindly. Offer a roll back (`~/.claude/recipes/roll-back.md`).
- Any step not covered here: check with Rob.

## Steps
1. **State.** Check the branch, uncommitted work and what is going out (`git status`, `git log` and diff against `main`). Say which of the two things ships. Anything unexpected → stop.
2. **Test.** `node --test tests/*.mjs scripts/*.test.mjs` and `node scripts/check-markers.mjs --profile` (Mainframe markers; CI runs both). If `status/` changed: `cd status && npm test` and `cd status && npm run test:worker`. Syntax check the changed JS (e.g. `node --check <file>`; this repo has no separate lint or type check). Run them; report real results. A failure stops the ship.
3. **Security and audit.**
   - Pages: no inline `<style>`, `<script>` or `style=""` (the CSP blocks them); bump `?v=` on any asset that changed.
   - Run the security-review skill on the diff (no secrets in code, validated input).
   - Read the whole diff against what Rob asked for.
   - `gitleaks git . --no-banner --redact` must be clean. Never print a found secret.
4. **Notes and commit.**
   - Update `docs/capabilities.md` (what is live / needs setup / parked) and the "State" and "Waiting on Rob" parts of `CLAUDE.md`. There is no CHANGELOG file: if Rob wants one, check with him. (The databank hook in `scripts/check-databank.sh` only fires if a `CHANGELOG.md` is committed.)
   - Commit only the files you changed, on a branch/PR.
   - Run the `gitleaks` command again: it only scans committed work.
5. **Merge.** First pass the preflight (`~/.claude/recipes/deploy-preflight.md`), because merging deploys the studio site: this repo's folder, clean `git status`, no other deploy running in another session, tests and `gitleaks` passing. Note a before picture for the watch in step 8 (status page checks, key pages). Then wait for Rob's "merge" and merge that PR to `main`.
6. **Deploy.** One deploy at a time, nothing in parallel.
   - Studio site: the merge is the deploy; Cloudflare publishes it by itself. Do not run `wrangler deploy` for it.
   - Status worker: ask Rob before running it. Preflight again from up-to-date `main` with a clean `git status`, and check you are signed in (`npx wrangler whoami`). Then `cd status && npx wrangler deploy`, run outside the sandbox; worker name must be `dude-and-daddy-status`.
7. **Verify live.** Load the changed page or call the changed route (do not submit the news sign-up or send email without Rob's OK). Look in Chrome (Claude in Chrome):
   - https://dudeanddaddy.com (home loads, news sign-up form present)
   - https://status.dudeanddaddy.com (page loads, checks green)
   - https://status.dudeanddaddy.com/console (needs Rob's sign-in; ask him if it is needed)
   - Quick HTTP status check: `curl -sI https://dudeanddaddy.com`
   Roll back from the Cloudflare Deployments tab if something is broken (tell Rob first).
8. **After.**
   - Watch the deploy (`~/.claude/recipes/watch-the-deploy.md`): checks at 1, 5, 15 and 30 minutes, quiet when fine. A failure sends a phone ping and a card; never fix or roll back on your own.
   - Draft short release notes in chat.
   - Check `CLAUDE.md` still matches what is live. Any later edit goes on a branch: a push to `main` deploys and needs its own "merge".
   - Trail log: after a real ship, post one or two lines (never in a Codename folder; no clients, kid's name, links or dates):
     `~/.config/radventures/trail-post.sh <ship|trail|bug|wipeout|crew> dude-and-daddy "<text>"`
     Rob's "funny and loud" voice, first person, 1-2 sentences. Say in one line what was posted.

## Report
One row per thing shipped:

| Task | Status | Branch | Live URL | Tests | Audit |
|---|---|---|---|---|---|

Put the commit next to the branch and the audit findings under Audit. Add decisions made on Rob's behalf and anything not done, then **tested / not tested**, and end with a card offering **Fresh session** and **Archive** (archive only on Rob's yes).
