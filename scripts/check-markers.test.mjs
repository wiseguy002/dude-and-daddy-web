// Tests for the Mainframe marker check and this site's mainframe.json. Run: node --test scripts/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { checkFile, checkProfile, checkRequired, routeOf, pageFiles, readProfile } from './check-markers.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const profile = readProfile(root);
const read = (f) => readFileSync(root + f, 'utf8');

test('folder routes: each page file gets the address that serves it', () => {
  const r = profile.pages.route;
  assert.equal(routeOf(r, 'site/index.html'), '/');
  assert.equal(routeOf(r, 'site/story/index.html'), '/story/');
  assert.equal(routeOf(r, 'site/news/confirm/index.html'), '/news/confirm/');
  // file-name keys (weDID / iDID style) still work
  assert.equal(routeOf({ 'index.html': '/', '*.html': '/{name}' }, 'site/pages/about.html'), '/about');
});

test('the pages Mainframe sees are the ten site pages (404, assets and press files are not pages)', () => {
  const files = pageFiles(root, profile);
  assert.equal(files.length, 10);
  assert.ok(files.includes('site/index.html') && files.includes('site/news/unsubscribe/index.html'));
  assert.ok(!files.includes('site/404.html'));
});

test('every page file has valid markers and the required text; mainframe.json is valid', () => {
  for (const f of pageFiles(root, profile)) assert.deepEqual(checkFile(read(f), f), [], f);
  assert.deepEqual(checkRequired(root), []);
  assert.deepEqual(checkProfile(root), []);
});

test('the sign-up form, header, announcement bar and footer are locked', () => {
  assert.match(read('site/index.html'), /<form data-cms-lock id="newsform"/);
  for (const f of pageFiles(root, profile)) {
    const html = read(f);
    for (const tag of [/<header class="sitehead" data-cms-lock>/, /<aside data-cms-lock class="pabar"/, /<footer class="sitefoot" data-cms-lock>/]) assert.match(html, tag, f);
  }
  for (const f of ['site/privacy/index.html', 'site/news/confirm/index.html', 'site/news/unsubscribe/index.html', 'site/news/signup.js']) {
    assert.ok(profile.rules.lockedFiles.includes(f), `${f} locked`);
    if (f.endsWith('.html')) assert.doesNotMatch(read(f), /data-cms="/, `${f} has no fields`);
  }
});

test('marker check catches the usual mistakes', () => {
  const bad = (html) => checkFile(html, 'x.html').join('\n');
  assert.match(bad('<p data-cms="a" data-cms-type="text">x</p><p data-cms="a" data-cms-type="text">y</p>'), /used twice/);
  assert.match(bad('<form data-cms-lock><p data-cms="a" data-cms-type="text">x</p></form>'), /inside a lock/);
  assert.match(bad('<p data-cms="a" data-cms-type="rich"><a href="/" class="u-ul">x</a></p>'), /not allowed/);
  assert.match(bad('<p data-cms="a" data-cms-type="text"><b>x</b></p>'), /contains tags/);
  assert.match(bad('<img data-cms="a" data-cms-type="image" src="/x.png" alt="">'), /empty alt/);
  assert.match(bad('<!-- cms:area id="z" label="Z" --><p>stray</p><!-- cms:block id="b" label="B" -->x<!-- /cms:block --><!-- /cms:area -->'), /only blocks/);
});

test('a hidden block (wrapped in <template data-cms-hidden>) is valid and shows nothing without a build', () => {
  const html = read('site/index.html').replace(
    /(<!-- cms:block id="history-4"[^>]*-->)([\s\S]*?)(<!-- \/cms:block -->)/,
    (_, a, body, b) => `${a}<template data-cms-hidden>${body}</template>${b}`);
  assert.match(html, /<template data-cms-hidden>/);
  assert.deepEqual(checkFile(html, 'site/index.html'), []);
});
