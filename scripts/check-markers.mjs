// Copied from wiseguy002/IDID scripts/check-markers.mjs (field, lock, area and block rules unchanged).
// Checks Mainframe markers (contract §2-4) in the page files Mainframe may edit (mainframe.json pages.sources).
// This site has no build: the files in site/ are what visitors get, so the checks run on them directly.
//   node scripts/check-markers.mjs            check markers and required text in every page file
//   node scripts/check-markers.mjs --profile  also check mainframe.json (paths exist, routes, theme contrast >= 4.5:1)
// Exit 1 with a list of problems, 0 when clean. No packages needed.
import { readFileSync, readdirSync, existsSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const TYPES = new Set(['text', 'rich', 'link', 'image']);
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const RICH_TAGS = new Set(['p', 'h2', 'h3', 'ul', 'ol', 'li', 'strong', 'em', 'a', 'blockquote', 'br']);
const URL_OK = /^(https?:|mailto:|sms:|tel:|\/(?!\/)|#)/;
const attrs = (s) => Object.fromEntries([...s.matchAll(/([a-zA-Z:-]+)(?:="([^"]*)")?/g)].map((m) => [m[1], m[2] ?? '']));

// Elements with their spans: [{ tag, attrs, start, openEnd, closeStart, end }]
function elements(html) {
  const out = [], stack = [];
  for (const m of html.matchAll(/<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g)) {
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
    const inner = html.slice(f.openEnd, f.closeStart);
    if (type === 'text' && /<[a-zA-Z/]/.test(inner)) errs.push(`text field "${id}" contains tags`);
    if (type === 'rich') errs.push(...checkRich(inner, id));
    if (type === 'link') {
      if (f.tag !== 'a') errs.push(`link field "${id}" must be on <a>`);
      else if (/<[a-zA-Z/]/.test(inner)) errs.push(`link field "${id}" text contains tags`);
    }
    if (type === 'image') {
      if (f.tag !== 'img') errs.push(`image field "${id}" must be on <img>`);
      else if (!('alt' in f.attrs)) errs.push(`image field "${id}" needs alt`);
      else if (f.attrs.alt === '' && !('data-cms-decorative' in f.attrs)) errs.push(`image field "${id}" has empty alt without data-cms-decorative`);
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

// Blog post bodies (contract §7): only the rich-text allowlist (tags, href on a, class="note" on p, safe URLs).
export const checkPost = (body, file) => checkRich(body, 'body').map((e) => `${file}: ${e.replace('rich field "body"', 'post body')}`);

// ---- Profile (mainframe.json) ----
const lum = (hex) => {
  const c = hex.replace('#', '').match(/../g).map((x) => parseInt(x, 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
export const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

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

// Address of a page file. Route keys with a "/" match the whole path and fill {dir} with the page's folder
// (the folder-route rule asked of Mainframe core for this site); other keys match the file name.
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

const walk = (root, dir = '') => readdirSync(join(root, dir), { withFileTypes: true })
  .flatMap((d) => (d.isDirectory() ? walk(root, join(dir, d.name)) : [join(dir, d.name)]));
export const profileFile = (root) => ['mainframe.json', 'studio.json'].find((f) => existsSync(join(root, f)));
export const readProfile = (root) => JSON.parse(readFileSync(join(root, profileFile(root)), 'utf8'));
export const pageFiles = (root, p) => walk(root).filter((f) => globToRegExp(p.pages.sources).test(f)).sort();

export function checkProfile(root) {
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
  const pages = p.pages?.sources ? pageFiles(root, p) : [];
  if (!pages.length) errs.push(`${name}: pages.sources "${p.pages?.sources}" matches nothing`);
  // Every page must have its own address, and that address must serve that file (Workers assets rules).
  const seen = new Map();
  for (const f of pages) {
    const r = routeOf(p.pages.route || {}, f);
    if (seen.has(r)) errs.push(`${name}: ${f} and ${seen.get(r)} both get the address ${r}`);
    seen.set(r, f);
    const served = (p.siteRoot || 'site/') + (r.endsWith('/') ? r.slice(1) + 'index.html' : r.slice(1) + '.html');
    if (served !== f) errs.push(`${name}: ${f} gets the address ${r}, which serves ${served}`);
  }
  for (const x of p.partials || []) has(x.file, 'partial');
  for (const x of p.templates || []) has(x.file, 'template');
  for (const l of p.lists || []) has(l.file, `list ${l.id} file`);
  if (p.media) has(p.media.folder, 'media.folder');
  if (p.settings?.redirects) has(p.settings.redirects, 'settings.redirects');
  if (p.settings?.noindex) has(p.settings.noindex.file, 'settings.noindex.file');
  if (p.build?.ci) has(`.github/workflows/${p.build.ci}`, 'build.ci');
  for (const f of p.rules?.lockedFiles || []) has(f, 'rules.lockedFiles');
  return errs;
}

// Required text (rules.requiredText) on every page file. There is no build, so the files are the pages.
export function checkRequired(root, p = readProfile(root)) {
  const errs = [];
  for (const f of pageFiles(root, p)) {
    const html = readFileSync(join(root, f), 'utf8');
    for (const t of p.rules?.requiredText || []) if (!html.includes(t)) errs.push(`${f}: "${t}" is missing (it must stay on every page)`);
  }
  return errs;
}

// ---- CLI ----
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const errs = [];
  const p = readProfile(root);
  const files = pageFiles(root, p);
  for (const f of [...files, ...(p.partials || []).map((x) => x.file), ...(p.templates || []).map((x) => x.file)]) {
    errs.push(...checkFile(readFileSync(join(root, f), 'utf8'), f));
  }
  errs.push(...checkRequired(root, p));
  if (process.argv.includes('--profile')) errs.push(...checkProfile(root));
  if (errs.length) { console.log(errs.join('\n')); console.log(`${errs.length} problem(s).`); process.exit(1); }
  console.log(`Markers OK in ${files.length} page file(s)${process.argv.includes('--profile') ? `, ${profileFile(root)} OK` : ''}.`);
}
