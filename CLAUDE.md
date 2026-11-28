# dudeanddaddy.com (studio website) + status.dudeanddaddy.com

<!-- tagteam:start (managed by the tagteam tool; change rules/tag-team.md in TagTeam, not this copy) -->
## Tag team: two Claude accounts share this repo

CORE RULES:
- Always read CLAUDE.md and HANDOFF.md before editing code.
- Never commit directly to main or master. Merging into main needs the owner's yes.
- The home branch is the one on HANDOFF.md's `Branch:` line. Work on any local branch or worktree, but first bring the
  home branch in (`git fetch`, then `git merge --ff-only origin/<home branch>`) and push back to it at handoff.
- Keep changes atomic. Verify syntax or run tests before handing off.
- Never put `.env` files, keys or other secrets in a commit. Never force-push.
- These rules win over "feature branches stay local": handoff pushes to the home branch so the other account gets it.

HANDOFF.md always starts with these three lines under its title:

    Handoff code: TT-<yyyymmdd>-<n>
    Branch: <home branch>
    Next step: <one line>

ONE-WORD COMMANDS (execute exactly, no extra questions):

1. handoff
   a) Check modified files for syntax or type errors, and run the tests if there are any.
   b) Stage the work and commit it with a conventional message (feat:, fix:, refactor:).
   c) Update HANDOFF.md: the three lines above (new code: today's date, n one higher than before), then Branch &
      Latest Commit, Completed, Modified Files (exact paths), Do Not Repeat, Known Issues / Tests, Next Immediate Step.
   d) Commit HANDOFF.md ("docs: update handoff notes").
   e) If gitleaks is installed, run `gitleaks git . --no-banner --redact`; a finding stops the handoff.
   f) Push to the home branch: `git push origin HEAD:<home branch>`. Check the push succeeded. If it was refused,
      fetch, merge, and push again; if that fails, say so and do not call it safe.
   g) Reply only: "Committed, pushed, and saved to HANDOFF.md. Safe to switch accounts. Code: <new code>"

2. resume
   a) Read CLAUDE.md and HANDOFF.md. Bring in the home branch (see CORE RULES). If uncommitted work blocks that,
      say so and stop.
   b) Your first reply is exactly these four lines, nothing before them:
      Handoff code: <code>
      Branch: <home branch>
      Last commit: <short hash> <subject>
      Next step: <one line>
   c) If the code is missing, or `git diff --quiet "$(git log -1 --format=%H origin/<home branch> -- HANDOFF.md)"
      origin/<home branch>` fails (work was added after the handoff), say so and stop.
   d) Immediately start the next step.

3. review
   - Bring in the home branch, then diff the files listed in HANDOFF.md against main.
   - Look for edge cases, security issues, missing tests, and violations of CLAUDE.md.
   - Fix problems and commit, then finish with the handoff steps above.
<!-- tagteam:end -->

Read `DEPLOY.md` for how the site is hosted (Cloudflare Worker `studio`, deploys on every push to `main`).
Rob (Daddy) and his son (Dude) run DUDE & DADDY LLC; their game, Clean Up On Aisle Scream!, has its own repo
(`wiseguy002/clean-up-on-aisle-scream`, local `~/Clean Up On Aisle Scream`) and owns cleanuponaislescream.com.

## Where things are
- `site/` the pages (plain HTML, one folder per page), `site/assets/` CSS, the shared header/footer script and logos,
  `site/_headers` security + caching headers, `site/_redirects` (`/game` goes to cleanuponaislescream.com).
- `worker/index.mjs` the news list API (`/api/*`); tests: `node --test tests/*.mjs`.
- `status/` — status.dudeanddaddy.com + Rob's back office at /console (worker `dude-and-daddy-status`, deployed by
  hand with `cd status && npx wrangler deploy`, NOT by Workers Builds). Watches the studio AND the game. Everything
  about it (files, sign-in, secrets, local runs, gotchas): `status/README.md`. Tests: `cd status && npm test`,
  `npm run test:worker`. The list of what's watched: `status/src/assets.js`.
- The game is a separate repo and domain. Don't change it from here (the status page only reads it).

- `mainframe.json` + markers in the pages: Rob edits words, links and pictures with Mainframe (his CMS, ~/Studio).
  How it works here and what is locked: `docs/MAINFRAME.md`. Marker check: `node scripts/check-markers.mjs --profile`
  (also in `.github/workflows/ci.yml`, which only checks; Cloudflare Workers Builds still deploys).

## Rules
- Never merge or deploy until Rob types "merge" for that PR in this session's chat. Merging to `main` deploys live.
- Keep the Mainframe markers (`data-cms*`, `<!-- cms:… -->`) when editing pages by hand; run the marker check.
- No inline `<style>`, `<script>` or `style=""` in pages (the CSP blocks them). Bump `?v=` when an asset changes.
- No ads, no trackers. The news list is for 18+ only.
- Rob is not a developer: short, plain answers, outcome first, tested / not tested. One small step at a time when he
  has to do something himself; open the page or terminal command for him. He sets secrets himself, one command at a
  time; ask before deploys and account changes. He prefers the least-access key (chose sending-only over full access).

## State (2026-11-14)
- Audit done: strict CSP (no unsafe-inline), HSTS preload, COOP/CORP, no-transform, security headers on /api answers,
  `/.well-known/security.txt` (**expires 2027-11-14: renew before then**), logos as cached SVGs (home 135 KB -> 12 KB),
  landmarks/headings (axe 0 issues light+dark, 1280+375), HTML validates, press page points at the news list.
  Not tested: real phones, screen readers.
- Status page + back office live; Rob signed in (a same-day Defib/family sign-in carries over, so no login page).
- News sign-up fixed: the Resend key had been deleted; new sending-only key `dude-and-daddy-studio` (beepboopmail.com).
  Sending-only means new subscribers are NOT copied to the Resend "Dude & Daddy news" segment: copy them across
  before a Broadcast.
- Fixed in Cloudflare (API, Rob's OK): Always Use HTTPS on both zones; www.cleanuponaislescream.com = proxied AAAA
  100:: + Single Redirect (301 to the main address); `_dmarc.dudeanddaddy.com` = `v=DMARC1; p=none;` (monitor only —
  tighten once it's clear nothing sends as dudeanddaddy.com, e.g. Gmail "send as hello@").
- 2026-11-15: www.dudeanddaddy.com now 301s to the main address (dashboard Single Redirect "www to
  dudeanddaddy.com", keeps path + query; verified live). Status check `studio-www` expects that 301.

## Waiting on Rob
- Alert emails for the status page: `RESEND_API_KEY` + `ALERT_TO` on `dude-and-daddy-status` (until then alerts only log).
- Lawyer glance at the privacy page; confirm the LLC filing (see DEPLOY.md).

## Leftovers / ideas
- Trailing-slash redirects are 307 (Workers assets default); harmless, internal links already use the slash form.
- Press kit zip (3 MB) and gameplay GIF (1 MB) are large but only load on the press page.
- The game site's own /status/ page could link to status.dudeanddaddy.com (game repo).

## Capabilities
Read `docs/capabilities.md` before suggesting features (what is built, what needs setup); update it at every release.
