# DUDE & DADDY studio site — notes for Claude

Rob (Daddy) and his son (Dude) run DUDE & DADDY LLC. Their game, Clean Up On Aisle Scream!, has its own repo
(`wiseguy002/clean-up-on-aisle-scream`, local `~/Clean Up On Aisle Scream`) and owns cleanuponaislescream.com.

## Where things are
- `site/` — dudeanddaddy.com, plain files; `worker/index.mjs` — the Store News sign-up (`/api/*`). Worker `studio`,
  deployed by Workers Builds on every push to `main`. Setup and secrets: `DEPLOY.md`. Tests: `node --test tests/*.mjs`.
- `status/` — status.dudeanddaddy.com + the back office at /console (worker `dude-and-daddy-status`, deployed by hand
  from that folder, NOT by Workers Builds). Watches both the studio and the game. Everything about it: `status/README.md`.

## State (2026-11-14)
- Done: status page + back office live, Rob signed in fine. News sign-up fixed (its Resend key had been deleted; new
  sending-only key `dude-and-daddy-studio`). Branch `claude/changes` holds the status work; not merged to `main` yet.
- Waiting on Rob: alert emails for the status page (`RESEND_API_KEY`, `ALERT_TO` on `dude-and-daddy-status`).
- "Setup to fix" (shown in the back office, each is one Cloudflare switch; ask Rob before changing account settings):
  Always Use HTTPS on both zones; www.cleanuponaislescream.com doesn't exist; no DMARC on dudeanddaddy.com.
- Sending-only key means new subscribers are NOT copied to the Resend "Dude & Daddy news" segment; copy them across
  before a Broadcast.
- Ideas: point the game site's own /status/ page at status.dudeanddaddy.com (game repo).

## How Rob likes to work
Not a developer: plain language, outcome first, tested / not tested. One small step at a time when he has to do
something himself; open the terminal command or page for him. He sets secrets himself (one command at a time); ask
before deploys and account changes. Prefer the least-access key (he chose sending-only over full access).
