// The three panels that are more than a list: fight options, import from the DPS sim, and the review after a fight.
import { drawTimeline } from './timeline.js';

function byId(id) { return document.getElementById(id); }
function whole(n) { return Math.round(n).toLocaleString('en-US'); }
function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  if (className) node.className = className;
  return node;
}

const AURA_NAMES = { coe: 'Curse of the Elements', isb: 'Improved Shadow Bolt', brand: 'Demonic Brand' };
const PET_ATTACK = { 'pet:firebolt': 'Firebolt', 'pet:lashOfPain': 'Lash of Pain', 'pet:melee': 'Melee', 'pet:windfury': 'Windfury attack', 'pet:brand': 'Demonic Brand' };

export function createPanels(handlers) {
  // ---------- fight options ----------
  const form = byId('fightForm');
  const field = { seconds: byId('fightSeconds'), moveEvery: byId('moveEvery'), moveDuration: byId('moveDuration'), hitEvery: byId('hitEvery') };
  function number(input, low, high) { const v = Number(input.value); return isFinite(v) ? Math.max(low, Math.min(high, v)) : low; }
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    handlers.onFight({
      timed: form.elements.mode.value === 'timed',
      seconds: Math.round(number(field.seconds, 10, 1800)),
      moveEvery: number(field.moveEvery, 0, 600), moveDuration: number(field.moveDuration, 0, 60),
      hitEvery: number(field.hitEvery, 0, 60)
    });
  });
  function setFight(o) {
    form.elements.mode.value = o.timed ? 'timed' : 'health';
    field.seconds.value = o.seconds; field.moveEvery.value = o.moveEvery; field.moveDuration.value = o.moveDuration; field.hitEvery.value = o.hitEvery;
  }

  // ---------- import ----------
  const buildBox = byId('importBuild'), settingsBox = byId('importSettings'), status = byId('importStatus');
  byId('importApply').addEventListener('click', function () { handlers.onImport(buildBox.value.trim(), settingsBox.value.trim()); });
  byId('importClear').addEventListener('click', function () { buildBox.value = ''; settingsBox.value = ''; handlers.onImport('', ''); });
  function setImport(buildCode, settingsCode, lines, bad) {
    buildBox.value = buildCode || ''; settingsBox.value = settingsCode || '';
    status.textContent = '';
    (lines || []).forEach(function (line) { status.appendChild(el('span', line)); status.appendChild(document.createElement('br')); });
    status.classList.toggle('bad', !!bad);
  }

  // ---------- review ----------
  const review = byId('review'), body = byId('reviewBody');
  byId('reviewClose').addEventListener('click', function () { review.hidden = true; });
  byId('btnReview').addEventListener('click', function () { handlers.onReview(); });

  function table(head, rows) {
    const t = document.createElement('table'), thead = document.createElement('thead'), tr = document.createElement('tr');
    head.forEach(function (h, i) { const th = el('th', h); if (i) th.className = 'num'; tr.appendChild(th); });
    thead.appendChild(tr);
    t.appendChild(thead);
    const tbody = document.createElement('tbody');
    rows.forEach(function (r) {
      const row = document.createElement('tr');
      r.cells.forEach(function (c, i) { const td = el('td', c); if (i) td.className = 'num'; row.appendChild(td); });
      if (r.mark) row.className = r.mark;
      tbody.appendChild(row);
    });
    t.appendChild(tbody);
    return t;
  }
  function pct(part, of) { return of > 0 ? Math.round(100 * part / of) + '%' : '-'; }

  // d: { seconds, result (from the casting rules), sim (from the worker, or null), spells, petName, dummyName(i),
  //      targets, timed, hasPet }
  function showReview(d) {
    const res = d.result, k = res.track, sim = d.sim, dps = d.seconds > 0 ? res.total / d.seconds : 0;
    body.textContent = '';

    // A drill or seeded fight: its grade, and a line to pass on.
    if (d.challenge) {
      const c = d.challenge, line = el('div', null, 'challenge-line');
      if (c.waiting) line.appendChild(el('span', c.name + ': the grade comes when the fight is over and the sim has its numbers.'));
      else {
        line.appendChild(el('b', c.grade));
        line.appendChild(el('span', c.name + ': ' + c.pct + '% of the sim.' + (c.record ? ' A new best.' : c.best ? ' Your best: ' + c.best.grade + ' (' + c.best.pct + '%).' : '')));
        const copy = el('button', 'Copy the result');
        copy.type = 'button';
        copy.addEventListener('click', function () { d.copy(c.line, copy); });
        line.appendChild(copy);
        if (c.link) {
          const link = el('button', 'Copy a link to this fight');
          link.type = 'button';
          link.title = 'Whoever opens the link gets the same build, race and challenge';
          link.addEventListener('click', function () { d.copy(c.link, link); });
          line.appendChild(link);
        }
      }
      body.appendChild(line);
    }

    const head = el('p', null, 'review-head');
    head.appendChild(el('b', whole(dps) + ' DPS'));
    head.appendChild(document.createTextNode(' in ' + d.seconds.toFixed(1) + ' s'));
    if (sim) head.appendChild(document.createTextNode('  ·  the sim: ' + whole(sim.dps) + ' DPS  ·  you reached ' + Math.round(100 * dps / sim.dps) + '%'));
    else head.appendChild(document.createTextNode('  ·  the sim\'s numbers are still being worked out'));
    body.appendChild(head);
    // Your best in this very fight (same build, race, dummies and fight options), outside challenges.
    if (d.best) {
      const b = d.best;
      body.appendChild(el('p', b.record ? (b.previous ? 'A new best for this fight. Before: ' + whole(b.previous.dps) + ' DPS.' : 'Your first result for this fight: it is your best for now.')
        : 'Your best in this fight: ' + whole(b.best.dps) + ' DPS' + (b.best.pct ? ' (' + b.best.pct + '% of the sim).' : '.'), 'best-line' + (b.record ? ' record' : '')));
    }

    // Damage over time: you against the sim's average fight.
    const yourCurve = d.curve || [], simCurve = sim && sim.curve ? sim.curve : null;
    if (yourCurve.length > 2) {
      const span = Math.max(yourCurve.length - 1, simCurve ? simCurve.length - 1 : 0, 1);
      const top = Math.max(yourCurve[yourCurve.length - 1], simCurve ? simCurve[simCurve.length - 1] : 0, 1), W = 600, H = 150, pad = 4;
      const points = function (curve) {
        return curve.map(function (v, i) { return (pad + (W - 2 * pad) * i / span).toFixed(1) + ',' + (H - pad - (H - 2 * pad) * v / top).toFixed(1); }).join(' ');
      };
      const NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.setAttribute('preserveAspectRatio', 'none'); svg.setAttribute('class', 'graph');
      const line = function (curve, color, width) {
        const p = document.createElementNS(NS, 'polyline');
        p.setAttribute('points', points(curve)); p.setAttribute('fill', 'none'); p.setAttribute('stroke', color);
        p.setAttribute('stroke-width', width); p.setAttribute('vector-effect', 'non-scaling-stroke'); p.setAttribute('stroke-linejoin', 'round');
        svg.appendChild(p);
      };
      if (simCurve) line(simCurve, 'rgba(255,255,255,0.6)', '1.5');
      line(yourCurve, '#b98aff', '2');
      body.appendChild(el('h3', 'Damage over time'));
      body.appendChild(svg);
      const key = el('p', null, 'graph-key');
      const you = el('span', 'You'); you.insertBefore(el('i'), you.firstChild);
      key.appendChild(you);
      if (simCurve) { const s = el('span', 'The sim (average of its fights)'); s.insertBefore(el('i', null, 'sim'), s.firstChild); key.appendChild(s); }
      key.appendChild(el('span', '0 s to ' + span + ' s, up to ' + whole(top) + ' damage'));
      body.appendChild(key);
    }

    // The fight from left to right: your casts, the sim's, and when each DoT was up.
    if (d.record && d.record.casts.length) {
      body.appendChild(el('h3', 'Timeline'));
      body.appendChild(drawTimeline({ record: d.record, seconds: d.seconds, simCasts: sim && sim.casts, spells: d.spells, icon: d.icon, clips: k.clips,
                                      racialName: d.racialName, targets: d.targets, dummyName: d.dummyName, width: Math.min(640, window.innerWidth * 0.92) - 32 - 112 }));
      body.appendChild(el('p', 'Red: nothing was cast. Grey: you were made to move. A dim picture: the cast was stopped. A red notch on a DoT\'s line: it was cast over there. "The sim" is one of its own fights' +
        (d.sameDice ? ', with the same dice as yours.' : ', with other dice than yours: read it for the order of things, not second by second.') + ' Hover anything to read it.', 'graph-key'));
    }

    // Where the time went.
    const idle = Math.max(0, d.seconds - k.busy), notes = [];
    // How the fight was opened: a precast, and how close to the pull timer's zero you were.
    if (d.precast) notes.push(['Precast', (d.spells[d.precast] ? d.spells[d.precast].name : d.precast) + (k.first > 0.005 ? ', landed ' + k.first.toFixed(2) + ' s into the fight' : ', landed as the fight began'),
                              sim ? (sim.precast === d.precast ? 'the same spell, landing at 0 s' : 'not worked out with it yet') : '']);
    if (d.pull) notes.push(['Pull timer (' + d.pull.seconds + ' s)', d.pull.early > 0.005 ? 'you pulled ' + d.pull.early.toFixed(2) + ' s early'
                              : k.first != null ? 'your first spell took effect ' + k.first.toFixed(2) + ' s after the pull' : 'no spell cast yet', '']);
    notes.push(['Not casting', idle.toFixed(1) + ' s (' + pct(idle, d.seconds) + ' of the fight)', sim ? sim.idle.toFixed(1) + ' s' : '']);
    if (k.moved > 0) notes.push(['Made to move', k.moved.toFixed(1) + ' s', '']);
    if (k.interrupts) notes.push(['Casts you stopped by moving', String(k.interrupts), '']);
    if (k.pushbacks) notes.push(['Pushed back by hits', k.pushbackTime.toFixed(1) + ' s (' + k.pushbacks + ' times)', sim && sim.pushbackTime != null ? sim.pushbackTime.toFixed(1) + ' s' : '']);
    notes.push(['Threat a second', whole(d.seconds > 0 ? (res.threat || 0) / d.seconds : 0), sim && sim.tps != null ? whole(sim.tps) : '']);
    if (d.health) notes.push(['Lowest health (of ' + whole(d.health.max) + ')', whole(Math.max(0, d.health.min)), sim && sim.health ? whole(Math.max(0, sim.health.min)) + ' at its lowest in any fight' : '']);
    if (d.hasPet) notes.push([d.petName + ' attacking', pct(k.petActive, d.seconds) + ' of the fight', sim ? '100%' : '']);
    body.appendChild(el('h3', 'Time'));
    body.appendChild(table(['', 'You', 'Sim'], notes.map(function (n) { return { cells: n }; })));

    // Mana: how it went over the fight, what Life Tap gave and cost, what was left.
    if (d.mana) {
      const m = d.mana, sm = sim && sim.mana, NS = 'http://www.w3.org/2000/svg';
      body.appendChild(el('h3', 'Mana'));
      if (m.curve.length > 2) {
        const W = 600, H = 70, pad = 4, span = Math.max(m.curve.length - 1, 1), svg = document.createElementNS(NS, 'svg');
        svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.setAttribute('preserveAspectRatio', 'none'); svg.setAttribute('class', 'graph mana-graph');
        const x = function (t) { return pad + (W - 2 * pad) * Math.min(t, span) / span; };
        // Each Life Tap: a line from the top.
        ((d.record && d.record.casts) || []).filter(function (c) { return c.key === 'lifeTap' && c.t >= 0; }).forEach(function (c) {
          const mark = document.createElementNS(NS, 'line');
          mark.setAttribute('x1', x(c.t).toFixed(1)); mark.setAttribute('x2', x(c.t).toFixed(1)); mark.setAttribute('y1', '0'); mark.setAttribute('y2', String(H));
          mark.setAttribute('stroke', 'rgba(240,207,122,0.55)'); mark.setAttribute('stroke-width', '1'); mark.setAttribute('vector-effect', 'non-scaling-stroke');
          svg.appendChild(mark);
        });
        const line = document.createElementNS(NS, 'polyline');
        line.setAttribute('points', m.curve.map(function (v, i) { return x(i).toFixed(1) + ',' + (H - pad - (H - 2 * pad) * Math.max(0, Math.min(v, m.max)) / m.max).toFixed(1); }).join(' '));
        line.setAttribute('fill', 'none'); line.setAttribute('stroke', '#6f9bff'); line.setAttribute('stroke-width', '2');
        line.setAttribute('vector-effect', 'non-scaling-stroke'); line.setAttribute('stroke-linejoin', 'round');
        svg.appendChild(line);
        body.appendChild(svg);
        const key = el('p', null, 'graph-key');
        const you = el('span', 'Your mana, 0 to ' + whole(m.max)); you.insertBefore(el('i', null, 'mana'), you.firstChild);
        key.appendChild(you);
        if (k.lifeTaps) { const taps = el('span', 'A Life Tap'); taps.insertBefore(el('i', null, 'tap'), taps.firstChild); key.appendChild(taps); }
        body.appendChild(key);
      }
      const rows = [];
      rows.push(['Life Taps', String(k.lifeTaps), sim ? sim.lifeTaps.toFixed(1) : '']);
      if (k.lifeTaps || (sm && sm.tapMana >= 1)) rows.push(['Mana from Life Taps', whole(k.tapMana), sm ? whole(sm.tapMana) : '']);
      if (k.tapLost >= 1) rows.push(['Lost because the bar was too full when you tapped', whole(k.tapLost), '']);
      if (k.tapsMoving || (sm && sm.movingTaps >= 0.05)) rows.push(['Life Taps while you had to move anyway', String(k.tapsMoving), sm ? sm.movingTaps.toFixed(1) : '']);
      rows.push(['Mana spent on spells', whole(k.spent), '']);
      rows.push(['Lowest mana', whole(Math.max(0, k.minMana)), sm ? whole(Math.max(0, sm.min)) : '']);
      rows.push([d.over ? 'Mana left at the end' : 'Mana right now', whole(Math.max(0, m.end)), sm ? whole(Math.max(0, sm.end)) : '']);
      if (k.noMana) rows.push(['Presses that failed for lack of mana', String(k.noMana), '']);
      if (k.spirit >= 1 || (sim && sim.spirit >= 1)) rows.push(['Mana from Spirit (while none was spent for 5 s)', whole(k.spirit || 0), sim && sim.spirit != null ? whole(sim.spirit) : '']);
      if (k.wasted >= 1) rows.push(['Mana not regained (bar was full)', whole(k.wasted), '']);
      body.appendChild(table(['', 'You', 'Sim'], rows.map(function (n) { return { cells: n }; })));
      // What stands out, in a sentence each.
      const says = [], spare = d.over && m.gain > 0 ? Math.min(k.lifeTaps, Math.floor(m.end / m.gain)) : 0;
      if (spare >= 1) says.push('You ended with ' + whole(m.end) + ' mana: about ' + (spare === 1 ? 'one Life Tap' : spare + ' Life Taps') + ' more than you needed. Each costs a global cooldown' + (m.tapHealth ? ' and ' + whole(m.tapHealth) + ' health' : '') + '.');
      if (k.noMana) says.push('You ran dry ' + (k.noMana === 1 ? 'once' : k.noMana + ' times') + ': tap a little earlier, best while you have to move or a DoT is about to run out anyway.');
      if (k.tapLost >= 1) says.push(whole(k.tapLost) + ' mana from Life Tap was lost to a full bar: one tap gives ' + whole(m.gain) + ', so wait until that much is missing.');
      if (m.rule) says.push('The sim\'s rule for this build: ' + m.rule.replace(/\s*\[A\d+\]/g, '') + '. It also taps whenever the next spell is not affordable.');
      if (says.length) body.appendChild(el('p', says.join(' '), 'hint'));
    }

    // Spell by spell, all dummies together.
    const mine = {}, theirs = {};
    function add(into, rows) {
      Object.keys(rows || {}).forEach(function (key) {
        const base = key.replace(/^x\d:/, ''), r = into[base] || (into[base] = { casts: 0, dmg: 0 });
        r.casts += rows[key].casts || 0; r.dmg += rows[key].dmg || 0;
      });
    }
    add(mine, res.bySpell);
    if (sim) add(theirs, sim.bySpell);
    function label(key) {
      if (d.spells[key]) return d.spells[key].name;
      if (key === 'touchOfTheGrave') return 'Touch of the Grave';
      if (PET_ATTACK[key]) return key === 'pet:brand' ? 'Demonic Brand' : d.petName + ': ' + PET_ATTACK[key];
      return key;
    }
    const keys = Object.keys(Object.assign({}, mine, theirs)).filter(function (key) { return (mine[key] && (mine[key].dmg > 0 || mine[key].casts > 0)) || (theirs[key] && theirs[key].dmg > 0.5); })
      .sort(function (a, b) { return ((theirs[b] || mine[b]).dmg || 0) - ((theirs[a] || mine[a]).dmg || 0); });
    const spellRows = keys.map(function (key) {
      const m = mine[key] || { casts: 0, dmg: 0 }, s = theirs[key];
      const diff = s ? m.dmg - s.dmg : 0;
      return {
        cells: [label(key), String(Math.round(m.casts)), s ? s.casts.toFixed(1) : '', whole(m.dmg), s ? whole(s.dmg) : '', s ? (diff >= 0 ? '+' : '') + whole(diff) : ''],
        mark: s && s.dmg > 0 && diff < -0.02 * (sim.dps * sim.seconds) ? 'behind' : ''
      };
    });
    body.appendChild(el('h3', 'Spells'));
    body.appendChild(table(['', 'Your casts', 'Sim', 'Your damage', 'Sim', 'Difference'], spellRows));

    // How long each DoT and debuff was on each dummy.
    const upRows = [];
    for (let i = 1; i <= d.targets; i++) {
      const names = {};
      Object.keys(k.uptime).forEach(function (id) { if (id.indexOf(i + ':') === 0) names[id.slice(2)] = true; });
      if (sim) Object.keys(sim.uptime).forEach(function (id) {
        const m = i === 1 ? /^(?:dot:(.+)|(coe|isb|brand))$/.exec(id) : new RegExp('^(?:dot' + i + ':(.+)|deb' + i + ':(.+))$').exec(id);
        if (m && sim.uptime[id] >= 0.5) names[m[1] || m[2]] = true;
      });
      Object.keys(names).forEach(function (name) {
        const simKey = i === 1 ? (AURA_NAMES[name] ? name : 'dot:' + name) : (AURA_NAMES[name] ? 'deb' + i + ':' + name : 'dot' + i + ':' + name);
        const yours = 100 * (k.uptime[i + ':' + name] || 0) / d.seconds, simPct = sim ? sim.uptime[simKey] : null;
        upRows.push({
          cells: [(d.spells[name] ? d.spells[name].name : AURA_NAMES[name] || name) + (d.targets > 1 ? ' on ' + d.dummyName(i) : ''), Math.round(yours) + '%', simPct != null ? Math.round(simPct) + '%' : ''],
          mark: simPct != null && yours < simPct - 10 ? 'behind' : ''
        });
      });
    }
    if (upRows.length) {
      body.appendChild(el('h3', 'How long it was up'));
      body.appendChild(table(['', 'You', 'Sim'], upRows));
    }

    // DoTs cast over while they still had time left: the ticks that were left are lost.
    const clipped = {};
    (k.clips || []).forEach(function (c) {
      const id = c.target + ':' + c.key + ':' + c.by, g = clipped[id] || (clipped[id] = { key: c.key, by: c.by, target: c.target, times: 0, ticks: 0, left: 0 });
      g.times++; g.ticks += c.ticks; g.left += c.left;
    });
    const clipRows = Object.keys(clipped).map(function (id) {
      const g = clipped[id], row = res.bySpell[(g.target > 1 ? 'x' + g.target + ':' : '') + g.key];
      const perTick = row && row.ticks > 0 ? row.dmg / row.ticks : 0;
      return {
        cells: [label(g.key) + (d.targets > 1 ? ' on ' + d.dummyName(g.target) : '') + (g.by !== g.key ? ', pushed off by ' + label(g.by) : ', cast again'),
                String(g.times), (g.left / g.times).toFixed(1) + ' s', String(g.ticks), perTick > 0 && g.ticks ? 'about ' + whole(perTick * g.ticks) : '-'],
        mark: g.by === g.key && g.ticks > 0 ? 'behind' : ''
      };
    });
    if ((k.clips || []).length || upRows.length) {
      body.appendChild(el('h3', 'DoTs cast over early'));
      if (clipRows.length) {
        body.appendChild(table(['', 'Times', 'Time left (average)', 'Ticks cut off', 'Their damage'], clipRows));
        body.appendChild(el('p', 'A DoT cast again before it has run out loses the ticks it had left; the new one starts counting afresh. The sim never does it: it starts a cast so that it lands as the old DoT ends, and recasts an instant one when it is gone. "Their damage" is those ticks at this fight\'s average tick - an estimate. Cutting a tick can still be right, before you have to move for example.', 'hint'));
      } else body.appendChild(el('p', 'None: no DoT was cast again while it still had ticks left.', 'hint'));
    }
    body.appendChild(el('p', d.timed
      ? 'The sim fought for the same length of time with its priority list, many times over; its numbers are averages.'
      : 'The sim fought until it had dealt the same total health with its priority list, many times over; its numbers are averages. Its pet attacks from the first second.', 'hint'));
    review.hidden = false;
  }

  return {
    setFight: setFight, setImport: setImport, showReview: showReview,
    hideReview: function () { review.hidden = true; },
    reviewOpen: function () { return !review.hidden; }
  };
}
