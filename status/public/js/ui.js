// Small helpers shared by the status page and the console. Text is always set as text, never HTML.
export function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'text') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) n.append(kid);
  return n;
}

export const WORDS = { up: 'Working', degraded: 'Slow or checking', down: 'Not working', unknown: 'Not checked yet' };
export const pill = (state) => el('span', { class: 'pill', 'data-state': state }, el('span', { class: 'dot', 'data-state': state }), WORDS[state] || state);

export function ago(ts, now = Date.now()) {
  if (!ts) return 'never';
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
export const stamp = (ts) => (ts ? new Date(ts).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

// 90 small bars, one per day. 99.5% or better counts as a good day.
export function bars(days) {
  const list = el('div', { class: 'bars', role: 'img', 'aria-label': summary(days) });
  for (const d of days) {
    const v = d.pct === null ? null : d.pct >= 99.5 ? 'good' : d.pct >= 90 ? 'some' : 'bad';
    list.append(el('i', { 'data-v': v, title: `${d.day}: ${d.pct === null ? 'no checks' : d.pct + '% working'}` }));
  }
  return list;
}
export function average(days) {
  const seen = days.filter((d) => d.pct !== null);
  return seen.length ? Math.round((seen.reduce((s, d) => s + d.pct, 0) / seen.length) * 100) / 100 : null;
}
function summary(days) {
  const a = average(days);
  return a === null ? 'No checks yet' : `${a}% working over the days we have checked`;
}
export const barsFoot = (days) => {
  const a = average(days);
  return el('div', { class: 'bars-foot' }, el('span', { class: 'long', text: '90 days ago' }), el('span', { class: 'short', text: '30 days ago' }), el('span', { text: a === null ? 'No history yet' : `${a}% working` }), el('span', { text: 'Today' }));
};

export const LEVEL_WORDS = { info: 'Notice', degraded: 'Slower than usual', down: 'Not working', maintenance: 'Planned work' };
export function notice(n) {
  return el('article', { class: 'notice', 'data-level': n.level, 'data-resolved': !!n.resolved_at },
    el('h3', { text: n.title }),
    n.message ? el('p', { text: n.message }) : null,
    el('div', { class: 'mute small', text: `${n.resolved_at ? 'Resolved ' + stamp(n.resolved_at) : LEVEL_WORDS[n.level] || n.level} · posted ${stamp(n.created_at)}` }));
}
