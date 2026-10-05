// The three panels that are more than a list: fight options, import from the DPS sim, and the review after a fight.

function byId(id) { return document.getElementById(id); }
function whole(n) { return Math.round(n).toLocaleString('en-US'); }
function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  if (className) node.className = className;
  return node;
}

const AURA_NAMES = { coe: 'Curse of the Elements', isb: 'Improved Shadow Bolt', brand: 'Demonic Brand' };
const PET_ATTACK = { 'pet:firebolt': 'Firebolt', 'pet:lashOfPain': 'Lash of Pain', 'pet:melee': 'Melee', 'pet:brand': 'Demonic Brand' };

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

    const head = el('p', null, 'review-head');
    head.appendChild(el('b', whole(dps) + ' DPS'));
    head.appendChild(document.createTextNode(' in ' + d.seconds.toFixed(1) + ' s'));
    if (sim) head.appendChild(document.createTextNode('  ·  the sim: ' + whole(sim.dps) + ' DPS  ·  you reached ' + Math.round(100 * dps / sim.dps) + '%'));
    else head.appendChild(document.createTextNode('  ·  the sim\'s numbers are still being worked out'));
    body.appendChild(head);

    // Where the time went.
    const idle = Math.max(0, d.seconds - k.busy), notes = [];
    notes.push(['Not casting', idle.toFixed(1) + ' s (' + pct(idle, d.seconds) + ' of the fight)', sim ? sim.idle.toFixed(1) + ' s' : '']);
    if (k.moved > 0) notes.push(['Made to move', k.moved.toFixed(1) + ' s', '']);
    if (k.interrupts) notes.push(['Casts you stopped by moving', String(k.interrupts), '']);
    if (k.pushbacks) notes.push(['Pushed back by hits', k.pushbackTime.toFixed(1) + ' s (' + k.pushbacks + ' times)', sim && sim.pushbackTime != null ? sim.pushbackTime.toFixed(1) + ' s' : '']);
    notes.push(['Life Taps', String(k.lifeTaps), sim ? sim.lifeTaps.toFixed(1) : '']);
    if (k.wasted >= 1) notes.push(['Mana not regained (bar was full)', whole(k.wasted), '']);
    if (d.hasPet) notes.push([d.petName + ' attacking', pct(k.petActive, d.seconds) + ' of the fight', sim ? '100%' : '']);
    body.appendChild(el('h3', 'Time'));
    body.appendChild(table(['', 'You', 'Sim'], notes.map(function (n) { return { cells: n }; })));

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
