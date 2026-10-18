# Putting dudeanddaddy.com on Cloudflare

This folder is the studio website. Nothing to build or install.

    site/    -> dudeanddaddy.com

The game, Clean Up On Aisle Scream!, is NOT part of this site. It has its own repo
(wiseguy002/clean-up-on-aisle-scream) and deploys itself to https://cleanuponaislescream.com
(see that repo's docs/cloudflare-setup.md). Every game button and link here goes there, and
dudeanddaddy.com/game/ forwards there (the `_redirects` file does it).

Do NOT add a redirect rule or any project for cleanuponaislescream.com from this repo.
The game's own Worker owns that domain.

## One-time setup
1. Put dudeanddaddy.com on Cloudflare (Add a domain, Free plan, switch nameservers).
2. Workers & Pages, Create, Pages, "Connect to Git", pick wiseguy002/dude-and-daddy-web.
   - Production branch: main
   - Framework preset: None
   - Build command: (leave empty)
   - Build output directory: site
3. Custom domains: add dudeanddaddy.com and www.dudeanddaddy.com.
4. SSL/TLS: Full (strict), Always Use HTTPS. Redirect Rule (301):
   www.dudeanddaddy.com/* to https://dudeanddaddy.com/$1

## Updating
Commit a change to main. Cloudflare publishes it in about a minute. Other branches get a
private preview link. Roll back any time from the Deployments tab.

## Before sharing widely
- The contact email on the privacy page is robewise@gmail.com (site/privacy/index.html).
- Have an attorney glance at the privacy page, especially since the game has nicknames and
  online play. The game needs its own privacy notice for COPPA.
- Confirm DUDE & DADDY LLC is fully filed with the Louisiana Secretary of State.
