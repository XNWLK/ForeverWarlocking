// Your progress over the days: every fight that ran to its end leaves one line here - when, which build, how much of
// the sim's DPS you reached, and what "What it cost you" (js/cost.js) listed, as shares of your DPS. The Progress
// window draws it per build: your share of the sim day by day, and whether your usual mistakes are getting smaller.
// Kept in this browser only (a store of its own, js/settings.js).
import { getStore, saveStore } from './settings.js';
import { setTip } from './tooltip.js';

const MAX = 800;                                           // fights kept, the oldest go first
// The kinds of mistake, in the order the window lists them (cost.js tags each line of its list with one of these).
export const MISTAKES = [
  ['idle', 'Time not casting'], ['stopped', 'Casts you stopped'], ['dots', 'DoTs, Banes and the curse down'],
  ['early', 'DoTs cast again too early'], ['taps', 'Life Taps you did not need'], ['pet', 'Your demon not attacking']
];
const DAY = 86400000;

function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function whole(n) { return Math.round(n).toLocaleString('en-US'); }
function dayOf(at) { const d = new Date(at); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); }   // midnight, your time
function dayName(t) { return new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); }

function list() { const s = getStore('progress'); if (!Array.isArray(s.list)) s.list = []; return s.list; }

// e: { b: build key, n: build name, r: race, f: what kind of fight, s: seconds, dps, pct (or null), m: { kind: % of your DPS } }
export function noteProgress(e) {
  const all = list();
  all.push(Object.assign({ at: Date.now() }, e));
  if (all.length > MAX) all.splice(0, all.length - MAX);
  saveStore('progress');
}
// The sim's number came in after the fight was noted: fill in the share.
export function settleProgress(at, pct) {
  const all = list(), e = all[all.length - 1];
  if (e && e.at === at && e.pct == null) { e.pct = pct; saveStore('progress'); }
}

function average(values) { return values.length ? values.reduce(function (a, b) { return a + b; }, 0) / values.length : null; }

// Fills the Progress window. box: its body; current: the key of the build you play now (shown first).
export function drawProgress(box, current, chosen, choose) {
  box.textContent = '';
  const all = list();
  if (!all.length) {
    box.appendChild(el('p', 'Nothing here yet. Every fight you play to its end - your own, a challenge, a lesson, today\'s fight - is counted here, per build. Come back after a few.', 'hint'));
    return;
  }
  // The builds you have played, most played first; the one you play now first of all.
  const counts = {}, names = {};
  all.forEach(function (e) { counts[e.b] = (counts[e.b] || 0) + 1; names[e.b] = e.n; });
  const keys = Object.keys(counts).sort(function (a, b) { return (b === current) - (a === current) || counts[b] - counts[a]; });
  const pick = chosen && counts[chosen] ? chosen : keys[0];
  if (keys.length > 1) {
    const row = el('div', null, 'tabs progress-tabs');
    keys.forEach(function (k) {
      const b = el('button', names[k] + ' (' + counts[k] + ')');
      b.type = 'button';
      if (k === pick) b.classList.add('on');
      b.addEventListener('click', function () { b.blur(); choose(k); });
      row.appendChild(b);
    });
    box.appendChild(row);
  }
  const mine = all.filter(function (e) { return e.b === pick; }), rated = mine.filter(function (e) { return e.pct != null; });

  // The headline numbers.
  const now = Date.now(), week = rated.filter(function (e) { return now - e.at < 7 * DAY; }), before = rated.filter(function (e) { return now - e.at >= 7 * DAY && now - e.at < 14 * DAY; });
  const days = {};
  mine.forEach(function (e) { days[dayOf(e.at)] = true; });
  const tiles = el('div', null, 'tiles');
  function tile(value, label, note) { const t = el('div', null, 'tile'); t.append(el('b', value), el('span', label)); if (note) t.appendChild(el('small', note)); tiles.appendChild(t); }
  tile(String(mine.length), mine.length === 1 ? 'fight' : 'fights', Object.keys(days).length + (Object.keys(days).length === 1 ? ' day' : ' days'));
  if (rated.length) tile(Math.max.apply(null, rated.map(function (e) { return e.pct; })) + '%', 'your highest', 'share of the sim\'s DPS');
  const w = average(week.map(function (e) { return e.pct; })), b4 = average(before.map(function (e) { return e.pct; }));
  if (w != null) tile(Math.round(w) + '%', 'the last 7 days', b4 != null ? (w >= b4 ? '+' : '−') + Math.abs(Math.round(w - b4)) + ' against the 7 before' : week.length + (week.length === 1 ? ' fight' : ' fights'));
  box.appendChild(tiles);

  // Your share of the sim, day by day: the average of each day's fights, the range from lowest to highest behind it.
  box.appendChild(el('h3', 'Your share of the sim\'s DPS, day by day'));
  const byDay = {};
  rated.forEach(function (e) { (byDay[dayOf(e.at)] = byDay[dayOf(e.at)] || []).push(e.pct); });
  const dayKeys = Object.keys(byDay).map(Number).sort(function (a, b) { return a - b; }).slice(-30);
  if (dayKeys.length < 2) box.appendChild(el('p', dayKeys.length ? 'One day so far. Play on another day and the line starts.' : 'No fight with the sim\'s number yet.', 'hint'));
  else box.appendChild(dayChart(dayKeys, byDay));

  // The mistakes: earlier against lately, as shares of your DPS.
  box.appendChild(el('h3', 'Your mistakes: are they getting smaller?'));
  const withCost = mine.filter(function (e) { return e.m; });
  if (withCost.length < 4) { box.appendChild(el('p', 'After a few more fights this compares your first ones with your latest ones.', 'hint')); }
  else {
    const half = Math.min(10, Math.floor(withCost.length / 2)), early = withCost.slice(0, half), late = withCost.slice(-half);
    const t = document.createElement('table'), head = document.createElement('tr');
    ['', 'Your first ' + half, 'Your last ' + half, ''].forEach(function (h, i) { const th = el('th', h); if (i === 1 || i === 2) th.className = 'num'; head.appendChild(th); });
    const thead = document.createElement('thead'); thead.appendChild(head); t.appendChild(thead);
    const body = document.createElement('tbody');
    MISTAKES.forEach(function (m) {
      const a = average(early.map(function (e) { return e.m[m[0]] || 0; })), z = average(late.map(function (e) { return e.m[m[0]] || 0; }));
      if (a < 0.05 && z < 0.05) return;                   // never happened
      const tr = document.createElement('tr'), change = z - a;
      const word = Math.abs(change) < Math.max(0.3, a * 0.1) ? 'about the same' : change < 0 ? 'smaller' : 'bigger';
      tr.append(el('td', m[1]), el('td', a.toFixed(1) + '%', 'num'), el('td', z.toFixed(1) + '%', 'num'), el('td', word, 'trend ' + (word === 'smaller' ? 'good' : word === 'bigger' ? 'bad' : '')));
      body.appendChild(tr);
    });
    if (!body.children.length) { const tr = document.createElement('tr'); tr.appendChild(el('td', 'Nothing has cost you DPS worth listing. Well played.')); body.appendChild(tr); }
    t.appendChild(body);
    t.className = 'progress-table';
    box.appendChild(t);
    box.appendChild(el('p', 'Each mistake as the share of your DPS it cost, on average, from the review\'s "What it cost you". Estimates, like that list.', 'hint'));
  }
  box.appendChild(el('p', 'Kept in this browser only. Fights with infinite health are not counted: their length is your choice.', 'hint'));
}

// A line of daily averages with each day's range behind it, a dashed line at 100% (the sim), hover for the numbers.
function dayChart(dayKeys, byDay) {
  const NS = 'http://www.w3.org/2000/svg', W = 600, H = 170, padL = 34, padR = 10, padT = 10, padB = 22;
  const lows = dayKeys.map(function (d) { return Math.min.apply(null, byDay[d]); }), highs = dayKeys.map(function (d) { return Math.max.apply(null, byDay[d]); });
  const means = dayKeys.map(function (d) { return average(byDay[d]); });
  let low = Math.min(100, Math.min.apply(null, lows)), high = Math.max(100, Math.max.apply(null, highs));
  low = Math.max(0, Math.floor((low - 5) / 10) * 10); high = Math.ceil((high + 3) / 10) * 10;
  const x = function (i) { return padL + (W - padL - padR) * (dayKeys.length === 1 ? 0.5 : i / (dayKeys.length - 1)); };
  const y = function (v) { return padT + (H - padT - padB) * (1 - (v - low) / Math.max(1, high - low)); };
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.setAttribute('class', 'graph progress-graph');
  function node(tag, attrs) { const n = document.createElementNS(NS, tag); Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); }); svg.appendChild(n); return n; }
  // Grid lines every 10 points, labelled; 100% (the sim) dashed and brighter.
  for (let v = low; v <= high; v += 10) {
    node('line', { x1: padL, x2: W - padR, y1: y(v), y2: y(v), stroke: v === 100 ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.09)', 'stroke-width': 1, 'stroke-dasharray': v === 100 ? '4 3' : '' });
    const t = node('text', { x: padL - 6, y: y(v) + 3.5, 'text-anchor': 'end', class: 'axis' });
    t.textContent = v + '%';
  }
  // Each day's range, lowest to highest fight.
  dayKeys.forEach(function (d, i) { if (highs[i] > lows[i]) node('line', { x1: x(i), x2: x(i), y1: y(lows[i]), y2: y(highs[i]), stroke: 'rgba(185,138,255,0.35)', 'stroke-width': 6, 'stroke-linecap': 'round' }); });
  node('polyline', { points: means.map(function (v, i) { return x(i).toFixed(1) + ',' + y(v).toFixed(1); }).join(' '), fill: 'none', stroke: '#b98aff', 'stroke-width': 2, 'stroke-linejoin': 'round' });
  dayKeys.forEach(function (d, i) {
    node('circle', { cx: x(i), cy: y(means[i]), r: 4, fill: '#b98aff', stroke: '#140d1d', 'stroke-width': 2 });
    const hit = node('rect', { x: x(i) - 12, y: padT, width: 24, height: H - padT - padB, fill: 'transparent' });
    setTip(hit, function () {
      const n = byDay[d].length;
      return { title: dayName(d), text: Math.round(means[i]) + '% of the sim on average' + (n > 1 ? ' over ' + n + ' fights, from ' + lows[i] + '% to ' + highs[i] + '%' : ' (one fight)') };
    });
  });
  // The first and the last day under the line, and the middle one when there is room.
  [0, Math.floor((dayKeys.length - 1) / 2), dayKeys.length - 1].filter(function (v, i, a) { return a.indexOf(v) === i; }).forEach(function (i) {
    const t = node('text', { x: x(i), y: H - 6, 'text-anchor': i === 0 ? 'start' : i === dayKeys.length - 1 ? 'end' : 'middle', class: 'axis' });
    t.textContent = dayName(dayKeys[i]);
  });
  const wrap = el('div');
  wrap.appendChild(svg);
  const key = el('p', null, 'graph-key');
  const a = el('span', 'Your average that day'); a.insertBefore(el('i'), a.firstChild); key.appendChild(a);
  const r = el('span', 'Lowest to highest fight that day'); r.insertBefore(el('i', null, 'range'), r.firstChild); key.appendChild(r);
  key.appendChild(el('span', 'Dashed: the sim (100%)'));
  wrap.appendChild(key);
  return wrap;
}
