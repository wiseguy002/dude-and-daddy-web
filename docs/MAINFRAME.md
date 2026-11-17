# Mainframe on dudeanddaddy.com

Mainframe (Rob's CMS, repo `wiseguy002/studio`, local `~/Studio`) edits this site through GitHub: a draft is a
branch `mainframe/<8 hex>`, Publish merges it into `main`, and Workers Builds puts `main` live as usual.
The rules are the Mainframe contract (`~/Studio/docs/CONTRACT.md`); this site's profile is `mainframe.json`.

## How this site fits

- No build step. The files in `site/` are the pages, so the markers stay in what visitors get. They are only
  `data-cms*` attributes and `<!-- cms:… -->` comments: nothing visible changes.
- Pages are `site/index.html` and `site/<name>/index.html`. `pages.route` uses folder routes
  (`"site/*/index.html": "/{dir}/"`), which needs the folder-route rule in Mainframe core (keys containing "/"
  match the whole path; `{dir}` = the page's folder). Until core has it, Mainframe shows every page as `/index`.
- Hide/show works without a build: a hidden block is wrapped in `<template data-cms-hidden>`, which browsers never show.
- Page settings (title, description) are not used here: titles and share text stay in each page's `<head>`, edited by Claude.
- New pictures go in `site/pictures/` (normal caching). `/assets/*` is cached for a year, so don't upload there.

## What Rob can edit

| Page | Editable | Sections (hide, move, copy) |
|---|---|---|
| Home | headline, small line above it, hero buttons, announcement strip, game heading, game logo, game buttons, receipt lines, crew intro, name tags, history lines, news-list intro | name tags, history lines |
| Our story | headline, intro, headings, the two people cards, "how we make games", say-hi text, play button | people cards |
| Dev diary | headline, intro, studio notes (title, date, text), patch notes (title, date, list) | studio notes, patch notes |
| Merch ideas | headline, intro, each idea's words and caption | merch ideas |
| For creators | headline, intro, headings, rules 2-5, making-money text, small print, streams text | none |
| Classroom | headline, intro, activity titles, activity 1 text, tech notes 1, 2, 4 | none |
| Press kit | headline, intro, fact sheet, about texts, game features, logos, logo rules, newsletter and contact text | none |

Locked (Mainframe refuses changes): the header, the store-announcement bar and the footer on every page, the
sign-up form, the privacy page, the two `/news/` pages, `_headers`, `_redirects`, the scripts, the Worker,
`wrangler.jsonc`, `mainframe.json` and the CI workflow. Paragraphs whose links carry styling classes or
`rel="noopener"` (for example the home intro) are not marked, because Mainframe's rich text can't keep those.
Required on every page: `DADDY LLC` and `hello@dudeanddaddy.com` (both in the locked footer).

## Draft previews

Workers Builds already uploads a preview version for every branch that is not `main` and reports the
check run "Workers Builds: studio" on its commit. Mainframe opens `https://<branch slug>-studio.robewise.workers.dev`
(for `mainframe/1a2b3c4d`: `mainframe-1a2b3c4d-studio...`). Previews use the preview KV list and have no mail
secrets, so their sign-up form says the mail room is closed. Previews need a sign-in: Cloudflare Access covers
the `studio` Worker's preview URLs (scope "Previews only", Cloudflare account members only); dudeanddaddy.com
itself stays public.

Setup (done 2026-11-16):
- [x] Mainframe GitHub App ("Rob's Studio", becoming Mainframe) installed on `dude-and-daddy-web`.
- [x] Cloudflare Access on the preview URLs (checked: a preview answers 302 to the Access sign-in).
- Keep Workers Builds' builds for non-production branches and Preview URLs switched on (both on).

## Checks

`node scripts/check-markers.mjs --profile` (markers, required text, profile, routes) and
`node --test tests/*.mjs scripts/*.test.mjs`. CI (`.github/workflows/ci.yml`) runs both on pull requests and
on pushes to `main`, `mainframe/**` and `studio/**`. CI only checks; it never deploys.
