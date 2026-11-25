// Mainframe site kit 2.1.0: the shared safety check. Master copy lives in wiseguy002/mainframecms kit/check-markers.mjs;
// Mainframe's "Update this site" keeps this file in step. Do not edit it in a site repo (Mainframe shows "Changed by hand").
// Checks Mainframe markers (contract §2-4) in the page files Mainframe may edit, the site's posts and lists, and the profile.
//   node <dir>/check-markers.mjs            markers in pages, partials, templates; posts; required text (sites with no build)
//   node <dir>/check-markers.mjs --profile  also check mainframe.json (or the older studio.json): paths exist, addresses,
//                                           theme contrast >= 4.5:1, list files in the { items: [{ id, on, … }] } shape
//   node <dir>/check-markers.mjs --built    also check the built pages (build.output, default dist/): every
//                                           rules.requiredText is on every page and no marker is left
// Everything is read from the site's own profile; no site is named here. Exit 1 with a list of problems, 0 when clean.
// No packages needed.
import { readFileSync, readdirSync, existsSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const KIT_VERSION = '2.1.0';
const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const TYPES = new Set(['text', 'rich', 'link', 'image']);
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const RICH_TAGS = new Set(['p', 'h2', 'h3', 'ul', 'ol', 'li', 'strong', 'em', 'a', 'blockquote', 'br']);
// Safe addresses: no protocol-relative "//" or "/\\", no backslashes or control characters anywhere (browsers fix those up).
const URL_RE = /^(https?:|mailto:|sms:|tel:|\/(?![\/\\])|#)/;
const URL_OK = { test: (v) => URL_RE.test(v) && !/[\\\x00-\x1f\x7f]/.test(v) };
// Attribute names lowercased; the FIRST copy wins, as in browsers. `dup` lists names written twice.
const attrs = (s) => {
  const out = {}, dup = [];
  for (const m of s.matchAll(/([a-zA-Z:-]+)(?:="([^"]*)")?/g)) { const k = m[1].toLowerCase(); if (k in out) dup.push(k); else out[k] = m[2] ?? ''; }
  Object.defineProperty(out, 'dup', { value: dup, enumerable: false });
  return out;
};

// Elements with their spans: [{ tag, attrs, start, openEnd, closeStart, end }]
function elements(html) {
  const out = [], stack = [];
  // Comments end like browsers end them ("<!-->" and "<!--->" are complete); a quoted ">" inside a tag does not end the tag.
  for (const m of html.matchAll(/<!--(?:-?>|[\s\S]*?--!?>)|<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b((?:"[^"]*"|'[^']*'|[^>"'])*)>/g)) {
    if (m[0].startsWith('<!--')) continue;
    const [, close, rawTag, rest] = m, tag = rawTag.toLowerCase();
    if (!close) {
      const el = { tag, attrs: attrs(rest), start: m.index, openEnd: m.index + m[0].length };
      out.push(el);
      if (VOID.has(tag) || rest.trim().endsWith('/')) { el.closeStart = el.end = el.openEnd; } else stack.push(el);
    } else {
      const i = stack.map((e) => e.tag).lastIndexOf(tag);
      if (i < 0) continue;
      const [el] = stack.splice(i); // drop unclosed children too (e.g. <p> closed implicitly)
      el.closeStart = m.index; el.end = m.index + m[0].length;
    }
  }
  for (const el of stack) { el.closeStart = el.end = html.length; el.unclosed = true; }
  return out;
}

// Strict: every "<" must start a complete allowlisted tag written as <tag> or <tag name="value" …>
// (lowercase, single spaces, double-quoted values only). Anything else is refused, never guessed at.
const TAG = /^<(\/?)([a-z][a-z0-9]*)((?: [a-z]+="[^"<>]*")*)\s*(\/?)\s*>/;
function checkRich(inner, id) {
  const errs = [];
  for (let i = inner.indexOf('<'); i >= 0; i = inner.indexOf('<', i + 1)) {
    const m = inner.slice(i).match(TAG);
    if (!m) { errs.push(`rich field "${id}" has a "<" that is not a simple allowed tag: ${JSON.stringify(inner.slice(i, i + 40))}`); continue; }
    const [, close, tag, rest] = m;
    if (!RICH_TAGS.has(tag)) { errs.push(`rich field "${id}" has <${tag}> (not allowed)`); continue; }
    if (close && rest) { errs.push(`rich field "${id}" has attributes on </${tag}>`); continue; }
    const seenAttr = new Set();
    for (const [, k, v] of rest.matchAll(/ ([a-z]+)="([^"]*)"/g)) {
      if (seenAttr.has(k)) errs.push(`rich field "${id}" repeats attribute ${k} on <${tag}>`);
      seenAttr.add(k);
      if (tag === 'a' && k === 'href') { if (!URL_OK.test(v)) errs.push(`rich field "${id}" has a link href "${v}" that is not allowed`); }
      else if (tag === 'p' && k === 'class' && v === 'note') { /* ok */ }
      else errs.push(`rich field "${id}" has attribute ${k} on <${tag}> (not allowed)`);
    }
  }
  return errs;
}

export function checkFile(html, file) {
  const errs = [], ids = new Map();
  const seen = (id, what) => {
    if (!ID.test(id)) errs.push(`${what} id "${id}" must match ${ID}`);
    else if (ids.has(id)) errs.push(`${what} id "${id}" used twice`);
    ids.set(id, what);
  };
  const els = elements(html);
  const fields = els.filter((e) => 'data-cms' in e.attrs);
  const locks = els.filter((e) => 'data-cms-lock' in e.attrs);
  for (const f of fields) {
    const id = f.attrs['data-cms'], type = f.attrs['data-cms-type'];
    seen(id, 'field');
    if (!TYPES.has(type)) { errs.push(`field "${id}" has type "${type}" (use text, rich, link or image)`); continue; }
    if (f.attrs.dup.length) errs.push(`field "${id}" repeats attribute ${f.attrs.dup.join(', ')}`);
    const inner = html.slice(f.openEnd, f.closeStart);
    if ('data-cms-wrap' in f.attrs && (f.tag !== 'span' || type !== 'text' || Object.keys(f.attrs).some((k) => !k.startsWith('data-cms')))) errs.push(`field "${id}": data-cms-wrap is only for <span> text fields with nothing but data-cms attributes`);
    if (type === 'text' && /<[a-zA-Z/]/.test(inner)) errs.push(`text field "${id}" contains tags`);
    for (const k of Object.keys(f.attrs)) if (/^on/i.test(k)) errs.push(`field "${id}" has an event attribute ${k} (not allowed)`);
    if (type === 'rich') errs.push(...checkRich(inner, id));
    if (/\{\{[a-z0-9-]+\}\}/.test(inner)) errs.push(`field "${id}" holds a {{slot}}: slots belong outside fields, where Mainframe can't delete them`);
    if (type === 'link') {
      if (f.tag !== 'a') errs.push(`link field "${id}" must be on <a>`);
      else if (/<[a-zA-Z/]/.test(inner)) errs.push(`link field "${id}" text contains tags`);
      if (f.tag === 'a' && !URL_OK.test(f.attrs.href || '')) errs.push(`link field "${id}" has an href "${f.attrs.href || ''}" that is not allowed`);
    }
    if (type === 'image') {
      if (f.tag !== 'img') errs.push(`image field "${id}" must be on <img>`);
      else if (!('alt' in f.attrs)) errs.push(`image field "${id}" needs alt`);
      else if (f.attrs.alt === '' && !('data-cms-decorative' in f.attrs)) errs.push(`image field "${id}" has empty alt without data-cms-decorative`);
      if (f.tag === 'img' && (!/^(https:|\/(?![\/\\]))/.test(f.attrs.src || '') || /[\\\x00-\x1f\x7f]/.test(f.attrs.src || ''))) errs.push(`image field "${id}" has a src "${f.attrs.src || ''}" that is not allowed (https: or /…)`);
      if (els.some((p) => p.tag === 'picture' && p.start < f.start && f.end <= p.end)) errs.push(`image field "${id}" is inside <picture> (not supported in v1)`);
    }
    for (const o of fields) if (o !== f && o.start < f.start && f.end <= o.end) errs.push(`field "${id}" is inside field "${o.attrs['data-cms']}"`);
    for (const l of locks) if (l.start <= f.start && f.end <= l.end) errs.push(`field "${id}" is inside a lock`);
  }
  // Areas and blocks.
  let area = null, block = null, last = 0;
  for (const m of html.matchAll(/<!-- (\/?)cms:(area|block)\b([^>]*?)-->/g)) {
    const [, close, kind, rest] = m, a = attrs(rest);
    if (!close) {
      if (kind === 'area') {
        if (area) errs.push(`areas do not nest (area "${a.id}" inside "${area}")`);
        seen(a.id, 'area'); area = a.id;
      } else {
        if (!area) errs.push(`block "${a.id}" is not inside an area`);
        if (block) errs.push(`blocks do not nest (block "${a.id}" inside "${block.id}")`);
        else if (area && html.slice(last, m.index).trim()) errs.push(`area "${area}" may hold only blocks (found other content before block "${a.id}")`);
        seen(a.id, 'block'); block = { id: a.id, start: m.index + m[0].length };
      }
      if (!a.label) errs.push(`${kind} "${a.id}" needs a label`);
    } else if (kind === 'block') {
      if (!block) errs.push('a /cms:block closes nothing');
      else {
        const body = html.slice(block.start, m.index);
        if (/<template data-cms-hidden>/.test(body) && !/^\s*<template data-cms-hidden>[\s\S]*<\/template>\s*$/.test(body)) errs.push(`hidden block "${block.id}" must be wrapped in exactly one <template data-cms-hidden>`);
      }
      block = null;
    } else {
      if (!area) errs.push('a /cms:area closes nothing');
      else if (block) errs.push(`block "${block.id}" is not closed before area "${area}" ends`);
      else if (html.slice(last, m.index).trim()) errs.push(`area "${area}" may hold only blocks (found other content at its end)`);
      area = null;
    }
    last = m.index + m[0].length;
  }
  if (block) errs.push(`block "${block.id}" is not closed`);
  if (area) errs.push(`area "${area}" is not closed`);
  return errs.map((e) => `${file}: ${e}`);
}

// Post bodies (contract §7): only the rich-text allowlist (tags, href on a, class="note" on p, safe URLs).
export const checkPost = (body, file) => checkRich(body, 'body').map((e) => `${file}: ${e.replace('rich field "body"', 'post body')}`);

// ---- Files named by the profile ----
// Same tiny glob as Mainframe (src/glob.js): "*" within one folder, "**" across folders.
export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') { re += '.*'; i++; if (glob[i + 1] === '/') i++; }
    else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp('^' + re + '$');
}

// Address of a page file (contract §8). Route keys with a "/" match the whole path and fill {dir} with the page's
// folder; other keys match the file name.
export function routeOf(route, path) {
  const file = path.split('/').pop(), name = file.replace(/\.html$/, '');
  for (const [k, v] of Object.entries(route)) {
    if (!k.includes('/') || !globToRegExp(k).test(path)) continue;
    const base = k.slice(0, k.search(/[*?]|$/)).replace(/[^/]*$/, '');
    return v.replace('{name}', name).replace('{dir}', path.slice(base.length).split('/').slice(0, -1).join('/'));
  }
  if (Object.hasOwn(route, file)) return route[file].replace('{name}', name);
  for (const [k, v] of Object.entries(route)) if (globToRegExp(k).test(file)) return v.replace('{name}', name);
  return '/' + name;
}

const SKIP = new Set(['node_modules', '.git']);
const walk = (root, dir = '') => readdirSync(join(root, dir), { withFileTypes: true })
  .flatMap((d) => (d.isDirectory() ? (SKIP.has(d.name) ? [] : walk(root, join(dir, d.name))) : [join(dir, d.name)]));
export const profileFile = (root) => ['mainframe.json', 'studio.json'].find((f) => existsSync(join(root, f)));
export const readProfile = (root) => { const f = profileFile(root); return f ? JSON.parse(readFileSync(join(root, f), 'utf8')) : {}; };
// Page files the profile's pages.sources matches, searched only below its fixed start (e.g. site/pages/).
export function pageFiles(root, p) {
  const src = p.pages?.sources;
  if (!src) return [];
  const start = src.slice(0, src.search(/[*?]|$/)).replace(/[^/]*$/, '');
  if (start && !existsSync(join(root, start))) return [];
  const re = globToRegExp(src);
  return walk(root, start).filter((f) => re.test(f)).sort();
}
// Collection entries (posts): every .html file in each collection folder.
export const collectionFiles = (root, p = readProfile(root)) => (p.collections || []).flatMap((c) => {
  const folder = c.folder.replace(/\/$/, '');
  return existsSync(join(root, folder)) ? readdirSync(join(root, folder)).filter((x) => x.endsWith('.html')).map((f) => `${folder}/${f}`) : [];
});

// Collection entries (contract §7): a multi-line settings comment, then an allowlisted body.
export function checkCollections(root, p = readProfile(root)) {
  const errs = [];
  for (const file of collectionFiles(root, p)) {
    const src = readFileSync(join(root, file), 'utf8');
    const m = src.match(/^<!--\r?\n([\s\S]*?)\r?\n-->\r?\n/);
    if (!m) { errs.push(`${file}: must start with a <!-- … --> settings block, one "key: value" per line`); continue; }
    if (!/^[a-z0-9][a-z0-9-]{0,80}\.html$/.test(file.split('/').pop())) errs.push(`${file}: file name must be lowercase letters, numbers and dashes`);
    const meta = Object.fromEntries(m[1].split(/\r?\n/).map((l) => [l.slice(0, l.indexOf(':')).trim(), l.slice(l.indexOf(':') + 1).trim()]));
    if (!meta.title) errs.push(`${file}: needs a title`);
    if (meta.status && !['draft', 'published'].includes(meta.status)) errs.push(`${file}: status must be draft or published`);
    errs.push(...checkPost(src.slice(m[0].length), file));
  }
  return errs;
}

// Required text (rules.requiredText) on every page file, for sites with no build ("pageMeta": false): the files are the pages.
export function checkRequired(root, p = readProfile(root)) {
  const errs = [];
  for (const f of pageFiles(root, p)) {
    const html = readFileSync(join(root, f), 'utf8');
    for (const t of p.rules?.requiredText || []) if (!html.includes(t)) errs.push(`${f}: "${t}" is missing (it must stay on every page)`);
  }
  return errs;
}

// ---- Lists (contract §5) ----
// strict (the default when called directly): also the exact file layout and no fields the profile does not list.
// The CLI turns it on for a site whose mainframe-kit.json has "options": { "strictLists": true }.
export function checkList(json, def, { strict = true } = {}) {
  const errs = [], where = def.file;
  let obj;
  try { obj = JSON.parse(json); } catch { return [`${where}: not valid JSON`]; }
  if (!obj || !Array.isArray(obj.items)) return [`${where}: needs { "items": [ … ] }`];
  if (strict && json !== JSON.stringify(obj, null, 2) + '\n') errs.push(`${where}: must be written with 2-space indent and a final newline`);
  const keys = new Set((def.fields || []).map((f) => f.key)), ids = new Set();
  obj.items.forEach((it, i) => {
    const at = `${where} item ${i + 1}${it && it.id ? ` (${it.id})` : ''}`;
    if (!it || typeof it !== 'object' || Array.isArray(it)) { errs.push(`${at}: must be an object`); return; }
    if (!ID.test(it.id || '')) errs.push(`${at}: id must match ${ID}`);
    else if (ids.has(it.id)) errs.push(`${at}: id used twice`);
    ids.add(it.id);
    if (typeof it.on !== 'boolean') errs.push(`${at}: "on" must be true or false`);
    if (strict) for (const k of Object.keys(it)) if (k !== 'id' && k !== 'on' && !keys.has(k)) errs.push(`${at}: unknown field "${k}"`);
    for (const f of def.fields || []) {
      const v = it[f.key], empty = v === undefined || v === null || v === '';
      if (empty) { if (f.required) errs.push(`${at}: "${f.key}" is needed`); continue; }
      if (f.type === 'choice' && Array.isArray(f.choices) && !f.choices.includes(v)) errs.push(`${at}: "${f.key}" must be one of ${f.choices.join(', ')}`);
      if (['text', 'link', 'image'].includes(f.type) && typeof v !== 'string') errs.push(`${at}: "${f.key}" must be text`);
      if (f.max && typeof v === 'string' && [...v].length > f.max) errs.push(`${at}: "${f.key}" is longer than ${f.max}`);
      if ((f.type === 'link' || f.type === 'image') && typeof v === 'string' && !URL_OK.test(v)) errs.push(`${at}: "${f.key}" address "${v}" is not allowed`);
    }
  });
  return errs;
}

// ---- Built pages ----
export function checkBuilt(html, file, requiredText) {
  const errs = [];
  for (const t of requiredText || []) if (!html.includes(t)) errs.push(`${file}: missing required text "${t}"`);
  if (/ data-cms[\s=>-]|<!-- \/?cms:|<template data-cms-hidden/.test(html)) errs.push(`${file}: Mainframe markers left in the built page`);
  return errs;
}

// ---- Profile (mainframe.json, or the older studio.json) ----
const lum = (hex) => {
  const c = hex.replace('#', '').match(/../g).map((x) => parseInt(x, 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
export const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

// Per-site kit options, kept by Mainframe in mainframe-kit.json next to the profile.
export const kitOptions = (root) => { try { return JSON.parse(readFileSync(join(root, 'mainframe-kit.json'), 'utf8')).options || {}; } catch { return {}; } };

export function checkProfile(root, { strictLists = kitOptions(root).strictLists === true } = {}) {
  const name = profileFile(root);
  if (!name) return ['mainframe.json is missing'];
  const errs = [], p = readProfile(root);
  const has = (path, what) => { if (!path || !existsSync(join(root, path))) errs.push(`${name}: ${what} "${path}" does not exist`); };
  if (p.contract !== 1) errs.push(`${name}: contract must be 1`);
  for (const k of ['name', 'id', 'repo', 'branch', 'liveUrl', 'previewUrl']) if (!p[k]) errs.push(`${name}: missing ${k}`);
  if (p.previewUrl && !/^https:\/\/[^\s]*\{slug\}/.test(p.previewUrl)) errs.push(`${name}: previewUrl must be https and contain {slug}`);
  has(p.theme?.mark, 'theme.mark'); if (p.theme?.markDark) has(p.theme.markDark, 'theme.markDark');
  for (const mode of ['light', 'dark']) {
    const t = p.theme?.[mode] || {};
    for (const [fg, bg] of [['ink', 'page'], ['ink', 'panel'], ['muted', 'page'], ['sidebarInk', 'sidebar'], ['accentInk', 'accent'], ['danger', 'page']]) {
      if (!/^#[0-9a-fA-F]{6}$/.test(t[fg] || '') || !/^#[0-9a-fA-F]{6}$/.test(t[bg] || '')) { errs.push(`${name}: theme.${mode}.${fg}/${bg} must be #RRGGBB colors`); continue; }
      const r = contrast(t[fg], t[bg]);
      if (r < 4.5) errs.push(`${name}: theme.${mode} ${fg} on ${bg} is ${r.toFixed(2)}:1 (needs 4.5:1)`);
    }
  }
  const pages = pageFiles(root, p);
  if (!pages.length) errs.push(`${name}: pages.sources "${p.pages?.sources}" matches nothing`);
  // Every page must have its own address; on sites with no build that address must also serve that very file.
  const seen = new Map();
  for (const f of pages) {
    const r = routeOf(p.pages.route || {}, f);
    if (seen.has(r)) errs.push(`${name}: ${f} and ${seen.get(r)} both get the address ${r}`);
    seen.set(r, f);
    if (p.pageMeta === false) {
      const served = (p.siteRoot || 'site/') + (r.endsWith('/') ? r.slice(1) + 'index.html' : r.slice(1) + '.html');
      if (served !== f) errs.push(`${name}: ${f} gets the address ${r}, which serves ${served}`);
    }
  }
  for (const x of p.partials || []) has(x.file, 'partial');
  for (const x of p.templates || []) has(x.file, 'template');
  for (const c of p.collections || []) has(c.folder, `collection ${c.id} folder`);
  for (const l of p.lists || []) { has(l.file, `list ${l.id} file`); if (l.file && existsSync(join(root, l.file))) errs.push(...checkList(readFileSync(join(root, l.file), 'utf8'), l, { strict: strictLists })); }
  if (p.media) has(p.media.folder, 'media.folder');
  if (p.settings?.redirects) has(p.settings.redirects, 'settings.redirects');
  if (p.settings?.noindex) has(p.settings.noindex.file, 'settings.noindex.file');
  if (p.build?.ci) has(`.github/workflows/${p.build.ci}`, 'build.ci');
  for (const f of p.rules?.lockedFiles || []) has(f, 'rules.lockedFiles');
  return errs;
}

// ---- CLI ----
// With no profile file (e.g. a test copy of the site), the contract's default folders are checked, as the first copies did.
function runWithoutProfile(root) {
  const errs = [];
  let n = 0;
  for (const dir of ['site/pages', 'site/partials', 'site/templates']) {
    if (!existsSync(join(root, dir))) continue;
    for (const f of readdirSync(join(root, dir)).filter((x) => x.endsWith('.html'))) { errs.push(...checkFile(readFileSync(join(root, dir, f), 'utf8'), `${dir}/${f}`)); n++; }
  }
  if (existsSync(join(root, 'blog-src'))) for (const f of readdirSync(join(root, 'blog-src')).filter((x) => x.endsWith('.html'))) {
    errs.push(...checkPost(readFileSync(join(root, 'blog-src', f), 'utf8').replace(/^\s*<!--[\s\S]*?-->/, ''), `blog-src/${f}`)); n++;
  }
  return { errs, n };
}

export function run(root, argv) {
  if (!profileFile(root) && !argv.includes('--profile')) { const { errs, n } = runWithoutProfile(root); return { errs, message: `Markers OK in ${n} file(s) (site kit ${KIT_VERSION}).` }; }
  const errs = [], p = readProfile(root);
  const files = [...pageFiles(root, p), ...(p.partials || []).map((x) => x.file), ...(p.templates || []).map((x) => x.file)].filter((f) => existsSync(join(root, f)));
  for (const f of files) errs.push(...checkFile(readFileSync(join(root, f), 'utf8'), f));
  errs.push(...checkCollections(root, p));
  if (p.pageMeta === false) errs.push(...checkRequired(root, p));
  if (argv.includes('--profile')) errs.push(...checkProfile(root));
  if (argv.includes('--built')) {
    const out = (p.build?.output || 'dist').replace(/\/$/, ''), dist = join(root, out);
    if (!existsSync(dist)) errs.push(`${out}/ is missing: build the site first`);
    else for (const f of walk(dist).filter((x) => x.endsWith('.html'))) errs.push(...checkBuilt(readFileSync(join(dist, f), 'utf8'), `${out}/${f}`, p.rules?.requiredText));
  }
  const n = files.length + collectionFiles(root, p).length;
  return { errs, message: `Markers OK in ${n} file(s)${argv.includes('--profile') ? `, ${profileFile(root) || 'mainframe.json'} OK` : ''}${argv.includes('--built') ? ', built pages OK' : ''} (site kit ${KIT_VERSION}).` };
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const { errs, message } = run(fileURLToPath(new URL('../', import.meta.url)), process.argv.slice(2));
  if (errs.length) { console.log(errs.join('\n')); console.log(`${errs.length} problem(s).`); process.exit(1); }
  console.log(message);
}
