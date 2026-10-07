// The review's timeline: the fight from left to right. One line with what you cast (and where nothing was cast),
// one with what the sim cast in one of its own fights, and a line per DoT showing when it was on a dummy.

function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function secs(t) { return (Math.round(t * 10) / 10).toFixed(1) + ' s'; }
function clock(t) { return (t < 0 ? '−' : '') + Math.floor(Math.abs(t) / 60) + ':' + String(Math.floor(Math.abs(t) % 60)).padStart(2, '0'); }

const AURA_NAMES = { coe: 'Curse of the Elements', baneOfHavoc: 'Bane of Havoc' };
const ROW = { axis: 16, casts: 34, aura: 13 };

// d: { record: { casts, auras, moves, seconds } (js/record.js), seconds, simCasts: [{ t, k, d }] or null,
//      spells, icon(key) -> address, racialName, targets, dummyName(i), width (pixels there are for it) }
export function drawTimeline(d) {
  const rec = d.record, seconds = Math.max(d.seconds, 1), start = Math.floor(Math.min(0, ...rec.casts.map(c => c.t)));
  const px = Math.max(14, Math.min(30, (d.width - 20) / (seconds - start))), x = t => (t - start) * px;
  const width = Math.ceil((seconds - start) * px) + 20, wrap = el('div', null, 'timeline'), names = el('div', null, 'tl-names');
  const scroll = el('div', null, 'tl-scroll'), inner = el('div', null, 'tl-inner');
  inner.style.width = width + 'px';
  inner.dataset.pixelsPerSecond = String(px);
  inner.dataset.startTime = String(start);
  let top = 0;
  function row(label, height, className) {
    const name = el('div', label, 'tl-name');
    name.style.height = height + 'px';
    names.appendChild(name);
    const line = el('div', null, 'tl-row' + (className ? ' ' + className : ''));
    line.style.top = top + 'px'; line.style.height = height + 'px';
    inner.appendChild(line);
    top += height;
    return line;
  }
  function block(line, from, to, className, title) {
    const b = el('i', null, className);
    b.style.left = x(from).toFixed(1) + 'px';
    b.style.width = Math.max(1, (to - from) * px).toFixed(1) + 'px';
    if (title) b.title = title;
    line.appendChild(b);
    return b;
  }
  function spellName(key) { return key === 'racial' ? d.racialName || 'Racial' : d.spells[key] ? d.spells[key].name : key; }

  // The clock along the top.
  const axis = row('', ROW.axis, 'tl-axis');
  const step = seconds > 150 ? 30 : 10, times = start < 0 ? [start] : [];
  for (let t = 0; t <= seconds + 0.01; t += step) times.push(t);
  times.forEach(function (t) {
    const tick = el('span', clock(t));
    tick.style.left = x(t).toFixed(1) + 'px';
    axis.appendChild(tick);
  });
  if (start < 0) {
    const pull = el('div', null, 'tl-pull'); pull.style.left = x(0) + 'px'; pull.title = 'Pull · 0:00'; inner.appendChild(pull);
  }

  // One line of casts: a bar as long as the cast (or the global cooldown), with the spell's picture at its start.
  function castRow(label, casts, sim) {
    const line = row(label, ROW.casts, sim ? 'tl-casts sim' : 'tl-casts');
    let free = 0;
    casts.forEach(function (c) {
      if (!sim && !c.off) {
        if (c.t - free > 0.3) block(line, free, c.t, 'idle', 'Nothing cast for ' + secs(c.t - free) + ' (from ' + secs(free) + ')');
        free = Math.max(free, c.t + Math.max(c.len, c.gcd || 0)); // precasts never create pre-pull idle time
      }
      const where = c.target && d.targets > 1 ? ' on ' + d.dummyName(c.target) : '';
      const what = c.kind === 'channel' ? ', channelled ' + secs(c.len) : c.len > 0.005 ? ', ' + secs(c.len) + ' cast' : '';
      const title = spellName(c.key) + ' at ' + secs(c.t) + what + where +
        (c.stopped ? c.stopped === 'clipped' ? ' – cut short by your next cast' : ' – stopped' : '') + (c.pushed ? ' – pushed back ' + secs(c.pushed) : '');
      if (c.len > 0.005) block(line, c.t, c.t + c.len, (c.kind === 'channel' ? 'chan' : 'cast') + (c.stopped && c.stopped !== 'clipped' ? ' stopped' : ''), title);
      const icon = d.icon(c.key), img = icon ? document.createElement('img') : el('b', spellName(c.key).charAt(0));
      if (icon) { img.src = icon; img.alt = ''; }
      img.title = title;
      img.style.left = x(c.t).toFixed(1) + 'px';
      if (c.off) img.className = 'off';
      if (c.stopped && c.stopped !== 'clipped') img.classList.add('stopped');
      line.appendChild(img);
    });
    if (!sim && seconds - free > 0.3) block(line, free, seconds, 'idle', 'Nothing cast for ' + secs(seconds - free) + ' (from ' + secs(free) + ')');
    return line;
  }
  const mine = castRow('You', rec.casts, false);
  rec.moves.forEach(function (m) { block(mine, m[0], m[1], 'moved', 'Made to move for ' + secs(m[1] - m[0])); });
  if (d.simCasts && d.simCasts.length) {
    castRow('The sim', d.simCasts.filter(function (c) { return c.t <= seconds + 0.01; }).map(function (c) {
      const m = /^x(\d):(.+)$/.exec(c.k);
      return { t: c.t, key: m ? m[2] : c.k, target: m ? Number(m[1]) : 1, len: c.d || 0, kind: c.ch ? 'channel' : c.d > 0 ? 'cast' : 'instant', off: c.k === 'baneOfHavoc' };
    }), true);
  }
  if (rec.clips?.length) {
    const line = row('Clipped DoTs', 22, 'tl-clips');
    rec.clips.forEach(function (c) {
      const mark = el('button', '×'); mark.type = 'button';
      mark.style.left = x(c.t).toFixed(1) + 'px';
      mark.title = spellName(c.key) + ' · target ' + c.target + ' at ' + secs(c.t) + ': ' + secs(c.left) + ' / ' + c.ticks + ' ticks left; replaced by ' + spellName(c.replacement);
      mark.setAttribute('aria-label', mark.title); line.appendChild(mark);
    });
  }

  // When each DoT was on each dummy.
  Object.keys(rec.auras).sort().forEach(function (id) {
    const target = Number(id.charAt(0)), key = id.slice(2), spans = rec.auras[id];
    if (!spans.length) return;
    const name = (d.spells[key] ? d.spells[key].name : AURA_NAMES[key] || key) + (d.targets > 1 ? ' · ' + target : '');
    const line = row(name, ROW.aura, 'tl-aura' + (d.spells[key] && d.spells[key].school === 'fire' ? ' fire' : ''));
    spans.forEach(function (s) { block(line, s[0], Math.min(s[1], seconds), '', name + ': ' + secs(s[0]) + ' to ' + secs(s[1])); });
  });

  inner.style.height = top + 'px';
  scroll.appendChild(inner);
  wrap.append(names, scroll);
  return wrap;
}
