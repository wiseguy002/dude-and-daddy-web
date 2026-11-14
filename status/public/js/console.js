// Rob's back office: everything DUDE & DADDY and Clean Up On Aisle Scream! in one place.
// Reads /api/console and /api/console/app. Text is always set as text (ui.js).
import { el, pill, ago, stamp, average, notice } from './ui.js';

const $ = (id) => document.getElementById(id);
const send = async (path, method, body) => {
  const res = await fetch(path, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) location.reload(); // signed out: the page shows the lock
  return { ok: res.ok, data };
};
const say = (id, text, bad) => { const m = $(id); m.textContent = text || ''; m.toggleAttribute('data-bad', !!bad); };

const CF = 'https://dash.cloudflare.com/?to=/:account';
const LINKS = [
  ['The game', [
    ['Cloudflare: game worker', 'clean-up-on-aisle-scream: deploys, logs, settings', CF + '/workers/services/view/clean-up-on-aisle-scream'],
    ['Family site + owner tools', 'Boards, players, public co-op switch (sign-in)', 'https://family.cleanuponaislescream.com/'],
    ['The claude.ai game page', 'The private page with its own scores', 'https://claude.ai/artifact/WeoYonivgDV3VffPsVFXTe'],
    ['itch.io dashboard', 'The itch.io page and its stats', 'https://itch.io/dashboard'],
    ['GitHub: the game', 'wiseguy002/clean-up-on-aisle-scream', 'https://github.com/wiseguy002/clean-up-on-aisle-scream'],
    ['cleanuponaislescream.com DNS', 'Game addresses and SSL settings', CF + '/cleanuponaislescream.com/dns/records'],
  ]],
  ['The studio', [
    ['Cloudflare: studio worker', 'studio: dudeanddaddy.com deploys, logs, secrets', CF + '/workers/services/view/studio'],
    ['News list storage', 'KV studio-signup: every confirmed subscriber', CF + '/workers/kv/namespaces'],
    ['Resend: Broadcasts', 'Write and send Store News', 'https://resend.com/broadcasts'],
    ['Resend: emails and domains', 'What was sent, beepboopmail.com records, keys', 'https://resend.com/emails'],
    ['GitHub: the studio site', 'wiseguy002/dude-and-daddy-web (this status page too)', 'https://github.com/wiseguy002/dude-and-daddy-web'],
    ['dudeanddaddy.com DNS', 'Site, status and email addresses', CF + '/dudeanddaddy.com/dns/records'],
    ['Email forwarding', 'hello@dudeanddaddy.com to Gmail', CF + '/dudeanddaddy.com/email/routing'],
  ]],
  ['Running the business', [
    ['Cloudflare Zero Trust', 'Who can sign in here and to the family site', 'https://one.dash.cloudflare.com/'],
    ['Cloudflare: all workers', 'The game, the studio and this status page', CF + '/workers-and-pages'],
    ['Dev Dash', 'Work board, releases, journey, business dates', 'https://claude.ai/artifact/37D7T5s1JAVpgCeVXrdgti'],
    ['Brand guide', 'Logos, colours, fonts, voice', 'https://claude.ai/artifact/X5m4EDxEP7CmaPuWsZ7ZaE'],
    ['Gmail', 'Where hello@ mail and alerts land', 'https://mail.google.com/'],
  ]],
];

function drawBoard(data) {
  $('you').textContent = data.you ? `Signed in as ${data.you}` : '';
  $('banner').dataset.state = data.overall;
  $('headline').textContent = data.headline;
  $('checked').textContent = data.checked ? `Last checked ${ago(data.checked)} (${stamp(data.checked)})` : 'Not checked yet: press Check now';
  const ours = data.groups.filter((g) => !g.ignore).flatMap((g) => g.items);
  const setup = data.groups.filter((g) => g.ignore).flatMap((g) => g.items);
  const toFix = setup.filter((i) => i.state !== 'up');
  const bad = ours.filter((i) => i.state === 'down').length;
  const slow = ours.filter((i) => i.state === 'degraded').length;
  const items = [...ours, ...setup];
  const find = (id) => items.find((i) => i.id === id) || {};
  $('tiles').replaceChildren(
    tile('Not working', bad, bad ? 'down' : 'up'),
    tile('Slow / re-checking', slow, slow ? 'degraded' : 'up'),
    tile('Setup to fix', toFix.length, toFix.length ? 'degraded' : 'up'),
    tile('Watched', items.length),
    tile("Game version (What's new)", find('game-updates').value ? 'v' + find('game-updates').value : '?'),
    tile('Open notices', data.incidents.filter((i) => !i.resolved_at).length),
  );
  const advice = [];
  for (const i of ours.filter((x) => x.state === 'down')) advice.push(['down', `${i.name}: ${i.note}.`]);
  for (const i of toFix) advice.push(['degraded', `Setup to fix: ${i.fix || i.name}`]);
  $('advice').replaceChildren(...advice.map(([level, t]) => el('p', { class: 'notice', 'data-level': level, text: t })));

  const rows = [];
  for (const g of data.groups) {
    rows.push(el('tr', { class: 'grp' }, el('td', { colspan: 7 }, g.name, ' ', g.ignore ? null : pill(g.state))));
    for (const i of g.items) {
      const avg = average(i.uptime);
      rows.push(el('tr', {},
        el('td', {}, i.name, i.public ? null : el('span', { class: 'tag', text: 'Private' }), g.ignore && i.state !== 'up' ? el('span', { class: 'tag fix', text: 'To fix' }) : null, el('div', { class: 'mute small', text: i.target })),
        el('td', {}, pill(i.state)),
        el('td', {}, i.note, i.value ? el('div', { class: 'mute small', text: 'Version ' + i.value }) : null, g.ignore && i.state !== 'up' && i.fix ? el('div', { class: 'mute small', text: 'Fix: ' + i.fix }) : null),
        el('td', { class: 'num', text: i.ms === null ? '' : i.ms + ' ms' }),
        el('td', { class: 'num', text: ago(i.checked) }),
        el('td', {}, el('div', { class: 'num', text: avg === null ? '—' : avg + '%' })),
        el('td', {}, i.manage ? el('a', { href: i.manage, target: '_blank', rel: 'noopener', text: 'Manage' }) : null)));
    }
  }
  $('watch-table').tBodies[0].replaceChildren(...rows);

  $('notice-list').replaceChildren(...(data.incidents.length ? data.incidents.map((n) => {
    const box = notice(n);
    box.append(el('div', { class: 'bar' },
      n.resolved_at
        ? el('button', { class: 'ghost', type: 'button', onclick: () => resolve(n.id, false), text: 'Reopen' })
        : el('button', { type: 'button', onclick: () => resolve(n.id, true), text: 'Mark resolved' })));
    return box;
  }) : [el('p', { class: 'mute', text: 'No notices in the last 60 days.' })]));

  const nameOf = Object.fromEntries(items.map((i) => [i.id, i.name]));
  $('change-table').tBodies[0].replaceChildren(...(data.changes || []).map((c) =>
    el('tr', {}, el('td', { class: 'num', text: stamp(c.ts) }), el('td', { text: nameOf[c.id] || c.id }), el('td', {}, pill(c.state)), el('td', { text: c.note || '' }))));
}

function tile(label, value, state, cls) {
  return el('div', { class: 'tile' + (cls ? ' ' + cls : ''), 'data-state': state }, el('span', { class: 'mute small', text: label }), el('b', { text: String(value) }));
}

async function resolve(id, resolved) {
  const r = await send('/api/console/incidents/' + id, 'PATCH', { resolved });
  if (r.ok) loadBoard();
  else alert(r.data.error || 'That did not work.');
}

async function loadBoard() {
  const r = await send('/api/console', 'GET');
  if (r.ok) drawBoard(r.data);
  else $('headline').textContent = r.data.error || 'The console is not answering.';
}

async function loadNumbers() {
  const r = await send('/api/console/app', 'GET');
  const d = r.data || {};
  const news = d.news || {};
  const game = d.game || {};
  const problems = [news.error, game.error].filter(Boolean);
  say('num-msg', problems.join(' '), problems.length > 0);
  const yes = (v) => (v === true ? 'Yes' : v === false ? 'No' : '?');
  $('num-tiles').replaceChildren(
    tile('News subscribers', news.error ? '?' : news.subscribers + (news.more ? '+' : ''), null, 'y'),
    tile('Confirm emails sent today', news.error ? '?' : news.confirmsToday),
    tile('Game server says', game.error ? '?' : game.ok ? 'OK' : 'Trouble', game.error ? null : game.ok ? 'up' : 'down'),
    tile('Scoreboard connected', game.error ? '?' : yes(game.board), game.board === false ? 'down' : null),
    tile('Co-op rooms connected', game.error ? '?' : yes(game.rooms), game.rooms === false ? 'down' : null),
  );
}

$('check').addEventListener('click', async (e) => {
  e.target.disabled = true;
  say('check-msg', 'Checking every aisle…');
  const r = await send('/api/console/check', 'POST', {});
  say('check-msg', r.ok ? (r.data.note || 'Done.') : r.data.error || 'That did not work.', !r.ok);
  e.target.disabled = false;
  loadBoard();
});

$('post').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const r = await send('/api/console/incidents', 'POST', { title: f.get('title'), message: f.get('message'), level: f.get('level') });
  say('post-msg', r.ok ? 'Posted. It shows on the public page now.' : r.data.error || 'That did not work.', !r.ok);
  if (r.ok) { e.target.reset(); loadBoard(); }
});

$('link-list').replaceChildren(...LINKS.flatMap(([heading, list]) => [
  el('h3', { text: heading }),
  ...list.map(([t, s, href]) => el('a', { href, target: '_blank', rel: 'noopener' }, t, el('span', { text: s }))),
]));

loadBoard();
loadNumbers();
setInterval(loadBoard, 60000);
