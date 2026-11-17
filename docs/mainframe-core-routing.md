# Dude & Daddy onboarding: Mainframe core needs folder routes (from the dude-and-daddy session)

dudeanddaddy.com serves `site/` as-is (no build): pages are `site/index.html` and `site/<name>/index.html`.
Mainframe `src/site.js` `routeOf()` matches `pages.route` keys against the FILE NAME only, so every
`index.html` maps to "/". That breaks live checks after publish, preview links and the "link goes to a page
that does not exist" check.

## Proposed additive core change (backwards compatible)

In `routeOf(profile, path)`: if a route key contains "/", match it against the whole repo path, and fill
`{dir}` with the page's parent folder path below the key's fixed prefix.

```js
export function routeOf(profile, path) {
  const file = path.split("/").pop();
  const name = file.replace(/\.html$/, "");
  const map = profile.pages.route || {};
  for (const [k, v] of Object.entries(map)) {           // NEW: full-path keys first
    if (!k.includes("/") || !globToRegExp(k).test(path)) continue;
    const base = k.slice(0, k.search(/[*?]|$/)).replace(/[^/]*$/, "");
    const dir = path.slice(base.length).split("/").slice(0, -1).join("/");
    return v.replace("{name}", name).replace("{dir}", dir);
  }
  if (Object.hasOwn(map, file)) return map[file].replace("{name}", name);
  for (const [k, v] of Object.entries(map)) if (globToRegExp(k).test(file)) return v.replace("{name}", name);
  return "/" + name;
}
```

dude-and-daddy-web `mainframe.json` uses:

```json
"pages": { "sources": "site/**index.html",
           "route": { "site/index.html": "/", "site/*/index.html": "/{dir}/", "site/*/*/index.html": "/{dir}/" } }
```

(`site/news/confirm/index.html` → `/news/confirm/`.) Order matters: exact `site/index.html` first.
Test cases: site/index.html → "/"; site/story/index.html → "/story/"; site/news/confirm/index.html → "/news/confirm/".
Also: `pagesFolder` → "site/" (new pages would land as site/foo.html → /foo); D&D profile lists no templates,
so "add a page" stays off for this site.

Draft previews: Workers Builds already uploads a preview for every non-main branch and reports the check run
"Workers Builds: studio". previewUrl = `https://{slug}-studio.robewise.workers.dev`.

## Result (2026-11-16)
PR https://github.com/wiseguy002/dude-and-daddy-web/pull/8 (not merged). CI "site" green. Branch preview verified:
https://claude-mainframe-onboard-a0fafd-studio.robewise.workers.dev/ serves the marked pages (200), so the
previewUrl pattern is right. Second core ask: this site has no build, so Mainframe's "page settings" (pageMeta)
would write an inert front-matter line before <!doctype>; core should hide page settings for such profiles
(e.g. when no templates/partials, or a profile flag).
