// The public status page: reads /api/status and draws it. Refreshes every minute.
import { el, pill, ago, bars, barsFoot, notice } from './ui.js';

const $ = (id) => document.getElementById(id);

async function load() {
  let data;
  try {
    const res = await fetch('/api/status', { cache: 'no-store' });
    data = await res.json();
    if (!res.ok) throw new Error();
  } catch {
    $('headline').textContent = 'Status is not answering';
    $('checked').textContent = 'Try again in a minute.';
    return;
  }
  const banner = $('banner');
  banner.dataset.state = data.overall;
  $('headline').textContent = data.headline;
  $('checked').textContent = data.checked ? `Last checked ${ago(data.checked)}` : 'Not checked yet';
  document.title = data.overall === 'up' ? 'DUDE & DADDY Status' : `(!) DUDE & DADDY Status: ${data.headline}`;
  $('notices').replaceChildren(...data.incidents.map(notice));
  $('groups').replaceChildren(...data.groups.map((g) =>
    el('section', { class: 'group', 'aria-labelledby': 'g-' + g.id },
      el('header', {}, el('div', {}, el('h3', { id: 'g-' + g.id, text: g.name }), el('div', { class: 'mute small', text: g.blurb })), pill(g.state)),
      g.items.map((i) => el('div', { class: 'item' },
        el('div', { class: 'row' }, el('span', { text: i.name }), pill(i.state)),
        bars(i.uptime), barsFoot(i.uptime))))));
}

load();
setInterval(load, 60000);
